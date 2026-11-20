import { API_TIMEOUT_MS, REVERSE_GEOCODE_CACHE_TTL_MS } from '../constants/index.ts';
import type { Language, LocationData } from '../types/index.ts';
import { buildAqiCacheKey, TtlCache } from '../utils/cache.ts';
import {
  buildOpenMeteoGeocodingUrl,
  createLinkedTimeoutController,
  fetchJsonWithProxyFallback,
  isAbortError,
} from '../utils/network.ts';
import { geocodingResponseSchema, validateCityQuery } from '../utils/validation.ts';

const reverseGeocodeCache = new TtlCache<{
  name: string;
  admin1?: string;
  country: string;
}>(REVERSE_GEOCODE_CACHE_TTL_MS, 50);

/**
 * Clears the client-side reverse geocoding cache (intended for tests).
 */
export function clearReverseGeocodeCache(): void {
  reverseGeocodeCache.clear();
}

/**
 * Searches matching cities via Open-Meteo Geocoding API with automatic `/api/geocode`
 * server proxy fallback when direct browser requests are blocked.
 *
 * @param rawQuery - User-entered city search string.
 * @param externalSignal - Optional AbortSignal to cancel stale debounced searches.
 * @param language - UI language used for localized validation and error messages.
 * @returns Array of normalized {@link LocationData} candidates.
 */
export async function searchCities(
  rawQuery: string,
  externalSignal?: AbortSignal,
  language: Language = 'en',
): Promise<LocationData[]> {
  const { valid, sanitized } = validateCityQuery(rawQuery, language);
  if (!valid) {
    return [];
  }

  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS, externalSignal);

  try {
    const directUrl = buildOpenMeteoGeocodingUrl(sanitized);
    const proxyUrl = `/api/geocode?name=${encodeURIComponent(sanitized)}`;
    const json = await fetchJsonWithProxyFallback(
      directUrl,
      proxyUrl,
      controller.signal,
      'Geocoding service',
    );

    const parsed = geocodingResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error('Geocoding service returned an unexpected response format.');
    }

    return parsed.data.results.map((item) => ({
      id: `city-${item.id}`,
      name: item.name,
      admin1: item.admin1,
      country: item.country,
      latitude: item.latitude,
      longitude: item.longitude,
      source: 'search',
    }));
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    throw new Error(
      language === 'hi'
        ? 'अभी शहर खोजे नहीं जा सके। कृपया अपना इंटरनेट जांचें या अपना स्थान उपयोग करें।'
        : 'Unable to search cities right now. Please check your connection or use your location.',
      { cause: err },
    );
  } finally {
    cleanup();
  }
}

/**
 * Resolves browser geolocation coordinates into a human-readable locality/city name via the
 * server-side `/api/reverse-geocode` proxy with caching and graceful `null` fallback.
 *
 * @param latitude - Geographic latitude in decimal degrees.
 * @param longitude - Geographic longitude in decimal degrees.
 * @param language - Active UI display language (`'en'` or `'hi'`).
 * @param externalSignal - Optional AbortSignal to cancel in-flight lookups.
 * @returns Resolved place metadata, or `null` when unavailable so callers fall back to coordinates.
 */
export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
  language: Language = 'en',
  externalSignal?: AbortSignal,
): Promise<{ name: string; admin1?: string; country: string } | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const cacheKey = `${buildAqiCacheKey(latitude, longitude)}:${language}`;
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const { controller, cleanup } = createLinkedTimeoutController(5000, externalSignal);
  try {
    const url = `/api/reverse-geocode?latitude=${encodeURIComponent(latitude.toFixed(4))}&longitude=${encodeURIComponent(longitude.toFixed(4))}&language=${language}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      resolved?: boolean;
      name?: string | null;
      admin1?: string;
      country?: string;
    };
    if (!data.resolved || !data.name) {
      return null;
    }
    const result = {
      name: data.name,
      ...(data.admin1 ? { admin1: data.admin1 } : {}),
      country: data.country ?? '',
    };
    reverseGeocodeCache.set(cacheKey, result);
    return result;
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    return null;
  } finally {
    cleanup();
  }
}
