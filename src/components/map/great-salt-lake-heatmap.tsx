import React, { useState, useEffect, useRef, useMemo } from 'react'; // Removed Dispatch, SetStateAction as they are not explicitly used for props
import { useQuery } from '@tanstack/react-query';
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
 * Orchestrates data loading with React Query and renders UI sub-components.
 */
const GreatSaltLakeHeatmap: React.FC = () => {
    const [currentTimeIndex, setCurrentTimeIndex] = useState<number>(0);
    const [selectedVariable, setSelectedVariable] = useState<VariableKey>('density');
    const [playing, setPlaying] = useState<boolean>(false);

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


    // Fetch GeoJSON data with explicit types
    const { data: geoJsonResult, error: geoJsonError } = useQuery<GeoJsonResult, Error>({
        queryKey: ['geoJsonData'],
        queryFn: loadGeoJsonData,
        staleTime: Infinity,
    });

    // Fetch site and temperature data with explicit types
    const { data: siteDataResult, error: siteDataError, isLoading: isSiteDataLoading } = useQuery<SiteDataResult, Error>({
        queryKey: ['siteAndTempData'],
        queryFn: loadSiteAndTempData,
        retry: 3,
    });


    // Lake and site data are memoized to prevent unnecessary re-renders
    const lakeData: FeatureCollection<Geometry, LakeFeatureProperties> | null = useMemo(() => {
        if (geoJsonError) {
            console.error("Error loading GeoJSON data:", geoJsonError);
            return null;
        }
        return geoJsonResult?.data || createSimpleGeoJSON();
    }, [geoJsonResult, geoJsonError]);

    const usingMockData: boolean = useMemo(() => siteDataResult?.usingMockData || false, [siteDataResult]);

    // Derived states from siteDataResult to prevent re-renders
    const { stations, timePoints, allData, dataRanges } = useMemo(() => ({
        stations: siteDataResult?.stations || [] as ProcessedStation[],
        timePoints: siteDataResult?.timePoints || [] as string[],
        allData: siteDataResult?.allData || {} as AllLoadedData,
        dataRanges: siteDataResult?.dataRanges || {} as DataRanges,
    }), [siteDataResult]);

    const availableVariables: VariableKey[] = useMemo(() => {
        const heatmapVars = Object.keys(allData)
            .filter((key): key is VariableKey => key in VARIABLE_CONFIGS && (key === 'density' || key === 'salinity'));
        return heatmapVars.length > 0 ? heatmapVars : ['density'];
    }, [allData, VARIABLE_CONFIGS]);

    // Effect to set the initial time index once data is available
    useEffect(() => {
        if (timePoints.length > 0 && currentTimeIndex === 0) {
            setCurrentTimeIndex(timePoints.length - 1);
        }
    }, [timePoints, currentTimeIndex]);

    useEffect(() => {
        if (availableVariables.length > 0 && !availableVariables.includes(selectedVariable)) {
            setSelectedVariable(availableVariables[0]);
        }
    }, [availableVariables, selectedVariable]);


    // Animation timer effect
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


    // Calculate the current time point based on the current index
    const currentTimePoint: string = useMemo(() => timePoints[currentTimeIndex] || '', [timePoints, currentTimeIndex]);

    // currentDataForTimepoint is specifically for the HeatmapRenderer (station-based data)
    const currentDataForTimepoint: StationDataValues | {} = useMemo(() => {
        if (selectedVariable === 'density' || selectedVariable === 'salinity') {
            const dataSet = allData[selectedVariable];
            if (dataSet) return dataSet[currentTimePoint] || {};
        }
        return {};
    }, [allData, selectedVariable, currentTimePoint]);

    // Determine the current configuration based on the selected variable
    const currentConfig: VariableConfig = useMemo(() => {
        return VARIABLE_CONFIGS[selectedVariable] || {
            key: selectedVariable, label: selectedVariable.toUpperCase(), unit: '', precision: 2,
            interpolate: 'interpolateBlues', defaultRange: [0, 1]
        } as VariableConfig;
    }, [selectedVariable, VARIABLE_CONFIGS]);

    // Calculate the current data range based on the selected variable
    const currentRange: [number, number] = useMemo(() => {
        return dataRanges[selectedVariable] || currentConfig.defaultRange;
    }, [dataRanges, selectedVariable, currentConfig.defaultRange]);

    // Calculate the current temperature for the heatmap, if available
    const currentTemperature: number | undefined = useMemo(() => {
        const tempTimePointData = allData.temperature?.[currentTimePoint];
        return typeof tempTimePointData === 'number' ? tempTimePointData : undefined;
    }, [allData, currentTimePoint]);

    // Calculate the average value for display, if applicable
    const avgValueForDisplay: number | undefined = useMemo(() => {
        if (currentConfig.key !== 'temperature' && currentDataForTimepoint && Object.keys(currentDataForTimepoint).length > 0) {
            const avg = calculateAverageDensity(currentDataForTimepoint as StationDataValues);
            return avg === null || isNaN(avg) ? undefined : avg;
        }
        return undefined;
    }, [currentDataForTimepoint, currentConfig]);

    // Create a color scale for the legend based on the current configuration and range
    const legendColorScale: d3.ScaleSequential<number, string> | null = useMemo(() => {
        if (!currentConfig?.interpolate || !currentRange) return null;
        const colorInterpolator = (d3 as any)[currentConfig.interpolate] || d3.interpolateBlues;
        return d3.scaleSequential(colorInterpolator).domain([currentRange[1], currentRange[0]]);
    }, [currentConfig, currentRange]);

    const formatDateForTitle = (timePoint: string): string => {
        if (!timePoint) return 'Date N/A';
        try {
            const dateParts = timePoint.split('-');
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1;
            if (dateParts.length === 2) {
                return new Date(year, month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
            } else if (dateParts.length === 3) {
                const day = parseInt(dateParts[2]);
                return new Date(year, month, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
            return timePoint;
        } catch (e) {
            console.error("Error formatting date:", e);
            return timePoint;
        }
    };

    const combinedError: string | null = useMemo(() => {
        const errors: string[] = [];
        if (geoJsonError) errors.push(`Map outline: ${geoJsonError.message}`);
        else if (geoJsonResult?.error) errors.push(`Map outline: ${geoJsonResult.error}`);

        if (siteDataError) errors.push(`Site data: ${siteDataError.message}`);
        else if (siteDataResult?.error) errors.push(`Site data: ${siteDataResult.error}`);
        return errors.length > 0 ? errors.join('. ') : null;
    }, [geoJsonError, geoJsonResult, siteDataError, siteDataResult]);


    return (
        <div className="flex h-screen w-screen flex-col bg-background text-foreground overflow-hidden">
            {combinedError && (
                <div className="mb-4 rounded border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive" role="alert">
                    <strong>Warning:</strong> {combinedError}
                </div>
            )}
            {usingMockData && !combinedError && (
                <div className="mb-4 rounded border border-primary/50 bg-primary/10 p-3 text-center text-sm text-primary" role="status">
                    <strong>Note:</strong> Using simulated or incomplete data for demonstration.
                </div>
            )}

            <div className="relative flex-grow bg-muted/30 overflow-hidden">
                {isSiteDataLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
                        <p className="text-xl text-primary animate-pulse">Loading data...</p>
                    </div>
                )}
                {!isSiteDataLoading && lakeData && (
                    <HeatmapRenderer
                        lakeData={lakeData}
                        stations={stations}
                        currentDataForTimepoint={currentDataForTimepoint}
                        currentTemperature={currentTemperature}
                        currentRange={currentRange}
                        currentConfig={currentConfig}
                        currentTimePoint={currentTimePoint}
                        isLoading={isSiteDataLoading}
                    />
                )}
            </div>

            {/* Header and Legend Section */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 flex-shrink-0 mx-2 sm:mx-4 my-2">
                <header className="shrink-0 p-2 text-center bg-card shadow-sm md:w-auto">
                    {isSiteDataLoading ? (
                        <h2 className="text-lg font-semibold text-primary sm:text-xl">Loading Map Data...</h2>
                    ) : (
                        <>
                            <h2 className="text-lg font-semibold text-foreground sm:text-xl truncate">
                                Great Salt Lake {currentConfig.label} - {formatDateForTitle(currentTimePoint)}
                            </h2>
                            <p className="text-xs text-muted-foreground sm:text-sm truncate">
                                Avg Temp: {currentTemperature !== undefined ? `${currentTemperature.toFixed(1)}°F` : 'N/A'}
                                {currentConfig.key !== 'temperature' && avgValueForDisplay !== undefined && !isNaN(avgValueForDisplay) && (
                                    ` | Avg ${currentConfig.label}: ${avgValueForDisplay.toFixed(currentConfig.precision)} ${currentConfig.unit}`
                                )}
                            </p>
                        </>
                    )}
                </header>

                {!isSiteDataLoading && legendColorScale && currentRange && (
                    <div className="legend-wrapper flex justify-center md:justify-end w-full md:w-auto h-10 md:h-[50px]">
                        <svg
                            viewBox="0 0 450 50" // Defines intrinsic coordinate system & aspect ratio
                            aria-label="Data legend"
                            // Fills the parent wrapper. 'meet' ensures it fits & maintains aspect ratio.
                            className="w-full h-full"
                            preserveAspectRatio="xMidYMid meet"
                        >
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
                    {!isSiteDataLoading && timePoints.length > 0 && (
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
                            isLoading={isSiteDataLoading}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default GreatSaltLakeHeatmap;