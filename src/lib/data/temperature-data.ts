/**
 * Represents the raw monthly temperature data for a single year.
 * Values can be numbers, null (for future/no data), or 'M' (for explicitly missing).
 */
interface MonthlyTemperatureEntry {
    year: number;
    values: (number | null | 'M')[];
}

/**
 * Represents a map of temperatures keyed by 'YYYY-MM'.
 * Only valid numerical temperatures are stored.
 */
export type TemperatureMap = Record<string, number>;

/**
 * Provides hardcoded temperature data for the Great Salt Lake.
 * Data extracted from 'Great Salt Lake Temperature Data (2000-2025).txt'.
 *
 * @returns {TemperatureMap} Temperature data keyed by 'YYYY-MM'.
 */
export const getHardcodedTemperatureData = (): TemperatureMap => {
    const temperatureMap: TemperatureMap = {};

    const rawData: MonthlyTemperatureEntry[] = [
        { year: 2000, values: [35.1, 39.8, 42.0, 54.5, 61.7, 72.1, 80.8, 78.9, 64.6, 52.3, 31.4, 30.7] },
        { year: 2001, values: [27.3, 34.4, 45.4, 50.1, 63.6, 70.9, 79.4, 79.0, 70.2, 55.0, 42.6, 26.3] },
        { year: 2002, values: [26.0, 27.9, 38.9, 51.6, 59.9, 71.8, 81.9, 75.5, 66.0, 49.7, 37.6, 35.5] },
        { year: 2003, values: [38.3, 34.6, 44.5, 50.4, 61.3, 71.2, 83.5, 80.0, 65.8, 57.9, 37.3, 33.5] },
        { year: 2004, values: [22.4, 26.9, 47.7, 52.4, 60.3, 70.2, 79.0, 74.2, 65.3, 53.9, 39.0, 32.7] },
        { year: 2005, values: [34.4, 34.9, 42.7, 50.5, 59.3, 66.7, 80.8, 77.0, 65.5, 54.4, 41.4, 31.5] },
        { year: 2006, values: [34.4, 33.5, 41.6, 53.3, 63.1, 73.2, 83.0, 76.5, 63.4, 50.5, 41.0, 30.7] },
        { year: 2007, values: [21.1, 36.8, 46.3, 52.5, 63.0, 73.2, 84.0, 80.6, 66.7, 51.9, 41.9, 27.0] },
        { year: 2008, values: [23.9, 33.2, 40.4, 46.2, 57.4, 69.9, 81.4, 77.8, 66.5, 53.1, 42.9, 30.0] },
        { year: 2009, values: [30.6, 36.2, 42.0, 48.8, 61.5, 66.4, 79.0, 75.5, 70.6, 49.4, 41.0, 23.6] },
        { year: 2010, values: [28.0, 36.6, 42.7, 48.9, 53.2, 68.5, 78.0, 76.1, 68.8, 56.7, 39.3, 33.5] },
        { year: 2011, values: [27.6, 34.1, 43.4, 45.4, 53.1, 66.2, 78.5, 79.0, 69.6, 54.8, 39.3, 29.4] },
        { year: 2012, values: [33.2, 37.3, 49.0, 54.1, 61.5, 73.6, 82.2, 81.7, 70.0, 55.3, 45.5, 34.8] },
        { year: 2013, values: [21.4, 28.6, 43.6, 49.4, 62.5, 75.3, 84.1, 80.7, 70.4, 52.4, 44.4, 24.6] },
        { year: 2014, values: [30.4, 42.1, 49.0, 51.9, 61.7, 69.5, 81.3, 74.3, 70.0, 57.3, 41.3, 37.3] },
        { year: 2015, values: [34.3, 43.9, 49.7, 52.3, 59.9, 77.5, 77.4, 77.6, 70.8, 60.5, 39.8, 31.3] },
        { year: 2016, values: [30.4, 37.1, 47.1, 55.2, 61.7, 77.5, 83.1, 80.2, 67.3, 58.3, 47.0, 29.5] },
        { year: 2017, values: [32.1, 40.0, 50.1, 50.3, 62.5, 76.0, 85.3, 81.8, 66.9, 52.6, 47.8, 33.0] },
        { year: 2018, values: [39.0, 38.6, 46.5, 54.8, 64.5, 74.6, 83.1, 77.7, 70.8, 53.2, 39.1, 31.7] },
        { year: 2019, values: [30.9, 34.7, 42.8, 52.5, 58.0, 70.4, 82.0, 80.3, 67.9, 46.5, 41.8, 33.9] },
        { year: 2020, values: [35.7, 35.0, 46.5, 53.3, 64.7, 70.1, 81.1, 80.4, 69.4, 56.0, 42.5, 30.0] },
        { year: 2021, values: [33.0, 36.4, 44.7, 51.3, 62.7, 80.2, 85.7, 76.8, 70.3, 53.2, 45.0, 34.8] },
        { year: 2022, values: [31.9, 33.2, 46.3, 50.8, 59.4, 74.7, 87.8, 82.1, 75.1, 58.0, 37.2, 33.0] },
        { year: 2023, values: [33.5, 32.5, 39.4, 50.3, 67.2, 71.4, 85.3, 78.9, 70.8, 55.8, 42.8, 36.5] },
        { year: 2024, values: [34.8, 40.9, 44.9, 54.1, 58.8, 77.6, 83.3, 80.0, 73.0, 62.4, 40.9, 37.4] },
        { year: 2025, values: [32.4, 39.7, 45.6] }, // Partial data for 2025
    ];

    rawData.forEach((yearData) => {
        const year = yearData.year;
        yearData.values.forEach((temp, monthIndex) => {
            // Skip missing values (marked as 'M' in original data or null)
            if (temp === 'M' || temp === null) {
                return;
            }

            // Ensure temp is a number before proceeding (TypeScript helps here)
            if (typeof temp === 'number') {
                const month = (monthIndex + 1).toString().padStart(2, '0');
                const key = `${year}-${month}`;
                temperatureMap[key] = temp;
            }
        });
    });

    return temperatureMap;
};

/**
 * Represents the raw annual temperature data with named months.
 * Values can be numbers or null (for missing/future data).
 */
export interface RawAnnualTemperatureEntry {
    year: number;
    jan: number | null;
    feb: number | null;
    mar: number | null;
    apr: number | null;
    may: number | null;
    jun: number | null;
    jul: number | null;
    aug: number | null;
    sep: number | null;
    oct: number | null;
    nov: number | null;
    dec: number | null;
    annual: number | null;
}

/**
 * Get raw annual temperature data.
 * This function returns the data in its original structure with named months if needed.
 * @returns {RawAnnualTemperatureEntry[]} Array of yearly temperature data objects.
 */
export const getRawTemperatureData = (): RawAnnualTemperatureEntry[] => {
    // Data is directly returned, so TypeScript infers the type from the structure.
    // Explicitly typing it with RawAnnualTemperatureEntry[] ensures consistency.
    const data: RawAnnualTemperatureEntry[] = [
        { year: 2000, jan: 35.1, feb: 39.8, mar: 42.0, apr: 54.5, may: 61.7, jun: 72.1, jul: 80.8, aug: 78.9, sep: 64.6, oct: 52.3, nov: 31.4, dec: 30.7, annual: 53.7 },
        { year: 2001, jan: 27.3, feb: 34.4, mar: 45.4, apr: 50.1, may: 63.6, jun: 70.9, jul: 79.4, aug: 79.0, sep: 70.2, oct: 55.0, nov: 42.6, dec: 26.3, annual: 53.7 },
        { year: 2002, jan: 26.0, feb: 27.9, mar: 38.9, apr: 51.6, may: 59.9, jun: 71.8, jul: 81.9, aug: 75.5, sep: 66.0, oct: 49.7, nov: 37.6, dec: 35.5, annual: 51.9 },
        { year: 2003, jan: 38.3, feb: 34.6, mar: 44.5, apr: 50.4, may: 61.3, jun: 71.2, jul: 83.5, aug: 80.0, sep: 65.8, oct: 57.9, nov: 37.3, dec: 33.5, annual: 54.9 },
        { year: 2004, jan: 22.4, feb: 26.9, mar: 47.7, apr: 52.4, may: 60.3, jun: 70.2, jul: 79.0, aug: 74.2, sep: 65.3, oct: 53.9, nov: 39.0, dec: 32.7, annual: 52.0 },
        { year: 2005, jan: 34.4, feb: 34.9, mar: 42.7, apr: 50.5, may: 59.3, jun: 66.7, jul: 80.8, aug: 77.0, sep: 65.5, oct: 54.4, nov: 41.4, dec: 31.5, annual: 53.3 },
        { year: 2006, jan: 34.4, feb: 33.5, mar: 41.6, apr: 53.3, may: 63.1, jun: 73.2, jul: 83.0, aug: 76.5, sep: 63.4, oct: 50.5, nov: 41.0, dec: 30.7, annual: 53.7 },
        { year: 2007, jan: 21.1, feb: 36.8, mar: 46.3, apr: 52.5, may: 63.0, jun: 73.2, jul: 84.0, aug: 80.6, sep: 66.7, oct: 51.9, nov: 41.9, dec: 27.0, annual: 53.8 },
        { year: 2008, jan: 23.9, feb: 33.2, mar: 40.4, apr: 46.2, may: 57.4, jun: 69.9, jul: 81.4, aug: 77.8, sep: 66.5, oct: 53.1, nov: 42.9, dec: 30.0, annual: 51.9 },
        { year: 2009, jan: 30.6, feb: 36.2, mar: 42.0, apr: 48.8, may: 61.5, jun: 66.4, jul: 79.0, aug: 75.5, sep: 70.6, oct: 49.4, nov: 41.0, dec: 23.6, annual: 52.1 },
        { year: 2010, jan: 28.0, feb: 36.6, mar: 42.7, apr: 48.9, may: 53.2, jun: 68.5, jul: 78.0, aug: 76.1, sep: 68.8, oct: 56.7, nov: 39.3, dec: 33.5, annual: 52.5 },
        { year: 2011, jan: 27.6, feb: 34.1, mar: 43.4, apr: 45.4, may: 53.1, jun: 66.2, jul: 78.5, aug: 79.0, sep: 69.6, oct: 54.8, nov: 39.3, dec: 29.4, annual: 51.7 },
        { year: 2012, jan: 33.2, feb: 37.3, mar: 49.0, apr: 54.1, may: 61.5, jun: 73.6, jul: 82.2, aug: 81.7, sep: 70.0, oct: 55.3, nov: 45.5, dec: 34.8, annual: 56.5 },
        { year: 2013, jan: 21.4, feb: 28.6, mar: 43.6, apr: 49.4, may: 62.5, jun: 75.3, jul: 84.1, aug: 80.7, sep: 70.4, oct: 52.4, nov: 44.4, dec: 24.6, annual: 53.1 },
        { year: 2014, jan: 30.4, feb: 42.1, mar: 49.0, apr: 51.9, may: 61.7, jun: 69.5, jul: 81.3, aug: 74.3, sep: 70.0, oct: 57.3, nov: 41.3, dec: 37.3, annual: 55.5 },
        { year: 2015, jan: 34.3, feb: 43.9, mar: 49.7, apr: 52.3, may: 59.9, jun: 77.5, jul: 77.4, aug: 77.6, sep: 70.8, oct: 60.5, nov: 39.8, dec: 31.3, annual: 56.2 },
        { year: 2016, jan: 30.4, feb: 37.1, mar: 47.1, apr: 55.2, may: 61.7, jun: 77.5, jul: 83.1, aug: 80.2, sep: 67.3, oct: 58.3, nov: 47.0, dec: 29.5, annual: 56.2 },
        { year: 2017, jan: 32.1, feb: 40.0, mar: 50.1, apr: 50.3, may: 62.5, jun: 76.0, jul: 85.3, aug: 81.8, sep: 66.9, oct: 52.6, nov: 47.8, dec: 33.0, annual: 56.5 },
        { year: 2018, jan: 39.0, feb: 38.6, mar: 46.5, apr: 54.8, may: 64.5, jun: 74.6, jul: 83.1, aug: 77.7, sep: 70.8, oct: 53.2, nov: 39.1, dec: 31.7, annual: 56.1 },
        { year: 2019, jan: 30.9, feb: 34.7, mar: 42.8, apr: 52.5, may: 58.0, jun: 70.4, jul: 82.0, aug: 80.3, sep: 67.9, oct: 46.5, nov: 41.8, dec: 33.9, annual: 53.5 },
        { year: 2020, jan: 35.7, feb: 35.0, mar: 46.5, apr: 53.3, may: 64.7, jun: 70.1, jul: 81.1, aug: 80.4, sep: 69.4, oct: 56.0, nov: 42.5, dec: 30.0, annual: 55.6 },
        { year: 2021, jan: 33.0, feb: 36.4, mar: 44.7, apr: 51.3, may: 62.7, jun: 80.2, jul: 85.7, aug: 76.8, sep: 70.3, oct: 53.2, nov: 45.0, dec: 34.8, annual: 56.2 },
        { year: 2022, jan: 31.9, feb: 33.2, mar: 46.3, apr: 50.8, may: 59.4, jun: 74.7, jul: 87.8, aug: 82.1, sep: 75.1, oct: 58.0, nov: 37.2, dec: 33.0, annual: 55.8 },
        { year: 2023, jan: 33.5, feb: 32.5, mar: 39.4, apr: 50.3, may: 67.2, jun: 71.4, jul: 85.3, aug: 78.9, sep: 70.8, oct: 55.8, nov: 42.8, dec: 36.5, annual: 55.4 },
        { year: 2024, jan: 34.8, feb: 40.9, mar: 44.9, apr: 54.1, may: 58.8, jun: 77.6, jul: 83.3, aug: 80.0, sep: 73.0, oct: 62.4, nov: 40.9, dec: 37.4, annual: 57.3 },
        { year: 2025, jan: 32.4, feb: 39.7, mar: 45.6, apr: null, may: null, jun: null, jul: null, aug: null, sep: null, oct: null, nov: null, dec: null, annual: 39.2 },
    ];
    return data;
};