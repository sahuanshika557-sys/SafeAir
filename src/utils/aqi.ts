import { AQI_CATEGORIES, MAX_US_AQI, MIN_US_AQI } from '../constants/index.js';
import type { AirQualityReading, AqiCategoryInfo, Language } from '../types/index.js';

/**
 * Clamps a numeric US AQI value to valid display bounds `[0, 500]`.
 *
 * @param value - Raw numeric AQI value.
 * @returns Rounded integer AQI clamped between `MIN_US_AQI` and `MAX_US_AQI`.
 */
export function clampAqi(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_US_AQI;
  }
  return Math.max(MIN_US_AQI, Math.min(MAX_US_AQI, Math.round(value)));
}

/**
 * Converts a PM2.5 concentration (µg/m³) to an approximate US EPA AQI when upstream omits `us_aqi`.
 *
 * @param pm25 - Fine particulate concentration in µg/m³.
 * @returns Approximate US EPA AQI integer in `[0, 500]`.
 */
export function pm25ToUsAqi(pm25: number): number {
  const c = Math.max(0, pm25);
  const breakpoints: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 12.0, 0, 50],
    [12.1, 35.4, 51, 100],
    [35.5, 55.4, 101, 150],
    [55.5, 150.4, 151, 200],
    [150.5, 250.4, 201, 300],
    [250.5, 500.4, 301, 500],
  ];
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (c <= cHigh) {
      return Math.max(iLow, Math.round(((iHigh - iLow) / (cHigh - cLow)) * (c - cLow) + iLow));
    }
  }
  return MAX_US_AQI;
}

/**
 * Maps a US AQI value to its official US EPA category metadata and localized labels.
 *
 * @param aqi - Numeric US AQI score.
 * @returns Matching {@link AqiCategoryInfo} metadata object.
 */
export function getAqiCategory(aqi: number): AqiCategoryInfo {
  const normalized = Math.max(MIN_US_AQI, Math.round(Number.isFinite(aqi) ? aqi : 0));
  for (const category of AQI_CATEGORIES) {
    if (normalized <= category.maxAqi) {
      return category;
    }
  }
  return AQI_CATEGORIES[AQI_CATEGORIES.length - 1];
}

/**
 * Builds an {@link AirQualityReading} object from a manual AQI entry fallback.
 * Leaves unmeasured pollutants `null` so the UI displays unavailable rather than `0`.
 *
 * @param usAqi - User-entered US AQI value (`0–500`).
 * @returns Normalized manual {@link AirQualityReading}.
 */
export function createManualAirQualityReading(usAqi: number): AirQualityReading {
  const clamped = clampAqi(usAqi);
  return {
    usAqi: clamped,
    pm25: null,
    pm10: null,
    no2: null,
    o3: null,
    timestamp: new Date().toISOString(),
    source: 'manual',
    isManual: true,
    category: getAqiCategory(clamped),
  };
}

/**
 * Formats an ISO timestamp for localized date-time display.
 *
 * @param isoString - ISO-8601 timestamp string.
 * @param language - Target UI locale (`'en'` or `'hi'`).
 * @returns Formatted date-time string, or original input if unparseable.
 */
export function formatAqiTimestamp(isoString: string, language: Language): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
