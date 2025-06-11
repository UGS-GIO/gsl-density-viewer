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

// Constants
const API_ENDPOINT = 'https://postgrest-seamlessgeolmap-734948684426.us-central1.run.app/gsl_brine_sites';
const API_HEADERS = { 'Accept': 'application/geo+json', 'Accept-Profile': 'emp' };
const GSL_OUTLINE_ENDPOINT = 'https://ugs-geoserver-prod-flbcoqv7oa-uc.a.run.app/geoserver/gen_gis/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=gen_gis%3Agsl_outline_split&maxFeatures=50&outputFormat=application%2Fjson';

const UTM_ZONE_12N_PROJ = '+proj=utm +zone=12 +datum=WGS84 +units=m +no_defs';
const WGS84_PROJ = '+proj=longlat +datum=WGS84 +no_defs';

const DEFAULT_LATITUDE = 41.0; // Default placeholder
const DEFAULT_LONGITUDE = -112.5; // Default placeholder

// Define the list of allowed site IDs
const ALLOWED_SITES = ['AC3', 'AIS', 'AS2', 'FB2', 'RT4', 'RD2', 'SJ-1', 'LVG4'];

// Define the minimum date (January 1, 2000)
const MIN_DATE = new Date(2000, 0, 1);

// Timeout for fetch requests
const FETCH_TIMEOUT_MS = 5000; // 5 seconds

// Helper: Load GeoJSON
export const loadGeoJsonData = async (): Promise<GeoJsonResult> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(GSL_OUTLINE_ENDPOINT, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) {
            const errorText = await response.text();
            console.error("GeoJSON fetch failed:", response.status, response.statusText, errorText);
            return { data: null, error: `HTTP error loading GeoJSON from URL! status: ${response.status}` };
        }
        const gslGeoJson = await response.json();
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
        longitude = DEFAULT_LONGITUDE; // Default placeholder
        latitude = DEFAULT_LATITUDE;   // Default placeholder
        coordsSource = 'default';
    }
    return { id: stationId, name: site.site || `Site ${String(site.id)}`, longitude, latitude, coordsSource };
};

// Helper function to extract density
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

// Helper function to extract salinity
const extractSalinityValue = (reading: ApiReading): number | null => {
    const tdsKey = Object.keys(reading).find(key => 
        key.toLowerCase().includes('tds') && key.toLowerCase().includes('g/l')
    );
    
    if (tdsKey && reading[tdsKey] !== null && reading[tdsKey] !== undefined) {
        const tds = parseFloat(String(reading[tdsKey]));
        if (!isNaN(tds) && tds > 0) return tds; 
    }
    
    const salinityEOSKey = Object.keys(reading).find(key => 
        key.toLowerCase() === 'salinity eos (g/l)'
    );
    
    if (salinityEOSKey && reading[salinityEOSKey] !== null && reading[salinityEOSKey] !== undefined) {
        const salinity = parseFloat(String(reading[salinityEOSKey]));
        if (!isNaN(salinity) && salinity > 0) return salinity;
    }
    
    if (reading.salinity !== undefined && reading.salinity !== null) {
        const salinity = parseFloat(String(reading.salinity));
        if (!isNaN(salinity) && salinity > 0) return salinity;
    }
    
    return null;
};


/**
 * Checks if a given date string represents a date that is on or after January 1, 2000.
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

// Main data loading function - API ONLY, NO MOCK DATA
export const loadSiteAndTempData = async (): Promise<SiteDataResult> => {
    try {
        let sitesJson: FeatureCollection<Point, ApiSiteFeatureProperties> = { 
            type: 'FeatureCollection', 
            features: [] 
        };
        let processedStations: ProcessedStation[] = [];
        let tempLookup: TemperatureMap = {};
        let errorMessage: string | null = null;
        const densityLookup: TimePointStationData = {};
        const salinityLookup: TimePointStationData = {};
        let timePointsSet = new Set<string>();



        // Fetch API data
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            
            const response = await fetch(API_ENDPOINT, { 
                method: 'GET', 
                headers: API_HEADERS, 
                signal: controller.signal 
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            sitesJson = await response.json();
            console.log('API fetch successful');

            // Filter to allowed sites only
            const filteredSites = sitesJson.features.filter(site => 
                ALLOWED_SITES.includes(site.properties?.site || `site-${site.properties?.id}`)
            );
            sitesJson.features = filteredSites;

            // Process stations
            processedStations = sitesJson.features
                .map((feature: Feature<Point, ApiSiteFeatureProperties>): ProcessedStation => {
                    const properties = feature.properties || {};
                    const siteArgForOldFunction: ApiSite = {
                        id: String(properties.id || feature.id || properties.site || `fallback-${Math.random().toString(36).substring(2)}`),
                        site: properties.site,
                        geom: feature.geometry,
                        utmeasting: properties.utmeasting,
                        utmnorthing: properties.utmnorthing,
                        readings: properties.readings,
                    };
                    return processSiteCoordinates(siteArgForOldFunction);
                })
                .filter(station => station.longitude != null && station.latitude != null);


            // Process readings - ONLY real data
            if (processedStations.length > 0 && sitesJson.features.length > 0) {
                sitesJson.features.forEach(feature => {
                    const stationIdFromProps = feature.properties?.site || 
                        (feature.id ? `feature-${String(feature.id)}` : undefined);
                    const station = processedStations.find(ps => ps.id === stationIdFromProps);

                    if (!station || !feature.properties?.readings || !Array.isArray(feature.properties.readings)) {
                        return;
                    }


                    feature.properties.readings.forEach(reading => {
                        if (!reading.date || !isDateOnOrAfterMinDate(reading.date)) {
                            return;
                        }

                        try {
                            const dateObj = new Date(reading.date);
                            if (isNaN(dateObj.getTime())) return;

                            const year = dateObj.getFullYear();
                            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                            const yearMonth = `${year}-${month}`;

                            timePointsSet.add(yearMonth);

                            // Process Density Data - ONLY if it exists
                            const densityValue = extractDensityValue(reading);
                            if (densityValue !== null) {
                                if (!densityLookup[yearMonth]) {
                                    densityLookup[yearMonth] = {};
                                }
                                (densityLookup[yearMonth] as StationDataValues)[station.id] = densityValue;
                            }

                            // Process Salinity Data - ONLY if it exists
                            const salinityValue = extractSalinityValue(reading);
                            if (salinityValue !== null) {
                                if (!salinityLookup[yearMonth]) {
                                    salinityLookup[yearMonth] = {};
                                }
                                (salinityLookup[yearMonth] as StationDataValues)[station.id] = salinityValue;
                            }
                        } catch (parseError: any) {
                            console.warn(`Error parsing reading for station ${station.id}:`, parseError.message);
                        }
                    });
                });
            }

        } catch (apiError) {
            if (apiError instanceof Error) {
                errorMessage = `Error fetching from API: ${apiError.message}`;
                console.error('❌ API Error:', errorMessage);
            } else {
                errorMessage = `Unknown error occurred while fetching from API.`;
                console.error('❌ Unknown API Error:', apiError);
            }
            
            // Return empty data on API failure - NO MOCK FALLBACK
            return {
                stations: [],
                timePoints: [],
                allData: {},
                dataRanges: {},
                usingMockData: false,
                error: errorMessage
            };
        }

        // Process hardcoded temperature data (keep this as it's separate from mock generation)
        try {
            const tempResult = processTemperatureData(timePointsSet, tempLookup);
            if (tempResult) {
                timePointsSet = new Set(tempResult.timePoints);
                tempLookup = tempResult.temperatureData;
            }
        } catch (tempError) {
            console.warn("Error processing temperature data:", tempError);
        }

        // Filter and sort time points
        const allTimePoints = Array.from(timePointsSet)
            .filter(yearMonth => {
                const [year] = yearMonth.split('-').map(Number);
                return year >= 2000;
            })
            .sort();


        // Calculate ranges ONLY from real data
        const calculateRange = (dataLookup: TimePointStationData): [number, number] => {
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

            if (allValues.length === 0) {
                return [0, 1]; // Default if no data
            }

            const minVal = Math.min(...allValues);
            const maxVal = Math.max(...allValues);
            const padding = (maxVal - minVal) * 0.02 || (maxVal * 0.02);
            let range: [number, number] = [Math.max(0, minVal - padding), maxVal + padding];

            if (range[0] === range[1]) {
                range[0] = Math.max(0, range[0] * 0.9);
                range[1] = range[1] * 1.1 || 0.1;
            }

            return range;
        };

        const densityRange = calculateRange(densityLookup);
        const salinityRange = calculateRange(salinityLookup);

        const dataRanges: DataRanges = {
            density: densityRange,
            salinity: salinityRange
        };


        // Build final result - NO MOCK DATA EVER
        const result: SiteDataResult = {
            stations: processedStations,
            timePoints: allTimePoints,
            allData: {
                density: densityLookup,
                salinity: salinityLookup,
                temperature: tempLookup
            },
            dataRanges: dataRanges,
            usingMockData: false, // Never using mock data
            error: errorMessage
        };

        return result;

    } catch (err) {
        // Complete failure - return empty data, NO MOCK FALLBACK
        let errorMessage = 'Failed to load data';
        if (err instanceof Error) {
            errorMessage = `Failed to load data: ${err.message}`;
        }
        console.error('💥 Complete data loading failure:', err);

        return {
            stations: [],
            timePoints: [],
            allData: {},
            dataRanges: {},
            usingMockData: false,
            error: errorMessage
        };
    }
};