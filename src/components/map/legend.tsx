import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface LegendCurrentConfig {
    label: string;
    unit: string;
}

interface LegendComponentProps {
    colorScale: d3.ScaleSequential<number, string>;
    currentRange: [number, number];
    currentConfig: LegendCurrentConfig;
    width?: number;
    barHeight?: number;
    tickCount?: number;
    marginTop?: number;
    marginRight?: number;
    marginBottom?: number;
    marginLeft?: number;
}

const Legend: React.FC<LegendComponentProps> = ({
    colorScale,
    currentRange,
    currentConfig,
    width = 200,
    barHeight = 10,
    tickCount = 5,
    marginTop = 30,
    marginRight = 0,
    marginBottom = 25,
    marginLeft = 0,
}) => {
    const gRef = useRef<SVGGElement>(null);

    useEffect(() => {
        if (!gRef.current || !colorScale || !currentRange || !currentConfig) {
            if (gRef.current) d3.select(gRef.current).selectAll('*').remove();
            return;
        }

        const svgGroupSelection = d3.select(gRef.current);
        svgGroupSelection.selectAll('*').remove(); // Clear previous render

        const innerWidth = width - marginLeft - marginRight;

        // --- 1. Draw the Legend Title/Label ---
        const titleText = `${currentConfig.label}${currentConfig.unit ? ` (${currentConfig.unit})` : ''}`;
        svgGroupSelection.append('text')
            .attr('class', 'text-sm font-semibold text-foreground')
            .style('fill', 'currentColor') // Apply the CSS 'color' (from text-foreground) to SVG 'fill'
            .attr('x', marginLeft + innerWidth / 2)
            .attr('y', marginTop - 10) // Position title baseline above the bar
            .attr('text-anchor', 'middle')
            .text(titleText);

        // --- 2. Draw the Color Ramp ---
        const rampGroup = svgGroupSelection.append('g')
            .attr('transform', `translate(${marginLeft}, ${marginTop})`);

        const gradientId = `legend-gradient-${Math.random().toString(36).substr(2, 9)}`;
        const defs = svgGroupSelection.append('defs');
        const linearGradient = defs.append('linearGradient')
            .attr('id', gradientId)
            .attr('x1', '100%')
            .attr('y1', '0%')
            .attr('x2', '0%')
            .attr('y2', '0%');

        const numStops = 20;
        const [minVal, maxVal] = currentRange;
        if (typeof minVal !== 'number' || typeof maxVal !== 'number' || minVal > maxVal) {
            console.error("Invalid currentRange for legend:", currentRange);
            svgGroupSelection.selectAll('*').remove();
            return;
        }

        for (let i = 0; i <= numStops; i++) {
            const t = i / numStops;
            const value = minVal + (maxVal - minVal) * t;
            linearGradient.append('stop')
                .attr('offset', `${t * 100}%`)
                .attr('stop-color', colorScale(value));
        }

        rampGroup.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', innerWidth)
            .attr('height', barHeight)
            .style('fill', `url(#${gradientId})`);

        // --- 3. Draw the Axis ---
        const axisScale = d3.scaleLinear()
            .domain(currentRange)
            .range([0, innerWidth]);

        const axisGenerator = d3.axisBottom(axisScale)
            .ticks(tickCount)
            .tickSizeOuter(0)
            .tickSizeInner(6);

        const axisGroup = svgGroupSelection.append('g')
            .attr('transform', `translate(${marginLeft}, ${marginTop + barHeight})`);

        axisGroup.call(axisGenerator)
            .selectAll("text")
            .attr('class', 'text-sm text-muted-foreground')
            .style('fill', 'currentColor') // Apply the CSS 'color' (from text-muted-foreground) to SVG 'fill'
            .style("text-anchor", (d, i, nodes) => {
                if (nodes.length <= 1) return "middle";
                if (i === 0) return "start";
                if (i === nodes.length - 1) return "end";
                return "middle";
            });

        axisGroup.selectAll(".tick line")
            .attr('class', 'text-theme-border') // Apply a class that sets CSS 'color' to your border color
            .style("stroke", "currentColor");    // Make SVG stroke use that CSS 'color'
        axisGroup.select(".domain").remove();

    }, [colorScale, currentRange, currentConfig, width, barHeight, tickCount, marginTop, marginRight, marginBottom, marginLeft]);

    return <g ref={gRef} className="heatmap-legend-group" />;
};

export default Legend;