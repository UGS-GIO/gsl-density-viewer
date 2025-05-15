import React, { useState, useEffect, useRef, useMemo, Dispatch, SetStateAction } from 'react';
import { FeatureCollection, Geometry } from 'geojson';
import HeatmapRenderer, { VariableConfig } from '@/components/map/heatmap-renderer';
import TimeControls from '@/components/ui/time-controls';
import InfoPanel from '@/components/ui/info-panel';
import { AllLoadedData, ProcessedStation, SiteDataResult, VariableKey, loadGeoJsonData, loadSiteAndTempData } from '@/lib/loaders/';
import { createSimpleGeoJSON } from '@/lib/utils';
import { ModeToggle } from '../mode-toggle';

export type LakeFeatureProperties = {
    name?: string;
    [key: string]: any;
} | null;


export type StationDataValues = Record<string, number | undefined>;
type DataRanges = Record<string, [number, number]>;

interface GeoJsonResult {
    data: FeatureCollection<Geometry, LakeFeatureProperties> | null;
    error: string | null;
}

interface VariableSelectorProps {
    variables: VariableKey[];
    selectedVar: VariableKey;
    onChange: Dispatch<SetStateAction<VariableKey>>;
    isLoading: boolean;
    variableConfig: Record<string, VariableConfig | undefined>;
}

/**
 * Main component for the Great Salt Lake Heatmap visualization.
 * Orchestrates data loading, state management, and renders UI sub-components.
 */
const GreatSaltLakeHeatmap: React.FC = () => {
    const [lakeData, setLakeData] = useState<FeatureCollection<Geometry, LakeFeatureProperties> | null>(null);
    const [stations, setStations] = useState<ProcessedStation[]>([]);
    const [timePoints, setTimePoints] = useState<string[]>([]);
    const [currentTimeIndex, setCurrentTimeIndex] = useState<number>(0);
    const [allData, setAllData] = useState<AllLoadedData>({} as AllLoadedData);
    const [dataRanges, setDataRanges] = useState<DataRanges>({});
    const [selectedVariable, setSelectedVariable] = useState<VariableKey>('density');
    const [availableVariables, setAvailableVariables] = useState<VariableKey[]>(['density']);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [playing, setPlaying] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [usingMockData, setUsingMockData] = useState<boolean>(false);
    const [retries, setRetries] = useState<number>(0); // Retries for data loading
    const MAX_RETRIES = 3; // Max retries for data loading

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
        let isMounted = true;

        const loadInitialData = async (attempt: number) => {
            if (!isMounted) return;
            setIsLoading(true);
            let currentErrors: string[] = [];

            try {
                const geoJsonResult: GeoJsonResult = await loadGeoJsonData();
                if (!isMounted) return;
                setLakeData(geoJsonResult.data || createSimpleGeoJSON());
                if (geoJsonResult.error) currentErrors.push(geoJsonResult.error);
            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Error in GeoJSON loading:', err);
                currentErrors.push('Failed to load lake outline. Using simplified version.');
                if (isMounted) setLakeData(createSimpleGeoJSON());
            }

            try {
                const dataResult: SiteDataResult = await loadSiteAndTempData();
                if (!isMounted) return;

                if (dataResult.error && attempt < MAX_RETRIES - 1) {
                    console.warn(`Data load attempt ${attempt + 1} failed: ${dataResult.error}. Retrying...`);
                    currentErrors.push(dataResult.error); // Keep error for now
                    setError(currentErrors.join('. ')); // Show intermediate error
                    setRetries(prev => prev + 1); // Trigger re-run via dependency change
                    return;
                }
                if (dataResult.error) { // Max retries reached or non-retryable error
                    currentErrors.push(dataResult.error);
                }

                setStations(dataResult.stations || []);
                setTimePoints(dataResult.timePoints || []);
                setAllData(dataResult.allData || ({} as AllLoadedData));
                setDataRanges(dataResult.dataRanges || {});

                const heatmapVars = Object.keys(dataResult.allData || {})
                    .filter((key): key is VariableKey =>
                        key in VARIABLE_CONFIGS && (key === 'density' || key === 'salinity')
                    );

                setAvailableVariables(heatmapVars.length > 0 ? heatmapVars : ['density']);
                const defaultVar: VariableKey = 'density';
                const initialSelectedVar = heatmapVars.includes(defaultVar) ? defaultVar : (heatmapVars[0] || 'density');
                setSelectedVariable(initialSelectedVar);
                setCurrentTimeIndex(dataResult.timePoints && dataResult.timePoints.length > 0 ? dataResult.timePoints.length - 1 : 0);

                if (dataResult.usingMockData) setUsingMockData(true);

            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Critical error in site data loading pipeline:', err);
                currentErrors.push(`Failed to process site data. ${usingMockData ? "Using simulated data." : "No data to display."}`);
                // Fallback state for critical failure (if not already handled by loadSiteAndTempData's own fallback)
                if (isMounted) {
                    setStations([]);
                    setTimePoints([]);
                    setAllData({} as AllLoadedData);
                    setDataRanges({
                        density: VARIABLE_CONFIGS.density.defaultRange,
                        salinity: VARIABLE_CONFIGS.salinity.defaultRange
                    });
                    setAvailableVariables(['density']);
                    setSelectedVariable('density');
                }
            } finally {
                if (isMounted) {
                    if (currentErrors.length > 0) setError(currentErrors.join('. '));
                    else setError(null);
                    setIsLoading(false);
                }
            }
        };

        loadInitialData(retries);

        return () => {
            isMounted = false;
        };
    }, [VARIABLE_CONFIGS, retries]);

    // Animation Effect
    useEffect(() => {
        if (playing && timePoints.length > 0) {
            playTimerRef.current = window.setInterval(() => {
                setCurrentTimeIndex((prevIndex) => {
                    const nextIndex = prevIndex + 1;
                    if (nextIndex >= timePoints.length) {
                        setPlaying(false);
                        return timePoints.length > 0 ? timePoints.length - 1 : 0;
                    }
                    return nextIndex;
                });
            }, ANIMATION_INTERVAL);
        } else if (playTimerRef.current !== null) {
            clearInterval(playTimerRef.current);
            playTimerRef.current = null;
        }
        return () => {
            if (playTimerRef.current !== null) clearInterval(playTimerRef.current);
        };
    }, [playing, timePoints.length, ANIMATION_INTERVAL]);

    const currentTimePoint = useMemo(() => timePoints[currentTimeIndex] || '', [timePoints, currentTimeIndex]);

    // currentVariableData will hold the TimePointStationData or TemperatureMap for the selectedVariable
    const currentVariableData = useMemo(() => {
        return allData[selectedVariable] || {};
    }, [allData, selectedVariable]);

    // currentDataForTimepoint is specifically for the HeatmapRenderer (station-based data)
    const currentDataForTimepoint = useMemo((): StationDataValues | {} => {
        if (selectedVariable === 'density' || selectedVariable === 'salinity') {
            const dataSet = allData[selectedVariable]; // This is TimePointStationData | undefined
            if (dataSet) {
                return dataSet[currentTimePoint] || {};
            }
        }
        return {}; // Return empty for 'temperature' or if data missing
    }, [allData, selectedVariable, currentTimePoint]);


    const currentConfig = useMemo(() => {
        return VARIABLE_CONFIGS[selectedVariable] || {
            key: selectedVariable, label: selectedVariable.toUpperCase(), unit: '', precision: 2,
            interpolate: 'interpolateBlues', defaultRange: [0, 1]
        } as VariableConfig;
    }, [selectedVariable, VARIABLE_CONFIGS]);

    const currentRange = useMemo(() => {
        return dataRanges[selectedVariable] || currentConfig.defaultRange;
    }, [dataRanges, selectedVariable, currentConfig.defaultRange]);

    const currentTemperature = useMemo(() => {
        const tempTimePointData = allData.temperature?.[currentTimePoint];
        return typeof tempTimePointData === 'number' ? tempTimePointData : undefined;
    }, [allData, currentTimePoint]);

    const VariableSelector: React.FC<VariableSelectorProps> = ({ variables, selectedVar, onChange, isLoading, variableConfig }) => (
        <div className="mb-4 text-center">
            <label htmlFor="variable-select" className="mr-2 text-sm font-medium text-foreground">
                Show:
            </label>
            <select
                id="variable-select"
                value={selectedVar}
                onChange={(e) => onChange(e.target.value as VariableKey)}
                disabled={isLoading || variables.length <= 1}
                className="py-1.5 pl-3 pr-8 text-sm rounded-md border border-input bg-background shadow-sm focus:border-primary focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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

    return (
        <div className="flex h-full w-full max-w-6xl flex-col rounded-lg bg-card p-4 shadow-xl sm:p-6 text-card-foreground">
            <header className="mb-4">
                <h2 className="text-center text-2xl font-bold text-primary sm:text-3xl">
                    Great Salt Lake Heatmap
                </h2>
                <p className="text-center text-sm text-muted-foreground sm:text-base">
                    Monthly Chemical Conditions Visualization
                </p>
            </header>

            {/* Status Messages */}
            {error && (
                <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
                    <strong>Warning:</strong> {error}
                </div>
            )}
            {usingMockData && !error && (
                <div className="mb-4 rounded border border-primary/50 bg-primary/10 p-3 text-center text-sm text-primary" role="status">
                    <strong>Note:</strong> Using simulated or incomplete data for demonstration.
                </div>
            )}

            {availableVariables.length > 0 && (
                <VariableSelector
                    variables={availableVariables}
                    selectedVar={selectedVariable}
                    onChange={setSelectedVariable}
                    isLoading={isLoading}
                    variableConfig={VARIABLE_CONFIGS}
                />
            )}

            {/* Main content area: Visualization and Controls */}
            <div className="relative mb-6 flex flex-grow flex-col rounded-lg bg-muted/50 p-2 shadow-inner sm:p-4 min-h-[500px]">
                {isLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
                        <p className="text-xl text-primary animate-pulse">Loading data...</p>
                    </div>
                )}
                {/* This div will contain the HeatmapRenderer and allow it to size correctly */}
                <div className="relative flex-grow">
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
                {!isLoading && timePoints.length > 0 && (
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

            <div className="py-4 border-t border-border">
                <ModeToggle />
            </div>
            <InfoPanel />
        </div>
    );
};

export default GreatSaltLakeHeatmap;