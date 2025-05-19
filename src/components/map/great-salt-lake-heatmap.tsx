import React, { useState, useEffect, useRef, useMemo, Dispatch, SetStateAction } from 'react';
import { FeatureCollection, Geometry } from 'geojson';
import HeatmapRenderer, { VariableConfig } from '@/components/map/heatmap-renderer';
import TimeControls from '@/components/ui/time-controls';
import * as d3 from 'd3';
import { AllLoadedData, ProcessedStation, SiteDataResult, VariableKey, loadGeoJsonData, loadSiteAndTempData } from '@/lib/loaders/';
import { createSimpleGeoJSON, calculateAverageDensity } from '@/lib/utils';
import Legend from '@/components/map/legend';

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
    const [retries, setRetries] = useState<number>(0);
    const MAX_RETRIES = 3;

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
        temperature: {
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
                if (geoJsonResult.error != null) currentErrors.push(geoJsonResult.error);
            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Error in GeoJSON loading:', err);
                currentErrors.push('Failed to load lake outline. Using simplified version.');
                if (isMounted) setLakeData(createSimpleGeoJSON());
            }

            try {
                const dataResult: SiteDataResult = await loadSiteAndTempData();
                if (!isMounted) return;

                if (dataResult.error != null && attempt < MAX_RETRIES - 1) {
                    console.warn(`Data load attempt ${attempt + 1} failed: ${dataResult.error}. Retrying...`);
                    currentErrors.push(dataResult.error);
                    setError(currentErrors.join('. '));
                    setRetries(prev => prev + 1);
                    return;
                }
                if (dataResult.error != null) {
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
                setCurrentTimeIndex(dataResult.timePoints != null && dataResult.timePoints.length > 0 ? dataResult.timePoints.length - 1 : 0);

                if (dataResult.usingMockData) setUsingMockData(true);

            } catch (err: any) {
                console.error('GreatSaltLakeHeatmap: Critical error in site data loading pipeline:', err);
                currentErrors.push(`Failed to process site data. ${usingMockData ? "Using simulated data." : "No data to display."}`);
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
    }, [VARIABLE_CONFIGS, retries, usingMockData]);

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
            const dataSet = allData[selectedVariable];
            if (dataSet != null) {
                return dataSet[currentTimePoint] || {};
            }
        }
        return {};
    }, [allData, selectedVariable, currentTimePoint]);

    const currentConfig = useMemo((): VariableConfig => {
        return VARIABLE_CONFIGS[selectedVariable] || {
            key: selectedVariable, label: selectedVariable.toUpperCase(), unit: '', precision: 2,
            interpolate: 'interpolateBlues', defaultRange: [0, 1]
        } as VariableConfig;
    }, [selectedVariable, VARIABLE_CONFIGS]);

    const currentRange = useMemo((): [number, number] => {
        return dataRanges[selectedVariable] || currentConfig.defaultRange;
    }, [dataRanges, selectedVariable, currentConfig.defaultRange]);

    const currentTemperature = useMemo(() => {
        const tempTimePointData = allData.temperature?.[currentTimePoint];
        return typeof tempTimePointData === 'number' ? tempTimePointData : undefined;
    }, [allData, currentTimePoint]);

    const avgValueForDisplay = useMemo(() => {
        if (currentConfig != null && currentConfig.key !== 'temperature' && currentDataForTimepoint != null) {
            return calculateAverageDensity(currentDataForTimepoint as StationDataValues);
        }
        return undefined;
    }, [currentDataForTimepoint, currentConfig]);

    const legendColorScale = useMemo((): d3.ScaleSequential<number, string> | null => {
        if (currentConfig == null || currentRange == null || currentConfig.interpolate == null) return null;
        const interpolatorName: string = currentConfig.interpolate;
        const colorInterpolator = ((d3 as any)[interpolatorName] || d3.interpolateBlues) as (t: number) => string;
        return d3.scaleSequential(colorInterpolator).domain([currentRange[1], currentRange[0]]) as unknown as d3.ScaleSequential<number, string>;
    }, [currentConfig, currentRange]);

    const formatDateForTitle = (timePoint: string): string => {
        if (timePoint == null || timePoint === '') return 'Date N/A';
        try {
            const dateParts = timePoint.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed for Date constructor
            if (dateParts.length === 2) { // YYYY-MM
                return new Date(year, month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            } else if (dateParts.length === 3) { // YYYY-MM-DD
                const day = parseInt(dateParts[2]);
                return new Date(year, month, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            return timePoint; // Fallback for unexpected format
        } catch (e) {
            return timePoint;
        }
    };

    return (
        <div className="flex h-screen w-screen flex-col bg-background text-foreground overflow-hidden">


            {/* Error and Status Messages */}
            {error != null && (
                <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
                    <strong>Warning:</strong> {error}
                </div>
            )}
            {usingMockData && error == null && (
                <div className="mb-4 rounded border border-primary/50 bg-primary/10 p-3 text-center text-sm text-primary" role="status">
                    <strong>Note:</strong> Using simulated or incomplete data for demonstration.
                </div>
            )}

            {/* Main Map Area */}
            <div className="relative flex-grow bg-muted/30 overflow-hidden">
                {isLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
                        <p className="text-xl text-primary animate-pulse">Loading data...</p>
                    </div>
                )}
                {!isLoading && lakeData != null && currentConfig != null && currentRange != null && (
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
                )}
            </div>


            {/* Right Group: Legend and Mode Toggle */}
            <div className="flex justify-between items-center sm:items-end gap-x-2 md:gap-x-4 flex-shrink-0 mx-4 mt-2">
                {/* Header */}
                <header className="shrink-0 p-2 text-center bg-card shadow-sm">
                    {currentConfig != null && currentTimePoint != null && !isLoading && (
                        <>
                            <h2 className="text-lg font-semibold text-primary sm:text-xl truncate">
                                Great Salt Lake {currentConfig.label} - {formatDateForTitle(currentTimePoint)}
                            </h2>
                            <p className="text-xs text-muted-foreground sm:text-sm truncate">
                                Avg Temp: {currentTemperature !== undefined ? `${currentTemperature.toFixed(1)}°F` : 'N/A'}
                                {currentConfig.key !== 'temperature' && avgValueForDisplay !== undefined && avgValueForDisplay !== null && !isNaN(avgValueForDisplay) && (
                                    ` | Avg ${currentConfig.label}: ${avgValueForDisplay.toFixed(currentConfig.precision)} ${currentConfig.unit}`
                                )}
                            </p>
                        </>
                    )}
                    {isLoading && (
                        <h2 className="text-lg font-semibold text-primary sm:text-xl">Loading Map Data...</h2>
                    )}
                    {currentConfig == null && !isLoading && (
                        <h2 className="text-lg font-semibold text-primary sm:text-xl">Great Salt Lake Visualization</h2>
                    )}
                </header>
                {!isLoading && legendColorScale != null && currentConfig != null && currentRange != null && (
                    <div className="hidden md:block legend-wrapper">
                        <svg width={450} height={50} aria-label="Data legend">
                            <g transform="translate(5, 5)">
                                <Legend
                                    colorScale={legendColorScale}
                                    currentRange={currentRange}
                                    currentConfig={{ label: currentConfig.label, unit: currentConfig.unit }}
                                    width={420}
                                    barHeight={10}
                                    tickCount={3}
                                    marginTop={15}
                                    marginLeft={15}
                                    marginRight={15}
                                    marginBottom={25}
                                />
                            </g>
                        </svg>
                    </div>
                )}
            </div>

            {/* Bottom Control Bar */}
            <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-y-3 gap-x-4 border-t border-border bg-card shadow-sm">
                <div className="w-full order-last sm:order-2 sm:flex-grow sm:basis-0 min-w-0 flex justify-center px-0 sm:px-2 md:px-4">
                    {!isLoading && timePoints.length > 0 && (
                        <TimeControls
                            variables={availableVariables}
                            selectedVar={selectedVariable}
                            onChange={setSelectedVariable}
                            variableConfig={VARIABLE_CONFIGS}
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
            </div>
        </div>
    );
};

export default GreatSaltLakeHeatmap;