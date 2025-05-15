import React, { useState, useEffect, useRef, useMemo, Dispatch, SetStateAction } from 'react';
import { FeatureCollection, Geometry } from 'geojson';
import HeatmapRenderer, { VariableConfig } from '@/components/map/heatmap-renderer';
import TimeControls from '@/components/ui/time-controls';
import InfoPanel from '@/components/ui/info-panel';
import { AllLoadedData, ProcessedStation, SiteDataResult, VariableKey, loadGeoJsonData, loadSiteAndTempData } from '@/lib/loaders/';
import { createSimpleGeoJSON } from '@/lib/utils';

export type LakeFeatureProperties = {
    name?: string;
    [key: string]: any;
} | null;

interface Station {
    id: string;
    name: string;
    longitude: number;
    latitude: number;
}

export type StationDataValues = Record<string, number | undefined>;
// type AllData = Record<string, Record<string, StationDataValues | undefined>>;
type DataRanges = Record<string, [number, number]>;

// Expected return type from loadGeoJsonData
interface GeoJsonResult {
    data: FeatureCollection<Geometry, LakeFeatureProperties> | null;
    error: string | null;
}

// Props for the inline VariableSelector component
interface VariableSelectorProps {
    variables: string[];
    selectedVar: string;
    onChange: Dispatch<SetStateAction<VariableKey>>;
    isLoading: boolean;
    variableConfig: Record<string, VariableConfig | undefined>;
}

/**
 * Main component for the Great Salt Lake Heatmap visualization.
 * It orchestrates data loading, state management, and renders UI sub-components.
 */
const GreatSaltLakeHeatmap: React.FC = () => {
    const [lakeData, setLakeData] = useState<FeatureCollection<Geometry, LakeFeatureProperties> | null>(null);
    const [stations, setStations] = useState<ProcessedStation[]>([]);
    const [timePoints, setTimePoints] = useState<string[]>([]);
    const [currentTimeIndex, setCurrentTimeIndex] = useState<number>(0);
    const [allData, setAllData] = useState<AllLoadedData>({});
    const [dataRanges, setDataRanges] = useState<DataRanges>({});
    const [selectedVariable, setSelectedVariable] = useState<VariableKey>('density');
    // const [availableVariables, setAvailableVariables] = useState<string[]>(['density']);
    const [availableVariables, setAvailableVariables] = useState<VariableKey[]>(['density']);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [playing, setPlaying] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [usingMockData, setUsingMockData] = useState<boolean>(false);
    const [retries, setRetries] = useState<number>(0);
    const MAX_RETRIES = 5;

    const playTimerRef = useRef<number | null>(null);

    const ANIMATION_INTERVAL = 500;

    const VARIABLE_CONFIGS = useMemo((): Record<string, VariableConfig> => ({
        density: {
            key: 'density', label: 'Density (Lab)', unit: 'g/cm³', precision: 3,
            interpolate: 'interpolateBlues', defaultRange: [1.0, 1.25]
        },
        salinity: {
            key: 'salinity', label: 'Salinity (EOS)', unit: 'g/L', precision: 1,
            interpolate: 'interpolateGreens', defaultRange: [50, 250]
        },
        temperature: { // Primarily for info display, not selectable for heatmap by default
            key: 'temperature', label: 'Avg Temp', unit: '°F', precision: 1,
            interpolate: 'interpolateOrRd', defaultRange: [0, 100]
        }
    }), []);

    useEffect(() => {
        const loadInitialData = async () => {
            setIsLoading(true);
            setError(null);
            setUsingMockData(false);
            let currentErrors: string[] = [];

            try {
                const geoJsonResult: GeoJsonResult = await loadGeoJsonData();
                setLakeData(geoJsonResult.data || createSimpleGeoJSON());
                if (geoJsonResult.error) currentErrors.push(geoJsonResult.error);
            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Error in GeoJSON loading:', err);
                currentErrors.push('Failed to load lake outline. Using simplified version.');
                setLakeData(createSimpleGeoJSON());
            }

            try {
                if (retries >= MAX_RETRIES) {
                    currentErrors.push('Max retries reached. Unable to load data.');
                    return;
                }

                console.log('GreatSaltLakeHeatmap: Loading site and temperature data...', await loadSiteAndTempData());

                const dataResult: SiteDataResult = await loadSiteAndTempData();
                if (dataResult.error) {
                    currentErrors.push(dataResult.error);
                    setRetries(prev => prev + 1);
                    return; // Retry logic can be handled here or in the calling function
                }
                setStations(dataResult.stations || []);
                setTimePoints(dataResult.timePoints || []);
                setAllData(dataResult.allData || {});
                setDataRanges(dataResult.dataRanges || {});

                const heatmapVars = Object.keys(dataResult.allData || {})
                    .filter((key): key is VariableKey =>
                        key in VARIABLE_CONFIGS && (key === 'density' || key === 'salinity') // Ensure config exists & is selectable
                    );

                setAvailableVariables(heatmapVars.length > 0 ? heatmapVars : ['density']);
                const defaultVar = 'density';
                const initialSelectedVar = heatmapVars.includes(defaultVar) ? defaultVar : (heatmapVars[0] || 'density');
                setSelectedVariable(initialSelectedVar);
                setCurrentTimeIndex(dataResult.timePoints && dataResult.timePoints.length > 0 ? dataResult.timePoints.length - 1 : 0);

                if (dataResult.usingMockData) setUsingMockData(true);
                if (dataResult.error) currentErrors.push(dataResult.error);

            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Error in site data loading:', err);
                currentErrors.push(`Failed to load site data. ${usingMockData ? "Using simulated data." : "No data to display."}`);
                // Fallback state for critical failure
                setStations([]);
                setTimePoints([]);
                setAllData({ density: {}, salinity: {}, temperature: {} }); // Ensure object structure
                setDataRanges({ density: VARIABLE_CONFIGS.density.defaultRange, salinity: VARIABLE_CONFIGS.salinity.defaultRange });
                setAvailableVariables(['density', 'salinity']); // Default available
                setSelectedVariable('density');
            }

            if (currentErrors.length > 0) setError(currentErrors.join('. '));
            setIsLoading(false);
        };

        loadInitialData();
    }, [VARIABLE_CONFIGS, usingMockData]); // Added VARIABLE_CONFIGS (stable) & usingMockData for error message context

    useEffect(() => {
        if (playing && timePoints.length > 0) {
            playTimerRef.current = setInterval(() => {
                setCurrentTimeIndex((prevIndex) => {
                    const nextIndex = prevIndex + 1;
                    if (nextIndex >= timePoints.length) {
                        setPlaying(false);
                        return timePoints.length - 1;
                    }
                    return nextIndex;
                });
            }, ANIMATION_INTERVAL);
        } else if (playTimerRef.current) {
            clearInterval(playTimerRef.current);
            playTimerRef.current = null;
        }
        return () => {
            if (playTimerRef.current) clearInterval(playTimerRef.current);
        };
    }, [playing, timePoints.length, ANIMATION_INTERVAL]);

    const currentTimePoint = useMemo(() => timePoints[currentTimeIndex] || '', [timePoints, currentTimeIndex]);

    const currentVariableData = useMemo(() => {
        console.log('selectedVariable', selectedVariable);

        return allData[selectedVariable] || {};
    }, [allData, selectedVariable]);

    const currentDataForTimepoint = useMemo(() => {
        const data = currentVariableData[currentTimePoint];
        return typeof data === 'object' && data !== null ? data : {};
    }, [currentVariableData, currentTimePoint]);

    const currentConfig = useMemo(() => {
        return VARIABLE_CONFIGS[selectedVariable] || {
            key: selectedVariable,
            label: selectedVariable.toUpperCase(),
            unit: '',
            precision: 2,
            interpolate: 'interpolateBlues',
            defaultRange: [0, 1]
        } as VariableConfig; // Fallback with type assertion
    }, [selectedVariable, VARIABLE_CONFIGS]);

    const currentRange = useMemo(() => {
        return dataRanges[selectedVariable] || currentConfig.defaultRange;
    }, [dataRanges, selectedVariable, currentConfig.defaultRange]);

    const currentTemperature = useMemo(() => {
        const tempTimePointData = allData.temperature?.[currentTimePoint];
        // Assuming temperature data is not per-station for this average display
        // If it can be a direct number or an object, adjust accordingly.
        // For now, assuming it's a single value for the timepoint if it exists.
        return typeof tempTimePointData === 'number' ? tempTimePointData : undefined;
    }, [allData, currentTimePoint]);


    // Inline VariableSelector Component
    const VariableSelector: React.FC<VariableSelectorProps> = ({ variables, selectedVar, onChange, isLoading, variableConfig }) => (
        <div className="mb-4 text-center">
            <label htmlFor="variable-select" className="mr-2 font-medium text-sm text-gray-700">
                Show:
            </label>
            <select
                id="variable-select"
                value={selectedVar}
                onChange={(e) => onChange(e.target.value as VariableKey)}
                disabled={isLoading || variables.length <= 1}
                className="py-1.5 px-3 pr-8 rounded border border-gray-300 text-sm shadow-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
            >
                {variables.map(variableKey => (
                    <option key={variableKey} value={variableKey}>
                        {variableConfig[variableKey]?.label || variableKey}
                        {variableConfig[variableKey]?.unit ? ` (${variableConfig[variableKey]?.unit})` : ''}
                    </option>
                ))}
            </select>
        </div>
    );

    // Stub for DataInformation, assuming it's simple or static
    const DataInformation: React.FC = () => {
        // If this component has content, it should be implemented here.
        // For now, returning null if it's just a placeholder.
        return null;
    };

    console.log('currentDataForTimepoint', currentDataForTimepoint);


    return (
        <div className="w-full h-full max-w-6xl mx-auto p-4 sm:p-6 bg-white rounded-lg shadow-xl flex flex-col">
            <header className="mb-4">
                <h2 className="text-2xl sm:text-3xl font-bold text-center text-blue-800">
                    Great Salt Lake Heatmap
                </h2>
                <p className="text-center text-gray-600 text-sm sm:text-base">
                    Monthly Chemical Conditions Visualization
                </p>
            </header>

            {error && (
                <div className="mb-4 p-3 text-center text-yellow-800 bg-yellow-100 rounded border border-yellow-300 text-sm" role="alert">
                    <strong>Warning:</strong> {error}
                </div>
            )}
            {usingMockData && !error && (
                <div className="mb-4 p-3 text-center text-blue-800 bg-blue-100 rounded border border-blue-300 text-sm" role="status">
                    <strong>Note:</strong> Using simulated or incomplete data for demonstration.
                </div>
            )}

            {availableVariables.length > 0 && ( // Only show selector if there are variables
                <VariableSelector
                    variables={availableVariables}
                    selectedVar={selectedVariable}
                    onChange={setSelectedVariable}
                    isLoading={isLoading}
                    variableConfig={VARIABLE_CONFIGS}
                />
            )}

            {/* Main content area: Visualization and Controls */}
            <div className="flex-grow mb-6 bg-gray-50 rounded-lg p-2 sm:p-4 shadow-inner relative flex flex-col min-h-[500px]"> {/* Ensure min-height for viz */}
                {isLoading && (
                    <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-20 rounded-lg">
                        <p className="text-xl text-blue-600 animate-pulse">Loading data...</p>
                    </div>
                )}
                <div className="flex-grow relative"> {/* This div will contain the HeatmapRenderer and allow it to size correctly */}
                    <HeatmapRenderer
                        lakeData={lakeData}
                        stations={stations}
                        currentDataForTimepoint={currentDataForTimepoint}
                        currentTemperature={currentTemperature}
                        currentRange={currentRange}
                        currentConfig={currentConfig}
                        currentTimePoint={currentTimePoint}
                        isLoading={isLoading}
                    />
                </div>
                {!isLoading && timePoints.length > 0 && ( // Only show time controls if not loading and data exists
                    <TimeControls
                        playing={playing}
                        setPlaying={setPlaying}
                        currentTimeIndex={currentTimeIndex}
                        setCurrentTimeIndex={setCurrentTimeIndex}
                        timePoints={timePoints}
                        currentTimePoint={currentTimePoint}
                        isLoading={isLoading}
                    />
                )}
            </div>

            <DataInformation />
            <InfoPanel />
        </div>
    );
};

export default GreatSaltLakeHeatmap;