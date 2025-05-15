import React from 'react';

/**
 * Component for displaying an interpretation guide or informational content.
 * Styled with Tailwind CSS.
 */
const InfoPanel: React.FC = () => (

    <div className="border-t border-gray-200 pt-4 mt-2">
        <h3 className="font-bold mb-2 text-lg text-blue-800">
            Interpretation Guide
        </h3>
        <div className="bg-blue-50 p-4 rounded-lg">
            <ul className="list-disc list-outside pl-5 text-left text-gray-700 space-y-1">
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