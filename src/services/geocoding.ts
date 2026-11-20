import { API_TIMEOUT_MS } from '../constants/index.ts';
import type { Language, LocationData } from '../types/index.ts';
import {
  buildOpenMeteoGeocodingUrl,
  createLinkedTimeoutController,
  fetchJsonWithProxyFallback,
  isAbortError,
} from '../utils/network.ts';
import { geocodingResponseSchema, validateCityQuery } from '../utils/validation.ts';

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
