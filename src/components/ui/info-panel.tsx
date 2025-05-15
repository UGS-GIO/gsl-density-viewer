import React from 'react';

/**
 * Component for displaying an interpretation guide or informational content.
 */
const InfoPanel: React.FC = () => (
    <div className="mt-2 border-t border-border pt-4">
        <h3 className="mb-2 text-lg font-bold text-primary">
            Interpretation Guide
        </h3>
        <div className="rounded-lg bg-accent p-4 text-accent-foreground">
            <ul className="list-disc list-outside space-y-1 pl-5 text-left">
                <li>
                    Heatmap shows interpolated density (darker blue = higher g/cm³).
                </li>
                <li>
                    Circles are sampling stations; color matches legend if data exists.
                </li>
                <li>
                    Use slider or play button to view monthly changes (2000-2025).
                </li>
                <li>
                    Observe potential correlations between temperature (Avg Temp) and density patterns.
                </li>
                <li>
                    Data is interpolated between stations using inverse distance weighting.
                </li>
            </ul>
        </div>
    </div>
);

export default InfoPanel;