import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { FeatureCollection, Geometry } from 'geojson';
import { Map as MapLibreMap, LngLat } from 'maplibre-gl';
import { ProcessedStation } from '@/lib/loaders';
import { StationDataValues } from '@/components/map/great-salt-lake-heatmap';

// --- Type Definitions ---
export interface VariableConfig {
    key: string;
    label: string;
    unit: string;
    precision: number;
    interpolate: string;
    defaultRange: [number, number];
}
interface LakeFeatureProperties { 
    layer?: string; // Updated to use 'layer' instead of 'name'
    [key: string]: string | number | boolean | null | undefined; 
}
export type LakeDataProps = FeatureCollection<Geometry, LakeFeatureProperties>;

const HEATMAP_RESOLUTION_WIDTH = 600;
const HEATMAP_RESOLUTION_HEIGHT = 375;

interface HeatmapRendererProps {
    map: MapLibreMap;
    lakeData: LakeDataProps;
    stations: ProcessedStation[];
    currentDataForTimepoint: StationDataValues;
    currentTemperature?: number;
    currentRange: [number, number];
    currentConfig: VariableConfig;
    currentTimePoint: string;
    isLoading: boolean;
}

interface DataPoint {
    x: number;
    y: number;
    value: number;
}

/**
 * Renders a heatmap overlay on a MapLibre map using D3.js.
 * This component takes care of rendering the heatmap based on the provided lake data,
 * station data, and current configuration.
 */
const HeatmapRenderer: React.FC<HeatmapRendererProps> = ({
    map,
    lakeData,
    stations,
    currentDataForTimepoint,
    currentRange,
    currentConfig,
    currentTimePoint,
    // isLoading,
}) => {
    const svgLayerRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
    const contentGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
    const imageLayerGroupRef = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);

    const d3ProjectionStream = useMemo(() => {
        return d3.geoTransform({
            point: function (longitude, latitude) {
                const point = map.project(new LngLat(longitude, latitude));
                this.stream.point(point.x, point.y);
            }
        });
    }, [map]);
    const geoPathGenerator = useMemo(() => d3.geoPath().projection(d3ProjectionStream), [d3ProjectionStream]);

    const formatDateForTitle = useCallback((timePoint: string): string => {
        if (!timePoint) return '';
        try {
            const [year, monthNumStr] = timePoint.split('-');
            const monthIndex = parseInt(monthNumStr, 10) - 1;
            if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) return year || timePoint;
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${monthNames[monthIndex]} ${year}`;
        } catch { return timePoint; }
    }, []);

    const clipIdToSlug = useCallback((clipId: string | null): string => {
        if (!clipId) return '';
        return clipId.replace('maplibreo-lake-clip-', '');
    }, []);

    const renderOverlay = useCallback(() => {
        if (!contentGroupRef.current || !imageLayerGroupRef.current || !lakeData || !lakeData.features || !currentConfig || !stations || !map.isStyleLoaded()) {
            if (contentGroupRef.current) contentGroupRef.current.selectAll('*').remove();
            if (imageLayerGroupRef.current) imageLayerGroupRef.current.selectAll('*').remove();
            return;
        }

        const gContent = contentGroupRef.current;
        const gImages = imageLayerGroupRef.current;

        gContent.selectAll('*').remove();
        gImages.selectAll('*').remove();

        const mapCanvasEl = map.getCanvas();
        const viewportWidth = mapCanvasEl.width;
        const viewportHeight = mapCanvasEl.height;

        const defs = gContent.append('defs');
        let northArmClipId: string | null = null;
        let southArmClipId: string | null = null;

        // Updated to use 'layer' property instead of 'name'
        lakeData.features.forEach((feature, index) => {
            const rawLayer = feature.properties?.layer || `feature-${index}`;
            const slug = rawLayer
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '')
                .replace(/^-+|-+$/g, '')
                .replace(/-+/g, '-');
            const clipId = `maplibreo-lake-clip-${slug || index}`;
            
            // Update arm detection based on actual layer values: GSL4194PolyNA and GSL4194PolySA
            if (rawLayer === 'GSL4194PolyNA' || slug.includes('polyna')) {
                northArmClipId = clipId;
            } else if (rawLayer === 'GSL4194PolySA' || slug.includes('polysa')) {
                southArmClipId = clipId;
            }
            
            try {
                defs.append('clipPath').attr('id', clipId).append('path').datum(feature).attr('d', geoPathGenerator);
            } catch (error) { 
                console.error("Error creating D3 clip path for " + slug + ":", error); 
            }
        });

        const interpolatorName = currentConfig.interpolate || 'interpolateBlues';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colorInterpolator = (d3 as any)[interpolatorName] || d3.interpolateBlues;
        const colorScale = d3.scaleSequential(colorInterpolator).domain([currentRange[0], currentRange[1]]);

        const NORTH_ARM_STATION_IDS: ReadonlySet<string> = new Set(['RD2', 'SJ-1', 'LVG4']);
        const northScreenPoints: DataPoint[] = [];
        const southScreenPoints: DataPoint[] = [];
        stations.forEach((station) => {
            const value = currentDataForTimepoint[station.id];
            if (value !== undefined && typeof value === 'number' && !isNaN(value) &&
                typeof station.longitude === 'number' && !isNaN(station.longitude) &&
                typeof station.latitude === 'number' && !isNaN(station.latitude)) {
                try {
                    const projected = map.project(new LngLat(station.longitude, station.latitude));
                    if (projected) {
                        const point: DataPoint = { x: projected.x, y: projected.y, value };
                        if (NORTH_ARM_STATION_IDS.has(station.id)) northScreenPoints.push(point);
                        else southScreenPoints.push(point);
                    }
                } catch { /* ignore */ }
            }
        });

        const IDW_POWER = 2;
        const CELL_SIZE = 5;
        const idw = (x: number, y: number, points: DataPoint[], pwr: number = IDW_POWER): number | null => {
            let num = 0, den = 0; let match = null;
            for (const pt of points) {
                const dSq = (x - pt.x) ** 2 + (y - pt.y) ** 2;
                if (dSq < 1e-8) { match = pt.value; break; }
                if (dSq === 0) continue;
                const w = 1 / Math.pow(dSq, pwr / 2);
                if (!isFinite(w)) continue;
                num += pt.value * w;
                den += w;
            }
            if (match !== null) return match;
            return den === 0 || !isFinite(den) ? null : num / den;
        };

        const processArm = (armPoints: DataPoint[], armClipId: string | null, canvasResolutionWidth: number, canvasResolutionHeight: number) => {
            if (!armClipId) return;
            if (armPoints.length === 0 && stations.length > 0) return;

            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = canvasResolutionWidth;
            offscreenCanvas.height = canvasResolutionHeight;
            const ctx = offscreenCanvas.getContext('2d');
            if (!ctx) return;

            let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
            const currentArmSlug = clipIdToSlug(armClipId);
            const armFeature = lakeData.features.find(f => {
                const rawLayer = f.properties?.layer || '';
                const slug = rawLayer.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').replace(/-+/g, '-');
                return slug === currentArmSlug;
            });

            if (armFeature) {
                const bounds = d3.geoBounds(armFeature);
                minLng = bounds[0][0]; minLat = bounds[0][1];
                maxLng = bounds[1][0]; maxLat = bounds[1][1];
            } else {
                console.warn(`[DEBUG] HeatmapRenderer: GeoJSON feature for arm '${currentArmSlug}' not found. Cannot determine heatmap extent.`);
                return;
            }

            if (!isFinite(minLng) || !isFinite(minLat) || !isFinite(maxLng) || !isFinite(maxLat)) {
                console.warn(`[DEBUG] Invalid geographic bounds for ${currentArmSlug}.`);
                return;
            }

            const topLeft = map.project(new LngLat(minLng, maxLat));
            const bottomRight = map.project(new LngLat(maxLng, minLat));
            const imgScreenX = Math.min(topLeft.x, bottomRight.x);
            const imgScreenY = Math.min(topLeft.y, bottomRight.y);
            const imgScreenWidth = Math.abs(bottomRight.x - topLeft.x);
            const imgScreenHeight = Math.abs(bottomRight.y - topLeft.y);

            if (imgScreenWidth <= 0 || imgScreenHeight <= 0) return;

            const gridCols = Math.ceil(canvasResolutionWidth / CELL_SIZE);
            const gridRows = Math.ceil(canvasResolutionHeight / CELL_SIZE);

            for (let c = 0; c < gridCols; c++) {
                for (let r = 0; r < gridRows; r++) {
                    const canvasPxX = (c + 0.5) * CELL_SIZE;
                    const canvasPxY = (r + 0.5) * CELL_SIZE;
                    const screenX = imgScreenX + (canvasPxX / canvasResolutionWidth) * imgScreenWidth;
                    const screenY = imgScreenY + (canvasPxY / canvasResolutionHeight) * imgScreenHeight;

                    const interpolatedVal = idw(screenX, screenY, armPoints);
                    if (interpolatedVal !== null && isFinite(interpolatedVal)) {
                        ctx.fillStyle = colorScale(interpolatedVal).toString();
                        ctx.fillRect(c * CELL_SIZE, r * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }
                }
            }

            gImages.append('image')
                .attr('x', imgScreenX)
                .attr('y', imgScreenY)
                .attr('width', imgScreenWidth)
                .attr('height', imgScreenHeight)
                .attr('preserveAspectRatio', 'none')
                .attr('clip-path', `url(#${armClipId})`)
                .attr('href', offscreenCanvas.toDataURL());
        };

        processArm(northScreenPoints, northArmClipId, HEATMAP_RESOLUTION_WIDTH, HEATMAP_RESOLUTION_HEIGHT);
        processArm(southScreenPoints, southArmClipId, HEATMAP_RESOLUTION_WIDTH, HEATMAP_RESOLUTION_HEIGHT);

        gContent.append('g')
            .attr('class', 'lake-outlines')
            .selectAll('path')
            .data(lakeData.features)
            .join('path')
            .attr('d', geoPathGenerator)
            .attr('fill', 'none')
            .attr('stroke', 'hsl(var(--primary))')
            .attr('stroke-width', 1.5)
            .attr('vector-effect', 'non-scaling-stroke');

        const stationGroup = gContent.append('g').attr('class', 'stations');
        stations.forEach((station) => {
            if (typeof station.longitude === 'number' && typeof station.latitude === 'number') {
                const projected = map.project(new LngLat(station.longitude, station.latitude));
                if (projected) {
                    const value = currentDataForTimepoint[station.id];
                    const hasData = value !== undefined && typeof value === 'number' && !isNaN(value);
                    const fillColor = hasData ? colorScale(value) : 'hsl(var(--muted))';
                    const stationEl = stationGroup.append('g').attr('transform', `translate(${projected.x},${projected.y})`);
                    stationEl.append('circle').attr('r', 5).attr('fill', fillColor).attr('stroke', 'black').attr('stroke-width', 1.5);
                    stationEl.append('title').text(hasData ? `${station.name}: ${value.toFixed(currentConfig.precision)} ${currentConfig.unit}` : `${station.name}: No data`);
                    const stationLabelOffsets: Record<string, { x: number; y: number }> = { 'SJ-1': { x: 14, y: -10 } };
                    const DEFAULT_STATION_LABEL_OFFSET = { x: 0, y: 15 };
                    const offset = stationLabelOffsets[station.id] || DEFAULT_STATION_LABEL_OFFSET;
                    stationEl.append('text').attr('x', offset.x).attr('y', offset.y)
                        .attr('text-anchor', 'middle').attr('fill', 'hsl(var(--foreground))')
                        .style('font-size', '10px').style('paint-order', 'stroke').style('stroke', 'hsl(var(--background))').style('stroke-width', '2.5px')
                        .text(hasData ? `${station.name} (${value.toFixed(currentConfig.precision)})` : station.name);
                }
            }
        });

        if (northScreenPoints.length === 0 && southScreenPoints.length === 0 && stations.length > 0 && Object.keys(currentDataForTimepoint).length > 0) {
            gContent.append('text')
                .attr('x', viewportWidth / 2).attr('y', viewportHeight / 2)
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .attr('fill', 'hsl(var(--muted-foreground))').style('font-size', '14px')
                .text(`No station data for ${currentConfig.label} at ${formatDateForTitle(currentTimePoint)} to generate heatmap.`);
        } else if (stations.length === 0) {
            gContent.append('text')
                .attr('x', viewportWidth / 2).attr('y', viewportHeight / 2)
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .attr('fill', 'hsl(var(--muted-foreground))').style('font-size', '14px')
                .text(`No station locations available.`);
        }

    }, [map, lakeData, stations, currentDataForTimepoint, currentRange, currentConfig, geoPathGenerator, currentTimePoint, formatDateForTitle, clipIdToSlug]);

    useEffect(() => {
        if (!map || !map.getCanvasContainer() || svgLayerRef.current) return;

        const newSvgLayer = d3.select(map.getCanvasContainer())
            .append('svg')
            .attr('class', 'd3-overlay absolute top-0 left-0 w-full h-full pointer-events-none z-[5]')
        svgLayerRef.current = newSvgLayer;
        imageLayerGroupRef.current = newSvgLayer.append('g').attr('class', 'd3-heatmap-image-layer');
        contentGroupRef.current = newSvgLayer.append('g').attr('class', 'd3-heatmap-content-layer');

        const mapMoveHandler = () => renderOverlay();
        map.on('move', mapMoveHandler);
        map.on('zoom', mapMoveHandler);
        map.on('resize', mapMoveHandler);

        if (map.isStyleLoaded()) {
            renderOverlay();
        } else {
            map.once('styledata', renderOverlay);
        }

        return () => {
            map.off('move', mapMoveHandler);
            map.off('zoom', mapMoveHandler);
            map.off('resize', mapMoveHandler);
            svgLayerRef.current?.remove();
            svgLayerRef.current = null;
            contentGroupRef.current = null;
            imageLayerGroupRef.current = null;
        };
    }, [map, renderOverlay]);

    useEffect(() => {
        if (map && map.isStyleLoaded() && svgLayerRef.current) {
            renderOverlay();
        }
    }, [lakeData, stations, currentDataForTimepoint, currentRange, currentConfig, currentTimePoint, renderOverlay]);

    return null;
};

export default HeatmapRenderer;