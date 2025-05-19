import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import { FeatureCollection, Geometry, Feature } from 'geojson';
import { calculateAverageDensity } from '@/lib/utils';
import { LakeFeatureProperties } from './great-salt-lake-heatmap';
import { ProcessedStation } from '@/lib/loaders';
import Legend from '@/components/map/legend';

// --- Constants ---
const SVG_VIEWBOX_WIDTH = 800;
const SVG_VIEWBOX_HEIGHT = 500;
const SVG_PROJECTION_PADDING = 20; // Padding inside the SVG for map projection fitting

// --- Type Definitions ---
// Configuration for a displayable variable (density, salinity, etc.)
export interface VariableConfig {
    key: string;
    label: string;
    unit: string;
    precision: number;
    interpolate: string; // Name of a D3 interpolator function (e.g., "interpolateBlues")
    defaultRange: [number, number];
}

// Data for the currently selected variable at a specific timepoint, keyed by station ID
type StationDataValues = Record<string, number | undefined>;

// Props for the HeatmapRenderer component
interface HeatmapRendererProps {
    lakeData: FeatureCollection<Geometry, LakeFeatureProperties> | null;
    stations: ProcessedStation[];
    currentDataForTimepoint: StationDataValues;
    currentTemperature?: number;
    currentRange: [number, number];
    currentConfig: VariableConfig;
    currentTimePoint: string;
    isLoading: boolean;
    // Optional: Configuration for arm identification could be passed as props
    // northArmFeatureNameIncludes?: string; // e.g., "north"
    // southArmFeatureNameIncludes?: string; // e.g., "south"
    // northArmStationIds?: ReadonlySet<string>; // More robust than hardcoding
}

// Internal type for projected data points used in IDW
interface DataPoint {
    x: number;
    y: number;
    value: number;
}

/**
 * Renders a D3.js powered heatmap visualization for geographic data,
 * showing interpolated values based on station readings.
 */
const HeatmapRenderer: React.FC<HeatmapRendererProps> = ({
    lakeData,
    stations,
    currentDataForTimepoint,
    currentTemperature,
    currentRange,
    currentConfig,
    currentTimePoint,
    isLoading,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);

    const projection = useMemo((): d3.GeoProjection | null => {
        if (!lakeData || !lakeData.features || lakeData.features.length === 0) {
            return null;
        }
        try {
            return d3
                .geoMercator()
                .fitExtent(
                    [
                        [SVG_PROJECTION_PADDING, SVG_PROJECTION_PADDING],
                        [
                            SVG_VIEWBOX_WIDTH - SVG_PROJECTION_PADDING,
                            SVG_VIEWBOX_HEIGHT - SVG_PROJECTION_PADDING,
                        ],
                    ],
                    lakeData
                );
        } catch (error) {
            console.error('HeatmapRenderer: Error creating map projection:', error);
            return null;
        }
    }, [lakeData]);

    const formatDateForTitle = useCallback((timePoint: string): string => {
        if (!timePoint) return '';
        const [year, monthNumStr] = timePoint.split('-');
        const monthIndex = parseInt(monthNumStr, 10) - 1;
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June', 'July',
            'August', 'September', 'October', 'November', 'December',
        ];
        return `${monthNames[monthIndex] || `Month ${monthNumStr}`} - ${year}`;
    }, []);

    const renderHeatmap = useCallback(() => {
        if (
            !svgRef.current ||
            !lakeData || !lakeData.features || lakeData.features.length === 0 ||
            !projection ||
            !stations ||
            !currentConfig
        ) {
            return;
        }

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); // Clear previous render

        const avgValue = calculateAverageDensity(currentDataForTimepoint);

        const northCanvas = document.createElement('canvas');
        northCanvas.width = SVG_VIEWBOX_WIDTH;
        northCanvas.height = SVG_VIEWBOX_HEIGHT;
        const northCtx = northCanvas.getContext('2d');

        const southCanvas = document.createElement('canvas');
        southCanvas.width = SVG_VIEWBOX_WIDTH;
        southCanvas.height = SVG_VIEWBOX_HEIGHT;
        const southCtx = southCanvas.getContext('2d');

        if (!northCtx || !southCtx) {
            console.error("HeatmapRenderer: Could not get 2D context for offscreen canvases.");
            return;
        }

        const geoPathGenerator = d3.geoPath().projection(projection);

        let northArmClipId: string | null = null;
        let southArmClipId: string | null = null;
        const defs = svg.append('defs');

        lakeData.features.forEach((feature: Feature<Geometry, LakeFeatureProperties>, index: number) => {
            const rawName = feature.properties?.name || `feature-${index}`;
            const slug = rawName
                .toLowerCase()
                .replace(/\s+/g, '-') // Replace spaces with hyphens
                .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric (except hyphens)
                .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
                .replace(/-+/g, '-'); // Consolidate multiple hyphens
            const clipId = `lake-clip-${slug || index}`;

            // TODO: Make arm identification more robust (e.g., via feature properties or configurable keywords)
            if (slug.includes('north')) northArmClipId = clipId;
            else if (slug.includes('south')) southArmClipId = clipId;
            // else console.warn(`HeatmapRenderer: Feature "${slug}" not identified as North or South arm.`);


            try {
                defs
                    .append('clipPath')
                    .attr('id', clipId)
                    .append('path')
                    .datum(feature)
                    .attr('d', geoPathGenerator as d3.GeoPath<any, Feature<Geometry, LakeFeatureProperties>>);
            } catch (error) {
                console.error(`HeatmapRenderer: Error creating clip path for "${slug}":`, error);
                defs.append('clipPath').attr('id', clipId).append('rect').attr('width', 0).attr('height', 0); // Fallback
            }
        });

        if (!northArmClipId || !southArmClipId) {
            console.warn('HeatmapRenderer: Could not identify clip paths for both North and South arms. Heatmap clipping may be incomplete.');
        }

        const interpolatorName = currentConfig.interpolate || 'interpolateBlues';

        const colorInterpolator = (d3 as any)[interpolatorName] || d3.interpolateBlues;
        const colorScale = d3.scaleSequential(colorInterpolator).domain([currentRange[1], currentRange[0]]);

        // TODO: Make NORTH_ARM_STATION_IDS configurable via props for flexibility
        const NORTH_ARM_STATION_IDS: ReadonlySet<string> = new Set(['RD2', 'SJ-1', 'RD1', 'LVG4']);
        const northDataPoints: DataPoint[] = [];
        const southDataPoints: DataPoint[] = [];

        stations.forEach((station) => {
            const value = currentDataForTimepoint[station.id];
            if (
                value !== undefined && typeof value === 'number' && !isNaN(value) &&
                typeof station.longitude === 'number' && !isNaN(station.longitude) &&
                typeof station.latitude === 'number' && !isNaN(station.latitude)
            ) {
                try {
                    const projected = projection([station.longitude, station.latitude]);
                    if (projected && typeof projected[0] === 'number' && typeof projected[1] === 'number') {
                        const point: DataPoint = { x: projected[0], y: projected[1], value };
                        if (NORTH_ARM_STATION_IDS.has(station.id)) {
                            northDataPoints.push(point);
                        } else {
                            southDataPoints.push(point);
                        }
                    }
                } catch (error) { /* Silently ignore projection errors for individual points */ }
            }
        });

        const IDW_POWER = 2;
        const CELL_SIZE = 5;
        const gridCols = Math.ceil(SVG_VIEWBOX_WIDTH / CELL_SIZE);
        const gridRows = Math.ceil(SVG_VIEWBOX_HEIGHT / CELL_SIZE);
        let northCellsDrawn = 0;
        let southCellsDrawn = 0;

        const idw = (x: number, y: number, points: DataPoint[], power: number = IDW_POWER): number | null => {
            let numerator = 0;
            let denominator = 0;
            let exactMatchValue: number | null = null;
            for (const point of points) {
                const distanceSq = Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2);
                if (distanceSq < 1e-8) {
                    exactMatchValue = point.value;
                    break;
                }
                if (distanceSq === 0) continue;
                const weight = 1 / Math.pow(distanceSq, power / 2);
                numerator += point.value * weight;
                denominator += weight;
            }
            if (exactMatchValue !== null) return exactMatchValue;
            return denominator === 0 || !isFinite(denominator) ? null : numerator / denominator;
        };

        if (northDataPoints.length > 0 || southDataPoints.length > 0) {
            for (let col = 0; col < gridCols; col++) {
                for (let row = 0; row < gridRows; row++) {
                    const cellCenterX = col * CELL_SIZE + CELL_SIZE / 2;
                    const cellCenterY = row * CELL_SIZE + CELL_SIZE / 2;

                    if (northDataPoints.length > 0) {
                        const interpolatedNorth = idw(cellCenterX, cellCenterY, northDataPoints);
                        if (interpolatedNorth !== null && isFinite(interpolatedNorth)) {


                            northCtx.fillStyle = colorScale(interpolatedNorth).toString();
                            northCtx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                            northCellsDrawn++;
                        }
                    }

                    if (southDataPoints.length > 0) {
                        const interpolatedSouth = idw(cellCenterX, cellCenterY, southDataPoints);
                        if (interpolatedSouth !== null && isFinite(interpolatedSouth)) {
                            southCtx.fillStyle = colorScale(interpolatedSouth).toString();

                            southCtx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                            southCellsDrawn++;
                        }
                    }
                }
            }
        }

        if (northCellsDrawn > 0 && northArmClipId) {
            svg.append('image')
                .attr('x', 0).attr('y', 0)
                .attr('width', SVG_VIEWBOX_WIDTH).attr('height', SVG_VIEWBOX_HEIGHT)
                .attr('preserveAspectRatio', 'none')
                .attr('clip-path', `url(#${northArmClipId})`)
                .attr('href', northCanvas.toDataURL());
        }

        if (southCellsDrawn > 0 && southArmClipId) {
            svg.append('image')
                .attr('x', 0).attr('y', 0)
                .attr('width', SVG_VIEWBOX_WIDTH).attr('height', SVG_VIEWBOX_HEIGHT)
                .attr('preserveAspectRatio', 'none')
                .attr('clip-path', `url(#${southArmClipId})`)
                .attr('href', southCanvas.toDataURL());
        }

        if (northCellsDrawn === 0 && southCellsDrawn === 0) {
            svg.append('text')
                .attr('x', SVG_VIEWBOX_WIDTH / 2).attr('y', SVG_VIEWBOX_HEIGHT / 2)
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .attr('fill', '#777')
                .style('font-size', '14px')
                .text(`No ${currentConfig.label || 'data'} for heatmap for ${formatDateForTitle(currentTimePoint)}`);
        }

        svg.append('g')
            .attr('class', 'lake-outlines')
            .selectAll('path')
            .data(lakeData.features)
            .join('path')
            .attr('d', geoPathGenerator as d3.GeoPath<any, Feature<Geometry, LakeFeatureProperties>>)
            .attr('fill', 'none')
            .attr('stroke', '#5c97b9')
            .attr('stroke-width', 1.5)
            .attr('vector-effect', 'non-scaling-stroke');

        // TODO: Station label positioning could be externalized or made more configurable
        const stationLabelOffsets: Record<string, { x: number; y: number }> = {
            'SJ-1': { x: -2, y: 18 },
            'RD1': { x: 8, y: -10 },
        };
        const DEFAULT_STATION_LABEL_OFFSET = { x: 0, y: 15 };
        const stationGroup = svg.append('g').attr('class', 'stations');

        stations.forEach((station) => {
            if (typeof station.longitude !== 'number' || isNaN(station.longitude) ||
                typeof station.latitude !== 'number' || isNaN(station.latitude)) return;
            try {
                const projected = projection([station.longitude, station.latitude]);
                if (!projected || isNaN(projected[0]) || isNaN(projected[1])) return;

                const [x, y] = projected;
                const value = currentDataForTimepoint[station.id];
                const hasData = value !== undefined && typeof value === 'number' && !isNaN(value);
                const fillColor = hasData ? colorScale(value) : 'hsl(var(--muted))';

                const g = stationGroup.append('g').attr('transform', `translate(${x}, ${y})`);
                g.append('circle').attr('r', 5)
                    .attr('fill', fillColor)
                    .attr('stroke', 'hsl(var(--foreground))')
                    .attr('stroke-width', 1);
                g.append('title').text(hasData ? `${station.name}: ${value.toFixed(currentConfig.precision)} ${currentConfig.unit}` : `${station.name}: No data`);

                const offset = stationLabelOffsets[station.id] || DEFAULT_STATION_LABEL_OFFSET;
                g.append('text').attr('x', offset.x).attr('y', offset.y)
                    .attr('text-anchor', 'middle')
                    .attr('class', 'fill-foreground')
                    .style('font-size', '10px')
                    .text(station.name);
            } catch (error) { /* Silently ignore errors for individual station drawing */ }
        });

    }, [
        lakeData, stations, projection, currentTimePoint, currentDataForTimepoint,
        currentTemperature, currentRange, currentConfig, isLoading,
        formatDateForTitle, calculateAverageDensity,
    ]);

    useEffect(() => {
        if (projection && !isLoading && lakeData && currentConfig && stations) {
            const animationId = requestAnimationFrame(renderHeatmap);
            return () => cancelAnimationFrame(animationId);
        }
    }, [projection, isLoading, lakeData, currentConfig, stations, renderHeatmap]);

    return (
        <div className="relative w-full h-full overflow-hidden bg-card border border-border rounded-lg">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${SVG_VIEWBOX_WIDTH} ${SVG_VIEWBOX_HEIGHT}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-0 block h-full w-full bg-muted/30"
                aria-labelledby="heatmap-title-dynamic"
                role="img"
            >
                <title id="heatmap-title-dynamic">{`${currentConfig?.label || 'Data'} Heatmap`}</title>
                <desc>{`Choropleth heatmap visualization of ${currentConfig?.label || 'data'}.`}</desc>
            </svg>
        </div>
    );
};

export default HeatmapRenderer;