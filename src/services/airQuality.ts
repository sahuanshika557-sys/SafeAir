import { API_TIMEOUT_MS, AQI_CACHE_TTL_MS } from '../constants/index.ts';
import type { AirQualityReading, Language } from '../types/index.ts';
import { clampAqi, getAqiCategory, pm25ToUsAqi } from '../utils/aqi.ts';
import { buildAqiCacheKey, TtlCache } from '../utils/cache.ts';
import {
  buildOpenMeteoAqiUrl,
  createLinkedTimeoutController,
  fetchJsonWithProxyFallback,
  isAbortError,
} from '../utils/network.ts';
import { airQualityResponseSchema } from '../utils/validation.ts';

const aqiCache = new TtlCache<AirQualityReading>(AQI_CACHE_TTL_MS);

/**
 * Clears the in-memory AQI cache (useful for testing or forced refresh).
 */
export function clearAqiCache(): void {
  aqiCache.clear();
}

function roundOneDecimal(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

/**
 * Fetches live US AQI and key pollutants (PM2.5, PM10, NO2, O3) from the Open-Meteo Air Quality API,
 * falling back to `/api/aqi` if direct browser fetch fails, and caches results for 10 minutes.
 *
 * @param latitude - Target geographic latitude in decimal degrees.
 * @param longitude - Target geographic longitude in decimal degrees.
 * @param options - Optional cache bypass, abort signal, and display language for errors.
 * @returns Normalized {@link AirQualityReading} with pollutant values and EPA category metadata.
 */
export async function fetchAirQuality(
  latitude: number,
  longitude: number,
  options?: { bypassCache?: boolean; signal?: AbortSignal; language?: Language },
): Promise<AirQualityReading> {
  const language = options?.language ?? 'en';
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(
      language === 'hi' ? 'अमान्य भौगोलिक निर्देशांक।' : 'Invalid geographic coordinates.',
    );
  }

  const cacheKey = buildAqiCacheKey(latitude, longitude);
  if (!options?.bypassCache) {
    const cached = aqiCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS, options?.signal);

  try {
    const directUrl = buildOpenMeteoAqiUrl(latitude, longitude);
    const proxyUrl = `/api/aqi?latitude=${encodeURIComponent(latitude.toFixed(4))}&longitude=${encodeURIComponent(longitude.toFixed(4))}`;
    const json = await fetchJsonWithProxyFallback(
      directUrl,
      proxyUrl,
      controller.signal,
      'Air Quality API',
    );

    const parsed = airQualityResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error('Air Quality API returned a malformed response.');
    }

    const { current } = parsed.data;
    const pm25 = roundOneDecimal(current.pm2_5);
    const pm10 = roundOneDecimal(current.pm10);
    const no2 = roundOneDecimal(current.nitrogen_dioxide);
    const o3 = roundOneDecimal(current.ozone);

    const rawAqi =
      typeof current.us_aqi === 'number' && Number.isFinite(current.us_aqi)
        ? current.us_aqi
        : pm25 !== null
          ? pm25ToUsAqi(pm25)
          : 0;
    const usAqi = clampAqi(rawAqi);

    const reading: AirQualityReading = {
      usAqi,
      pm25,
      pm10,
      no2,
      o3,
      timestamp: current.time,
      source: 'open-meteo',
      isManual: false,
      category: getAqiCategory(usAqi),
    };

    aqiCache.set(cacheKey, reading);
    return reading;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new Error(
      language === 'hi'
        ? 'लाइव वायु गुणवत्ता डेटा लोड नहीं हो सका। आप नीचे मैनुअल AQI दर्ज कर सकते हैं।'
        : 'Live air quality data could not be loaded. You can enter AQI manually below.',
      { cause: err },
    );
  } finally {
    cleanup();
  }
}
