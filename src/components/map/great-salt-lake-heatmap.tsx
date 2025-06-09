import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import HeatmapRenderer, { LakeDataProps, VariableConfig } from '@/components/map/heatmap-renderer';
import TimeControls from '@/components/ui/time-controls';
import * as d3 from 'd3';
import { AllLoadedData, ProcessedStation, SiteDataResult, VariableKey, loadGeoJsonData, loadSiteAndTempData } from '@/lib/loaders/';
import { createSimpleGeoJSON, calculateAverageDensity } from '@/lib/utils';
import Legend from '@/components/map/legend';


export type LakeFeatureProperties = { name?: string;[key: string]: any; } | null;
export type StationDataValues = Record<string, number | undefined>;
type DataRanges = Record<string, [number, number]>;
interface GeoJsonResult {
    data: LakeDataProps | null;
    error: string | null;
}

/**
 * Main component for the Great Salt Lake Heatmap visualization.
 * Orchestrates data loading with React Query and renders UI sub-components.
 */
const GreatSaltLakeHeatmap: React.FC = () => {
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [currentTimeIndex, setCurrentTimeIndex] = useState<number>(0);
    const [selectedVariable, setSelectedVariable] = useState<VariableKey>('density');
    const [playing, setPlaying] = useState<boolean>(false);
    const playTimerRef = useRef<number | null>(null);
    const ANIMATION_INTERVAL = 500;

    const VARIABLE_CONFIGS = useMemo((): Record<string, VariableConfig> => ({
        density: {
            key: 'density',
            label: 'Density (Lab)',
            unit: 'g/cm³',
            precision: 3,
            interpolate: 'interpolateBlues',
            defaultRange: [1.0, 1.25]
        },
        salinity: {
            key: 'salinity',
            label: 'Salinity (EOS)',
            unit: 'g/L',
            precision: 1,
            interpolate: 'interpolateGreens',
            defaultRange: [50, 250]
        },
        temperature: {
            key: 'temperature',
            label: 'Avg Temp',
            unit: '°F',
            precision: 1,
            interpolate: 'interpolateOrRd',
            defaultRange: [0, 100]
        }
    }), []);

const { data: geoJsonQueryResult, error: geoJsonQueryError, isLoading: isGeoJsonLoading } = useQuery<GeoJsonResult, Error>({
    queryKey: ['geoJsonData'],
    queryFn: loadGeoJsonData,
    staleTime: Infinity,
});

const { data: siteDataQueryResult, error: siteDataQueryError, isLoading: isSiteDataLoading } = useQuery<SiteDataResult, Error>({
    queryKey: ['siteAndTempData'],
    queryFn: loadSiteAndTempData,
    retry: 3,
});

// Compute overall loading state
const isAnyDataLoading = isGeoJsonLoading || isSiteDataLoading;
const hasDataErrors = geoJsonQueryError || siteDataQueryError;

const lakeData = useMemo((): LakeDataProps => {
    // Don't process until loading is complete
    if (isGeoJsonLoading) {
        return createSimpleGeoJSON();
    }
    
    if (geoJsonQueryError || geoJsonQueryResult?.error || !geoJsonQueryResult?.data) {
        if (geoJsonQueryError) console.error("GeoJSON query error:", geoJsonQueryError.message);
        if (geoJsonQueryResult?.error) console.error("GeoJSON app error:", geoJsonQueryResult.error);
        return createSimpleGeoJSON();
    }
    
    console.log('✅ Using real GeoJSON data');
    return geoJsonQueryResult.data;
}, [geoJsonQueryResult, geoJsonQueryError, isGeoJsonLoading]);


    const usingMockData: boolean = useMemo(() => siteDataQueryResult?.usingMockData || false, [siteDataQueryResult]);

    // Derived states from siteDataResult to prevent re-renders
    const { stations, timePoints, allData, dataRanges } = useMemo(() => ({
        stations: siteDataQueryResult?.stations || [] as ProcessedStation[],
        timePoints: siteDataQueryResult?.timePoints || [] as string[],
        allData: siteDataQueryResult?.allData || {} as AllLoadedData,
        dataRanges: siteDataQueryResult?.dataRanges || {} as DataRanges,
    }), [siteDataQueryResult]);

    const availableVariables: VariableKey[] = useMemo(() => {
        const heatmapVars = Object.keys(allData)
            .filter((key): key is VariableKey => key in VARIABLE_CONFIGS && (key === 'density' || key === 'salinity'));
        return heatmapVars.length > 0 ? heatmapVars : ['density'];
    }, [allData, VARIABLE_CONFIGS]);

    useEffect(() => {
        if (availableVariables.length > 0 && !availableVariables.includes(selectedVariable))
            setSelectedVariable(availableVariables[0]);
    }, [availableVariables, selectedVariable]);


    // Animation timer effect
    useEffect(() => {
        if (playing && timePoints.length > 0) {
            playTimerRef.current = window.setInterval(() => {
                setCurrentTimeIndex((prevIndex) => {
                    const nextIndex = prevIndex + 1;
                    if (nextIndex >= timePoints.length) {
                        return 0; // Loop back to the beginning
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
    const currentConfig: VariableConfig = useMemo(() =>
        VARIABLE_CONFIGS[selectedVariable] || ({
            key: selectedVariable, label: selectedVariable.toUpperCase(), unit: '', precision: 2,
            interpolate: 'interpolateBlues', defaultRange: [0, 1]
        }),
        [selectedVariable, VARIABLE_CONFIGS]);
    const currentRange: [number, number] = useMemo(() =>
        dataRanges[selectedVariable] || currentConfig?.defaultRange || [0, 1],
        [dataRanges, selectedVariable, currentConfig]
    );

    // Calculate the current temperature for the heatmap, if available
    const currentTemperature: number | undefined = useMemo(() => {
        const tempTimePointData = allData.temperature?.[currentTimePoint];
        return typeof tempTimePointData === 'number' ? tempTimePointData : undefined;
    }, [allData, currentTimePoint]);
    const avgValueForDisplay: number | undefined = useMemo(() => {
        if (currentConfig.key !== 'temperature' && currentDataForTimepoint && Object.keys(currentDataForTimepoint).length > 0) {
            const avg = calculateAverageDensity(currentDataForTimepoint as StationDataValues);
            return avg === null || isNaN(avg) ? undefined : avg;
        }
        return undefined;
    }, [currentDataForTimepoint, currentConfig]);
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

    const agrcTileUrl = "https://discover.agrc.utah.gov/login/path/bottle-apple-crater-oberon/tiles/lite_basemap/{z}/{x}/{y}";

    // Initialize MapLibre Map
    useEffect(() => {
        if (mapRef.current || !mapContainerRef.current) return; // Initialize map only once

        const GSL_CENTER: [number, number] = [-112.6, 41.2]; // Lon, Lat for GSL
        const INITIAL_ZOOM = 8;

        mapRef.current = new maplibregl.Map({
            container: mapContainerRef.current,
            // style: {
            //     version: 8,
            //     sources: {
            //         'agrc-raster-tiles': {
            //             'type': 'raster',
            //             'tiles': [agrcTileUrl],
            //             'tileSize': 256,
            //             'attribution': '<a href="https://gis.utah.gov/" target="_blank">UGRC</a>'
            //         }
            //     },
            //     layers: [
            //         {
            //             'id': 'agrc-basemap-layer',
            //             'type': 'raster',
            //             'source': 'agrc-raster-tiles',
            //             'minzoom': 0,
            //             'maxzoom': 22
            //         }
            //     ]
            // }, 
            // add openfreemap style for testing until AGRC is ready
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: GSL_CENTER,
            zoom: INITIAL_ZOOM,
        });

        mapRef.current.on('load', () => {
            setMapLoaded(true);
            console.log("MapLibre map loaded and ready.");
        });

        mapRef.current.addControl(new maplibregl.NavigationControl(), 'top-right');

        return () => {
            mapRef.current?.remove();
            mapRef.current = null;
            setMapLoaded(false);
        };
    }, []); // Empty dependency array

    const combinedError: string | null = useMemo(() => {
        const errors: string[] = [];
        if (geoJsonQueryError) errors.push(`Map outline (query): ${geoJsonQueryError.message}`);
        else if (geoJsonQueryResult?.error) errors.push(`Map outline (app): ${geoJsonQueryResult.error}`);
        if (siteDataQueryError) errors.push(`Site data (query): ${siteDataQueryError.message}`);
        else if (siteDataQueryResult?.error) errors.push(`Site data (app): ${siteDataQueryResult.error}`);
        return errors.length > 0 ? errors.join('. ') : null;
    }, [geoJsonQueryError, geoJsonQueryResult, siteDataQueryError, siteDataQueryResult]);

    return (
        <div className="flex h-screen w-screen flex-col bg-background text-foreground overflow-hidden">
            {/* Error and Status Messages */}
            <div className="absolute top-0 left-0 right-0 z-20 p-2">
                {combinedError && (
                    <div className="mb-2 rounded border border-destructive/50 bg-destructive/10 p-3 text-center text-sm text-destructive shadow-lg" role="alert">
                        <strong>Warning:</strong> {combinedError}
                    </div>
                )}
                {usingMockData && !combinedError && (
                    <div className="mb-2 rounded border border-primary/50 bg-primary/10 p-3 text-center text-sm text-primary shadow-lg" role="status">
                        <strong>Note:</strong> Using simulated or incomplete data for demonstration.
                    </div>
                )}
            </div>

            {/* Map Container */}
            <div ref={mapContainerRef} className="absolute inset-0 h-full w-full" />

            {/* HeatmapRenderer */}
            {mapLoaded && mapRef.current && lakeData && stations && currentConfig && currentDataForTimepoint && !isSiteDataLoading && (
                <HeatmapRenderer
                    map={mapRef.current}
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

            {/* TimeControls as an Overlay at the Bottom */}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-2 bg-card/70 backdrop-blur-sm border-t border-border shadow-lg">
                <div className="flex flex-col md:flex-row items-center justify-around">
                    <header className="p-1 md:p-2 text-center">
                        <h2 className="text-base font-semibold text-foreground sm:text-lg truncate">
                            GSL {currentConfig.label} - {formatDateForTitle(currentTimePoint)}
                        </h2>
                        <p className="text-xs text-muted-foreground sm:text-sm truncate">
                            Avg Temp: {currentTemperature !== undefined ? `${currentTemperature.toFixed(1)}°F` : 'N/A'}
                            {currentConfig.key !== 'temperature' && avgValueForDisplay !== undefined && !isNaN(avgValueForDisplay) && (
                                ` | Avg ${currentConfig.label}: ${avgValueForDisplay.toFixed(currentConfig.precision)} ${currentConfig.unit}`
                            )}
                        </p>
                    </header>
                    {legendColorScale && currentRange && (
                        <div className="flex justify-center h-14 md:h-16 px-2 py-1">
                            <svg viewBox="0 0 450 50" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                                <g transform="translate(5,5)">
                                    <Legend width={420} barHeight={10} {...{ colorScale: legendColorScale, currentRange, currentConfig, tickCount: 3, marginTop: 15, marginLeft: 15, marginRight: 15, marginBottom: 25 }} />
                                </g>
                            </svg>
                        </div>
                    )}
                </div>

                {/* Time Controls */}
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
                {!isSiteDataLoading && timePoints.length === 0 && (
                    <p className="text-sm text-muted-foreground p-2 text-center">Time data unavailable.</p>
                )}
            </div>

            {/* Loading overlay for initial site data load, if not map specific */}
            {isSiteDataLoading && !mapLoaded && ( // Show general loading if map isn't even up yet
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <p className="text-xl text-primary animate-pulse">Loading data...</p>
                </div>
            )}
        </div>
    );
};
export default GreatSaltLakeHeatmap;