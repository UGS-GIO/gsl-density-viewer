import * as d3 from 'd3';

export interface LegendProps {
    /** The D3 selection of the SVG <g> element to draw the legend into. */
    svg: d3.Selection<SVGGElement, unknown, null, undefined>;
    /** The D3 color scale used for the heatmap. */
    colorScale: d3.ScaleSequential<number, string>; // Takes a number, returns a color string
    /** The min and max values of the data range for the legend's scale. */
    range: [number, number];
    /** The label or title for the legend (e.g., "Density (g/cm³)"). */
    label: string;
    /** The width of the legend's color bar. */
    width: number;
    /** The height of the legend's color bar. */
    height: number;
    /** Optional: Number of ticks to suggest for the axis. D3 might adjust this. Defaults to 5. */
    ticks?: number;
    /** Optional: Tick format string (e.g., ".2f"). Defaults to ".2f". */
    tickFormat?: string;
}

/**
 * Renders a color scale legend directly into a D3 SVG group selection.
 * This is a D3 utility function, not a React component.
 */
const Legend = ({
    svg,
    colorScale,
    range,
    label,
    width,
    height,
    ticks = 5, // Default to 5 ticks
    tickFormat = '.2f', // Default to 2 decimal places
}: LegendProps): void => {
    // Clear any previous legend content in this group
    svg.selectAll('*').remove();

    // Optional: Add a semi-transparent background for better readability if legend overlaps content
    svg.append('rect')
        .attr('x', -10) // Slight padding
        .attr('y', -25) // Ample space for title
        .attr('width', width + 20)
        .attr('height', height + 50) // Space for title and axis
        .attr('fill', 'rgba(255, 255, 255, 0.85)') // White with some transparency
        .attr('rx', 4) // Rounded corners
        .attr('ry', 4);

    // Legend title
    svg.append('text')
        .attr('x', width / 2) // Centered above the color bar
        .attr('y', -8)      // Position above the color bar
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '600') // Semi-bold
        .style('fill', '#333')       // Darker text color
        .text(label);

    // Create a linear scale for the legend's axis
    const legendScale = d3.scaleLinear().domain(range).range([0, width]);

    // Create and configure the legend axis
    const legendAxis = d3
        .axisBottom(legendScale)
        .ticks(ticks)
        .tickFormat(d3.format(tickFormat))
        .tickSize(height + 4) // Ticks extend slightly below the color bar
        .tickPadding(6);      // Padding between ticks and text

    // Define a unique ID for the gradient for this specific legend instance
    const gradientId = `legend-gradient-${Math.random().toString(36).substring(2, 15)}`;

    const defs = svg.append('defs');
    const gradient = defs
        .append('linearGradient')
        .attr('id', gradientId)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '0%');

    // Generate color stops for the gradient
    // Using a fixed number of stops for smooth gradient representation
    const numberOfStops = 20; // More stops can create a smoother visual gradient
    const [minVal, maxVal] = range;

    d3.range(numberOfStops + 1).forEach((i) => {
        const t = i / numberOfStops;
        const value = minVal + (maxVal - minVal) * t;
        gradient.append('stop')
            .attr('offset', `${t * 100}%`)
            .attr('stop-color', colorScale(value));
    });

    // Draw the color bar rectangle filled with the gradient
    svg.append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', width)
        .attr('height', height)
        .style('fill', `url(#${gradientId})`);

    // Draw the legend axis
    const axisGroup = svg
        .append('g')
        .attr('class', 'legend-axis') // Class for potential CSS styling
        .attr('transform', `translate(0, 0)`) // Position axis below the color bar
        .call(legendAxis);

    // Style axis ticks and text for better readability
    axisGroup.selectAll('line')
        .attr('stroke', '#555'); // Color of tick lines

    axisGroup.selectAll('text')
        .style('font-size', '10px')
        .style('fill', '#333');

    // Remove the default domain path (the main axis line) for a cleaner look
    axisGroup.select('.domain').remove();
};

export default Legend;