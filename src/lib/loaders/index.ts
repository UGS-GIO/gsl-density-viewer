import proj4 from 'proj4';
import { Feature, Point } from 'geojson';
import { TemperatureMap, getHardcodedTemperatureData } from '@/lib/data/temperature-data';
import { FeatureCollection, Geometry } from 'geojson';
import { LakeFeatureProperties } from '@/components/map/great-salt-lake-heatmap';

// Type Definition

// Structure of individual reading from the API
interface ApiReading {
    date: string;
    temperature?: number | null;
    // Density related fields (add others if known)
    'LABminusDENg/cm3'?: string | number | null;
    'LABminusDEN\ng/cm3'?: string | number | null; // Handle newline in key
    'LABminusDEN\\ng/cm3'?: string | number | null; // Handle escaped newline
    density?: string | number | null;
    // Salinity related fields
    'salinity eos (g/l)'?: string | number | null; // Case-insensitive check done in function
    salinity?: string | number | null; // General salinity, potentially ppt
    // Allow other dynamic keys
    [key: string]: any;
}

// Structure of a site object from the API
interface ApiSite {
    id: number | string; // API might use number, but we use string internally
    site?: string; // Preferred site ID
    geom?: string | { type?: string; coordinates?: [number, number] | number[] };
    utmeasting?: string | number | null;
    utmnorthing?: string | number | null;
    readings?: ApiReading[];
}

// Processed station structure (used internally and passed to components)
export interface ProcessedStation {
    id: string;
    name: string;
    longitude: number | null;
    latitude: number | null;
    coordsSource: 'geom' | 'utm' | 'default' | 'none' | 'mock'; // Added 'default' for clarity
}

// For data keyed by stationId then by timePoint
type StationDataValues = Record<string, number | undefined>; // Key: stationId
type TimePointStationData = Record<string, StationDataValues | undefined>; // Key: timePoint (YYYY-MM)

// Structure for allData: { variableKey: { timePoint: { stationId: value } } }
export interface AllLoadedData {
    density?: TimePointStationData;
    salinity?: TimePointStationData;
    temperature?: TemperatureMap; // Directly use TemperatureMap for averaged/processed temps
}

export type VariableKey = keyof AllLoadedData;


// For dataRanges: { variableKey: [min, max] }
export type DataRanges = Record<string, [number, number]>;

// Return type for GeoJSON loading
export interface GeoJsonResult {
    data: FeatureCollection<Geometry, LakeFeatureProperties> | null;
    error: string | null;
}

// Return type for main data loading function
export interface SiteDataResult {
    stations: ProcessedStation[];
    timePoints: string[];
    allData: AllLoadedData;
    dataRanges: DataRanges;
    usingMockData: boolean;
    error: string | null;
}

interface ApiSiteFeatureProperties {
    site?: string; // Preferred site ID
    id?: number | string; // Original feature ID from database, if present
    readings?: ApiReading[];
    utmeasting?: string | number | null; // Fallback if geometry is missing
    utmnorthing?: string | number | null; // Fallback
    [name: string]: any // todo: explore removing this
}

type SalinityData = {
    [yearMonth: string]: {
        [stationId: string]: number;
    };
};
type DensityData = {
    [yearMonth: string]: {
        [stationId: string]: number;
    };
};

// Constants
const API_ENDPOINT = 'https://postgrest-seamlessgeolmap-734948684426.us-central1.run.app/gsl_brine_sites';
const API_HEADERS = { 'Accept': 'application/geo+json', 'Accept-Profile': 'emp' };
const GSL_OUTLINE_ENDPOINT = 'https://ugs-geoserver-prod-flbcoqv7oa-uc.a.run.app/geoserver/gen_gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gen_gis%3Agsl_outline_split&maxFeatures=50&outputFormat=application%2Fjson';

const UTM_ZONE_12N_PROJ = '+proj=utm +zone=12 +datum=WGS84 +units=m +no_defs';
const WGS84_PROJ = '+proj=longlat +datum=WGS84 +no_defs';

const DEFAULT_LATITUDE = 41.0; // Default placeholder
const DEFAULT_LONGITUDE = -112.5; // Default placeholder

// Define the list of allowed site IDs
const ALLOWED_SITES = ['AC3', 'AIS', 'AS2', 'FB2', 'RT4', 'RD2', 'SJ-1', 'RD1', 'LVG4'];

// Define the minimum date (January 1, 2000)
const MIN_DATE = new Date(2000, 0, 1);

// Helper: Load GeoJSON
export const loadGeoJsonData = async () => {
    console.log("Fetching GeoJSON from:", GSL_OUTLINE_ENDPOINT);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(GSL_OUTLINE_ENDPOINT, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("GeoJSON fetch failed:", response.status, response.statusText, errorText);
            return { data: null, error: `HTTP error loading GeoJSON from URL! status: ${response.status}` };
        }
        const gslGeoJson = await response.json();
        console.log("GeoJSON loaded successfully:", gslGeoJson.type, `with ${gslGeoJson.features?.length || 0} features`);
        return { data: gslGeoJson, error: null };
    } catch (err) {
        if (err instanceof Error) {
            console.error('Error loading GeoJSON from URL:', err);
            return { data: null, error: `Failed to load map outline: ${err.message}` };
        } else {
            console.error('Unknown error loading GeoJSON from URL:', err);
            return { data: null, error: 'Failed to load map outline: Unknown error occurred.' };
        }
    }
};


// Helper: Process temperature data
const processTemperatureData = (
    existingTimePoints: Set<string>, // Use Set for efficient addition
    existingTempData: TemperatureMap
): { timePoints: string[]; temperatureData: TemperatureMap } => {
    try {
        const hardcodedTemps = getHardcodedTemperatureData();
        const combinedTempData = { ...existingTempData }; // Start with API/averaged data
        const timePointsSet = new Set(existingTimePoints);

        Object.entries(hardcodedTemps).forEach(([yearMonth, temp]) => {
            const [yearStr, monthStr] = yearMonth.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);

            if (!isNaN(year) && !isNaN(month)) {
                const date = new Date(year, month - 1, 1);
                if (date >= MIN_DATE) {
                    timePointsSet.add(yearMonth);
                    // Hardcoded data can override if existingTempData doesn't have it,
                    // or implement specific merging logic if needed (e.g., prefer API)
                    if (combinedTempData[yearMonth] === undefined) {
                        combinedTempData[yearMonth] = temp;
                    }
                }
            }
        });
        const sortedTimePoints = Array.from(timePointsSet).sort();
        return { timePoints: sortedTimePoints, temperatureData: combinedTempData };
    } catch (error: any) {
        console.error("Error processing temperature data:", error);
        // Return original data if processing fails
        return { timePoints: Array.from(existingTimePoints).sort(), temperatureData: existingTempData };
    }
};

// Helper: Process coordinates
const processSiteCoordinates = (site: ApiSite): ProcessedStation => {
    const stationId = site.site || `site-${site.id}`; // Ensure site.id is string if site.site undefined
    let longitude: number | null = null;
    let latitude: number | null = null;
    let coordsSource: ProcessedStation['coordsSource'] = 'none';

    try {
        if (site.geom) {
            let geomObj: { type?: string; coordinates?: [number, number] | number[] } | null = null;
            if (typeof site.geom === 'string') {
                try { geomObj = JSON.parse(site.geom); } catch { /* ignore parse error */ }
            } else if (typeof site.geom === 'object' && site.geom !== null) {
                geomObj = site.geom as { type?: string; coordinates?: any[] };
            }

            if (geomObj && geomObj.type === 'Point' && Array.isArray(geomObj.coordinates) &&
                geomObj.coordinates.length === 2 &&
                typeof geomObj.coordinates[0] === 'number' && typeof geomObj.coordinates[1] === 'number') {
                longitude = geomObj.coordinates[0];
                latitude = geomObj.coordinates[1];
                coordsSource = 'geom';
            }
        }

        if (coordsSource === 'none' && site.utmeasting != null && site.utmnorthing != null) {
            const easting = parseFloat(String(site.utmeasting));
            const northing = parseFloat(String(site.utmnorthing));
            if (!isNaN(easting) && !isNaN(northing)) {
                const lonLat = proj4(UTM_ZONE_12N_PROJ, WGS84_PROJ, [easting, northing]);
                longitude = lonLat[0];
                latitude = lonLat[1];
                coordsSource = 'utm';
            }
        }
    } catch (coordError: any) {
        console.warn(`Coordinate processing error for site ${stationId}:`, coordError.message);
    }

    if (longitude === null || latitude === null) {
        // console.warn(`Using default coordinates for site ${stationId}`); // Keep for dev if useful
        longitude = DEFAULT_LONGITUDE; // Default placeholder
        latitude = DEFAULT_LATITUDE;   // Default placeholder
        coordsSource = 'default';
    }
    return { id: stationId, name: site.site || `Site ${String(site.id)}`, longitude, latitude, coordsSource };
};

// --- Helper function to extract density ---
const extractDensityValue = (reading: ApiReading): number | null => {
    const possibleKeys = ['LABminusDENg/cm3', 'LABminusDEN\ng/cm3', 'LABminusDEN\\ng/cm3', 'density'];
    for (const key of possibleKeys) {
        const value = reading[key];
        if (value !== undefined && value !== null) {
            const density = parseFloat(String(value));
            if (!isNaN(density)) return density;
        }
    }
    // Attempt broader search for LABminusDEN
    const dynamicDensityKey = Object.keys(reading).find(key => key.toUpperCase().includes("LABMINUSDEN"));
    if (dynamicDensityKey) {
        const value = reading[dynamicDensityKey];
        if (value !== undefined && value !== null) {
            const density = parseFloat(String(value));
            if (!isNaN(density)) return density;
        }
    }
    // Fallback: derive from salinity if density is missing
    const salinityValue = reading.salinity; // Assuming this key exists if others fail
    if (salinityValue !== undefined && salinityValue !== null) {
        const salinity = parseFloat(String(salinityValue));
        if (!isNaN(salinity)) return 1 + (salinity * 0.00075); // Simplified conversion from ppt-like salinity
    }
    return null;
};


// --- NEW: Helper function to extract salinity ---
const extractSalinityValue = (reading: ApiReading): number | null => {
    const salinityEOSKey = Object.keys(reading).find(key => key.toLowerCase() === 'salinity eos (g/l)');
    if (salinityEOSKey && reading[salinityEOSKey] !== null && reading[salinityEOSKey] !== undefined) {
        const salinity = parseFloat(String(reading[salinityEOSKey]));
        if (!isNaN(salinity)) return salinity;
    }
    // Fallback to a generic "salinity" key
    if (reading.salinity !== undefined && reading.salinity !== null) {
        const salinity = parseFloat(String(reading.salinity));
        // Assuming this might be in ppt or another unit; direct return for now.
        // If conversion to g/L is needed and this isn't already g/L, add it here.
        if (!isNaN(salinity)) return salinity;
    }
    return null;
};

// Helper: Check date
const isDateOnOrAfter2000 = (dateStr: string) => {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return false;
        return date >= MIN_DATE;
    } catch (e) { return false; }
};

/**
 * Checks if a given date string represents a date that is on or after January 1, 2000.
 *
 * @param dateStr - The date string to check (e.g., "2023-01-15", "01/15/2023").
 * @returns {boolean} True if the date is valid and on or after January 1, 2000, otherwise false.
 */
export const isDateOnOrAfterMinDate = (dateStr: string): boolean => {
    if (!dateStr) {
        return false;
    }
    try {
        const date = new Date(dateStr);

        if (isNaN(date.getTime())) {
            console.warn(`isDateOnOrAfterMinDate: Invalid date string provided: ${dateStr}`);
            return false;
        }
        return date >= MIN_DATE;
    } catch (e) {
        console.error(`isDateOnOrAfterMinDate: Error parsing date string "${dateStr}":`, e);
        return false;
    }
};


interface MockDenSityForStationsProps {
    stations: ProcessedStation[];
    timePoints: string[];
    temperatureData: TemperatureMap;
}


// --- Helper function to generate mock density ---
const generateMockDensityForStations = ({ stations, timePoints, temperatureData }: MockDenSityForStationsProps) => {
    const densityData: DensityData = {};

    timePoints.forEach(yearMonth => {
        densityData[yearMonth] = {};
        const [year, month] = yearMonth.split('-').map(Number);
        const temp = temperatureData[yearMonth];
        stations.forEach((station, index) => {
            const tempFactor = temp ? (temp - 30) / 50 * 0.03 : 0;
            const yearFactor = (year - 2000) * 0.0005;
            const seasonalFactor = Math.sin((month - 1) / 12 * 2 * Math.PI) * 0.01;
            const stationFactor = (index / stations.length) * 0.05;
            const randomFactor = (Math.random() - 0.5) * 0.015;
            const baseDensity = 1.10 + tempFactor + yearFactor + seasonalFactor + stationFactor + randomFactor;
            densityData[yearMonth][station.id] = Math.max(1.02, Math.min(1.28, baseDensity));
        });
    });
    return densityData;
};


// --- NEW: Helper function to generate mock salinity ---
const generateMockSalinityForStations = ({ stations, timePoints, temperatureData }: MockDenSityForStationsProps) => {
    const salinityData: SalinityData = {};
    const baseSalinity = 150; // Base g/L - adjust if needed

    timePoints.forEach(yearMonth => {
        salinityData[yearMonth] = {};
        const [year, month] = yearMonth.split('-').map(Number);
        const temp = temperatureData[yearMonth];

        stations.forEach((station, index) => {
            const tempFactor = temp ? (temp - 50) / 50 * -10 : 0; // Example inverse relation
            const yearFactor = (year - 2000) * 0.1;
            const seasonalFactor = Math.sin((month - 1) / 12 * 2 * Math.PI) * -15; // Lower in summer
            const stationFactor = (index / stations.length) * 30;
            const randomFactor = (Math.random() - 0.5) * 20;
            let salinity = baseSalinity + tempFactor + yearFactor + seasonalFactor + stationFactor + randomFactor;
            salinityData[yearMonth][station.id] = Math.max(30, Math.min(280, salinity)); // g/L range
        });
    });
    return salinityData;
};


// --- Main data loading function ---
export const loadSiteAndTempData = async () => {
    console.log("Fetching site data...");
    try {
        let sitesJson: FeatureCollection<Point, ApiSiteFeatureProperties> = { type: 'FeatureCollection', features: [] };
        let processedStations: ProcessedStation[] = [];
        let tempLookup: TemperatureMap = {};
        let errorMessage = null;
        let apiSuccessful = false;
        let apiTempIntermediateLookup: Record<string, { sum: number; count: number }> = {};
        let densityLookup: TimePointStationData = {};
        let salinityLookup: TimePointStationData = {};
        let timePointsSet = new Set<string>(); // To collect all unique YYYY-MM strings
        let hasRealDensity = false;
        let hasRealSalinity = false;

        // Fetch API data
        try {
            const response = await fetch(API_ENDPOINT, { method: 'GET', headers: API_HEADERS, signal: AbortSignal.timeout(5000) });
            console.log("API Response:", response);
            if (response.ok) {
                sitesJson = await response.json();
                console.log("API data loaded successfully:", sitesJson.type, `with ${sitesJson.features?.length || 0} features`);
                console.log("API data:", sitesJson);


                apiSuccessful = true;
                const filteredSites = sitesJson.features.filter(site => ALLOWED_SITES.includes(site.properties.site || `site-${site.properties.id}`));
                sitesJson.features = filteredSites;
                processedStations = sitesJson.features.map(
                    (feature: Feature<Point, ApiSiteFeatureProperties>): ProcessedStation => {
                        const properties = feature.properties || {};

                        const siteArgForOldFunction: ApiSite = {
                            // 1. Ensure unique ID:
                            id: String(properties.id || feature.id || properties.site || `fallback-${Math.random().toString(36).substring(2)}`),

                            // 2. Map other properties:
                            site: properties.site,
                            geom: feature.geometry,
                            utmeasting: properties.utmeasting,
                            utmnorthing: properties.utmnorthing,
                            readings: properties.readings,
                        };

                        return processSiteCoordinates(siteArgForOldFunction);
                    }
                ).filter(station => station.longitude != null && station.latitude != null);

                if (processedStations.length > 0 && sitesJson.features.length > 0) {
                    sitesJson.features.forEach(feature => {
                        // Find the corresponding ProcessedStation to ensure we're only working with allowed/valid stations
                        // and to use its consistent 'id'.
                        const stationIdFromProps = feature.properties?.site || (feature.id ? `feature-${String(feature.id)}` : undefined);
                        const station = processedStations.find(ps => ps.id === stationIdFromProps);

                        if (!station || !feature.properties?.readings || !Array.isArray(feature.properties.readings)) {
                            return; // Skip if no matching processed station or no readings
                        }

                        feature.properties.readings.forEach(reading => {
                            if (!reading.date || !isDateOnOrAfterMinDate(reading.date)) {
                                return; // Skip if no valid date or date is before MIN_DATE
                            }

                            try {
                                const dateObj = new Date(reading.date);
                                if (isNaN(dateObj.getTime())) return; // Skip invalid dates

                                const year = dateObj.getFullYear();
                                const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                                const yearMonth = `${year}-${month}`;

                                timePointsSet.add(yearMonth);

                                // 1. Process Temperature Data (collect for averaging)
                                if (reading.temperature != null && typeof reading.temperature === 'number' && !isNaN(reading.temperature)) {
                                    if (!apiTempIntermediateLookup[yearMonth]) {
                                        apiTempIntermediateLookup[yearMonth] = { sum: 0, count: 0 };
                                    }
                                    apiTempIntermediateLookup[yearMonth].sum += reading.temperature;
                                    apiTempIntermediateLookup[yearMonth].count++;
                                }

                                // 2. Process Density Data
                                const densityValue = extractDensityValue(reading);
                                if (densityValue !== null) {
                                    hasRealDensity = true;
                                    if (!densityLookup[yearMonth]) {
                                        densityLookup[yearMonth] = {};
                                    }
                                    // Type assertion to assure TypeScript that densityLookup[yearMonth] is now defined
                                    (densityLookup[yearMonth] as StationDataValues)[station.id] = densityValue;
                                }

                                // 3. Process Salinity Data
                                const salinityValue = extractSalinityValue(reading);
                                if (salinityValue !== null) {
                                    hasRealSalinity = true;
                                    if (!salinityLookup[yearMonth]) {
                                        salinityLookup[yearMonth] = {};
                                    }
                                    // Type assertion
                                    (salinityLookup[yearMonth] as StationDataValues)[station.id] = salinityValue;
                                }
                            } catch (parseError: any) {
                                console.warn(`Error parsing reading for station ${station.id}:`, parseError.message);
                            }
                        });
                    });
                }
            } else { errorMessage = `API fetch failed: ${response.status} ${response.statusText}`; console.warn(errorMessage); }
        } catch (apiError) {
            if (apiError instanceof Error) {
                errorMessage = `Error fetching from API: ${apiError.message}`;
                console.error(errorMessage, apiError);
            } else {
                errorMessage = `Unknown error occurred while fetching from API.`;
                console.error(errorMessage, apiError);
            }
        }

        // Process hardcoded temperature data (keep as before)
        try {
            const tempResult = processTemperatureData(timePointsSet, tempLookup);
            if (tempResult) {

                console.log("Processed temperature data:", tempResult);

                timePointsSet = new Set(tempResult.timePoints);
                tempLookup = tempResult.temperatureData;
            }
        } catch (tempError) { console.warn("Error processing temperature data:", tempError); }

        // Filter and sort time points (keep as before)
        const allTimePoints = Array.from(timePointsSet)
            .filter(yearMonth => {
                console.log("Filtering time point:", typeof yearMonth);

                const [year] = yearMonth.split('-').map(Number); return year >= 2000;
            })
            .sort();

        // --- Generate/Supplement Density & Salinity ---
        let usingMockData = false;
        if (processedStations.length > 0 && allTimePoints.length > 0) {
            if (!hasRealDensity) {
                console.log("Generating synthetic density data.");
                densityLookup = generateMockDensityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
                usingMockData = true; // Mark if density is fully mocked
            } else {
                console.log("Supplementing density data.");
                const syntheticDensity = generateMockDensityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
                allTimePoints.forEach(yearMonth => {
                    const densityLookupYearMonth = densityLookup[yearMonth] ?? (densityLookup[yearMonth] = {});

                    processedStations.forEach(station => {
                        if (densityLookupYearMonth?.[station.id] === undefined &&
                            syntheticDensity[yearMonth]?.[station.id] !== undefined) {
                            densityLookupYearMonth[station.id] = syntheticDensity[yearMonth][station.id];
                        }
                    });
                });
            }

            // ++ Generate/Supplement Salinity ++
            if (!hasRealSalinity) {
                console.log("Generating synthetic salinity data.");
                salinityLookup = generateMockSalinityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
                // Set usingMockData only if density is also mocked
                if (!hasRealDensity) usingMockData = true;
            } else {
                console.log("Supplementing salinity data.");
                const syntheticSalinity = generateMockSalinityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
                allTimePoints.forEach(yearMonth => {
                    if (!salinityLookup[yearMonth]) salinityLookup[yearMonth] = {};
                    processedStations.forEach(station => {
                        if (salinityLookup[yearMonth]?.[station.id] === undefined &&
                            syntheticSalinity[yearMonth]?.[station.id] !== undefined) {
                            const salinityLookupYearMonth = salinityLookup[yearMonth] ?? (salinityLookup[yearMonth] = {});
                            salinityLookupYearMonth[station.id] = syntheticSalinity[yearMonth][station.id];
                        }
                    });
                });
            }
        }

        // --- Handle complete mock data generation if necessary ---
        if (processedStations.length === 0 || allTimePoints.length === 0) {
            // ... (This section is largely the same as before, ensure it generates both lookups) ...
            console.warn("Insufficient initial data. Generating complete mock dataset.");
            usingMockData = true;
            errorMessage = errorMessage || "Data unavailable. Displaying simulated data.";
            processedStations = ALLOWED_SITES.map((id, index) => ({
                id, name: `Site ${id}`,
                longitude: -112.5 + 0.2 * Math.cos(index / ALLOWED_SITES.length * 2 * Math.PI),
                latitude: 41.0 + 0.2 * Math.sin(index / ALLOWED_SITES.length * 2 * Math.PI),
                coordsSource: 'mock'
            }));
            const mockTimePoints = []; // generate points from 2000 to present
            const startYear = 2000; const endYear = new Date().getFullYear(); const endMonth = new Date().getMonth() + 1;
            for (let y = startYear; y <= endYear; y++) {
                const mLimit = y === endYear ? endMonth : 12;
                for (let m = 1; m <= mLimit; m++) mockTimePoints.push(`${y}-${m.toString().padStart(2, '0')}`);
            }
            allTimePoints.push(...mockTimePoints.filter(tp => !allTimePoints.includes(tp)));
            allTimePoints.sort();
            allTimePoints.forEach(tp => {
                if (!tempLookup[tp]) {
                    const [y, m] = tp.split('-').map(Number);
                    tempLookup[tp] = 50 + Math.sin((m - 1) / 12 * 2 * Math.PI) * 25 + (y - startYear) * 0.2 + (Math.random() - 0.5) * 5;
                }
            });
            densityLookup = generateMockDensityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
            salinityLookup = generateMockSalinityForStations({ stations: processedStations, timePoints: allTimePoints, temperatureData: tempLookup });
        }

        // --- Calculate ranges for BOTH variables ---
        const calculateRange = (dataLookup: TimePointStationData): [number, number] => {
            let range: [number, number] = [0, 1]; // Default range
            const allValues: number[] = [];

            if (dataLookup && typeof dataLookup === 'object') {
                Object.values(dataLookup).forEach(monthData => {
                    if (monthData && typeof monthData === 'object') {
                        Object.values(monthData).forEach(value => {
                            if (typeof value === 'number' && !isNaN(value)) {
                                allValues.push(value);
                            }
                        });
                    }
                });
            }

            if (allValues.length > 0) {
                const minVal = Math.min(...allValues);
                const maxVal = Math.max(...allValues);
                const padding = (maxVal - minVal) * 0.02 || (maxVal * 0.02); // Add padding, handle min=max
                range = [Math.max(0, minVal - padding), maxVal + padding];

                if (range[0] === range[1]) {
                    // Ensure range is valid if min=max
                    range[0] = Math.max(0, range[0] * 0.9);
                    range[1] = range[1] * 1.1 || 0.1; // Ensure max is slightly > min
                }
            }

            return range;
        };

        const densityRangeTuple = calculateRange(densityLookup); // Already returns [number, number]
        const salinityRangeTuple = calculateRange(salinityLookup); // Already returns [number, number]


        const DEFAULT_DENSITY_FALLBACK: [number, number] = [1.0, 1.25];
        const DEFAULT_SALINITY_FALLBACK: [number, number] = [50, 250];

        // Assuming calculateRange always returns [number, number], densityRangeTuple[0] will not be null.
        // Adjust the condition if calculateRange could return something where densityRangeTuple[0] could be null.
        const conditionForDensityDefault = (densityRangeTuple[0] === 0 && densityRangeTuple[1] === 1);
        const finalDensityRange: [number, number] = conditionForDensityDefault
            ? DEFAULT_DENSITY_FALLBACK
            : densityRangeTuple;

        const conditionForSalinityDefault = (salinityRangeTuple[0] === 0 && salinityRangeTuple[1] === 1);
        const finalSalinityRange: [number, number] = conditionForSalinityDefault
            ? DEFAULT_SALINITY_FALLBACK
            : salinityRangeTuple;

        // Apply specific defaults if calculation resulted in [0, 1] or still null
        // const finalDensityRange: [number, number] = (densityRange[0] === 0 && densityRange[1] === 1) || densityRange[0] === null ? [1.0, 1.25] : densityRange;
        // const finalSalinityRange: [number, number] = (salinityRange[0] === 0 && salinityRange[1] === 1) || salinityRange[0] === null ? [50, 250] : salinityRange;

        const dataRanges: DataRanges = {
            density: finalDensityRange,
            salinity: finalSalinityRange
        };

        const result: SiteDataResult = {
            stations: processedStations,
            timePoints: allTimePoints,
            allData: {
                density: densityLookup,
                salinity: salinityLookup,
                temperature: tempLookup
            },
            dataRanges: dataRanges,
            usingMockData,
            error: errorMessage
        };


        // --- Structure the return object ---
        return result;

    } catch (err) {
        // --- Fallback ---

        let errorMessage = 'Failed to load data';
        if (err instanceof Error) {
            errorMessage = `Failed to load data: ${err.message}`;
        }
        console.error('DataLoader Critical Error:', err);
        const mockStations: ProcessedStation[] = ALLOWED_SITES.map((id, index) => ({ id, name: `Site ${id}`, longitude: -112.5 + 0.2 * Math.cos(index / ALLOWED_SITES.length * 2 * Math.PI), latitude: 41.0 + 0.2 * Math.sin(index / ALLOWED_SITES.length * 2 * Math.PI), coordsSource: 'mock' }));
        const mockTimePoints = []; const startYear = 2000; const endYear = 2025; const currentMonth = new Date().getMonth() + 1;
        for (let y = startYear; y <= endYear; y++) { for (let m = 1; m <= 12; m++) { if (y === endYear && m > currentMonth) continue; mockTimePoints.push(`${y}-${m.toString().padStart(2, '0')}`); } }
        const mockTempData: TemperatureMap = {};
        mockTimePoints.forEach(tp => { const [y, m] = tp.split('-').map(Number); mockTempData[tp] = 50 + Math.sin((m - 1) / 12 * 2 * Math.PI) * 25 + (y - startYear) * 0.2 + (Math.random() - 0.5) * 5; });
        const mockDensityData = generateMockDensityForStations({ stations: mockStations, timePoints: mockTimePoints, temperatureData: mockTempData });
        const mockSalinityData = generateMockSalinityForStations({ stations: mockStations, timePoints: mockTimePoints, temperatureData: mockTempData });

        return {
            stations: mockStations,
            timePoints: mockTimePoints,
            allData: { density: mockDensityData, salinity: mockSalinityData, temperature: mockTempData },
            dataRanges: { density: [1.05, 1.20] as [number, number], salinity: [50, 250] as [number, number] },
            usingMockData: true,
            error: `Failed to load data: ${errorMessage}`
        };
    }
};