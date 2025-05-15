import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { FeatureCollection, Polygon, Feature } from 'geojson';
import { LakeFeatureProperties, StationDataValues } from "@/components/map/great-salt-lake-heatmap";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

/**
 * Utility functions for the Great Salt Lake Heatmap
 */

/**
 * Calculate the average density from a map of station densities
 * @param {Object} densityMap - Object mapping station IDs to density values
 * @returns {number} - Average density or null if no valid values
 */
export const calculateAverageDensity = (densityMap: StationDataValues): number | null => {
    if (!densityMap || typeof densityMap !== 'object') return null;

    // Filter out non-numeric values with a type guard
    const densities = Object.values(densityMap).filter(
        (d): d is number => typeof d === 'number' && !isNaN(d)
    );

    if (densities.length === 0) return null;

    // Explicitly type the reduce callback
    const sum = densities.reduce((acc: number, val: number) => acc + val, 0);
    return sum / densities.length;
};

/**
 * Create a simple GeoJSON polygon representing the Great Salt Lake
 * Used as a fallback when the real GeoJSON cannot be loaded
 * @returns {Object} - GeoJSON FeatureCollection
 */
export const createSimpleGeoJSON = (): FeatureCollection<Polygon, LakeFeatureProperties> => {
    // Simple polygon approximating the Great Salt Lake shape
    return {
        type: "FeatureCollection" as const,
        features: [
            {
                type: "Feature" as const,
                properties: {}, // This is valid for LakeFeatureProperties if name is optional
                // or set to: { name: "Default Area" }
                // or even: null (if LakeFeatureProperties allows null for the properties object itself)
                geometry: {
                    type: "Polygon" as const,
                    coordinates: [[ // Coordinates for a single polygon
                        [-112.9, 41.4], // NW corner
                        [-112.6, 41.6], // North point
                        [-112.2, 41.5], // NE corner
                        [-112.0, 41.2], // East point
                        [-112.1, 40.8], // SE corner
                        [-112.3, 40.7], // South point
                        [-112.7, 40.8], // SW corner
                        [-112.9, 41.1], // West point
                        [-112.9, 41.4]  // Back to NW corner to close the polygon
                    ]]
                }
            }
        ]
    };
};