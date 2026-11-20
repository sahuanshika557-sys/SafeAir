import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_LOCATION,
  GEOCODING_DEBOUNCE_MS,
  MIN_SEARCH_QUERY_LENGTH,
} from '../constants/index.ts';
import { fetchAirQuality } from '../services/airQuality.ts';
import { searchCities } from '../services/geocoding.ts';
import type { AirQualityReading, Language, LocationData } from '../types/index.ts';
import { createManualAirQualityReading } from '../utils/aqi.ts';
import { isAbortError } from '../utils/network.ts';
import { validateCityQuery, validateManualAqi } from '../utils/validation.ts';
import { useDebounce } from './useDebounce.ts';

/**
 * State and actions returned by {@link useAirQuality}.
 */
export interface UseAirQualityReturn {
  location: LocationData;
  reading: AirQualityReading | null;
  isLoadingAqi: boolean;
  aqiError: string | null;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchResults: LocationData[];
  hasSearched: boolean;
  isSearching: boolean;
  searchError: string | null;
  selectCity: (city: LocationData) => void;
  submitCitySearch: () => Promise<void>;
  loadByCoordinates: (latitude: number, longitude: number, label?: string) => Promise<void>;
  applyManualAqi: (value: number) => { success: boolean; error?: string };
  refreshAqi: () => void;
}

function resolveAqiErrorMessage(err: unknown, language: Language): string {
  if (err instanceof Error) {
    return err.message;
  }
  return language === 'hi'
    ? 'अभी लाइव वायु गुणवत्ता डेटा प्राप्त नहीं हो सका।'
    : 'Unable to fetch live air quality right now.';
}

function resolveCitySearchErrorMessage(err: unknown, language: Language): string {
  if (err instanceof Error) {
    return err.message;
  }
  return language === 'hi' ? 'शहर खोज विफल रही।' : 'City search failed.';
}

/**
 * Coordinates debounced city search, `AbortController` request cancellation, live AQI fetching,
 * and manual AQI fallback with localized status/error messages.
 *
 * @param language - Active UI language used for localized status and error messages.
 * @returns Reactive air quality state and location search/refresh handlers.
 */
export function useAirQuality(language: Language = 'en'): UseAirQualityReturn {
  const [location, setLocation] = useState<LocationData>(DEFAULT_LOCATION);
  const [reading, setReading] = useState<AirQualityReading | null>(null);
  const [isLoadingAqi, setIsLoadingAqi] = useState<boolean>(true);
  const [aqiError, setAqiError] = useState<string | null>(null);

  const [searchQuery, setSearchQueryState] = useState<string>('');
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(searchQuery, GEOCODING_DEBOUNCE_MS);
  const aqiAbortRef = useRef<AbortController | null>(null);

  const loadAqiForLocation = useCallback(
    async (target: LocationData, bypassCache: boolean = false): Promise<void> => {
      aqiAbortRef.current?.abort();
      const controller = new AbortController();
      aqiAbortRef.current = controller;

      setIsLoadingAqi(true);
      setAqiError(null);

      try {
        const nextReading = await fetchAirQuality(target.latitude, target.longitude, {
          bypassCache,
          signal: controller.signal,
          language,
        });
        if (!controller.signal.aborted) {
          setReading(nextReading);
        }
      } catch (err: unknown) {
        if (isAbortError(err)) {
          return;
        }
        if (!controller.signal.aborted) {
          setAqiError(resolveAqiErrorMessage(err, language));
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingAqi(false);
        }
      }
    },
    [language],
  );

  useEffect(() => {
    const controller = new AbortController();
    aqiAbortRef.current = controller;

    void fetchAirQuality(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude, {
      signal: controller.signal,
      language,
    })
      .then((nextReading) => {
        if (!controller.signal.aborted) {
          setReading(nextReading);
          setAqiError(null);
        }
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          return;
        }
        if (!controller.signal.aborted) {
          setAqiError(resolveAqiErrorMessage(err, language));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingAqi(false);
        }
      });

    return (): void => {
      controller.abort();
    };
  }, [language]);

  const setSearchQuery = useCallback(
    (value: string): void => {
      setSearchQueryState(value);
      const trimmed = value.trim();
      if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(null);
        setIsSearching(false);
        return;
      }
      const { valid, error } = validateCityQuery(trimmed, language);
      if (!valid) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(error ?? null);
        setIsSearching(false);
        return;
      }
      setSearchError(null);
      setIsSearching(true);
    },
    [language],
  );

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      return;
    }
    const { valid } = validateCityQuery(trimmed, language);
    if (!valid) {
      return;
    }

    const controller = new AbortController();
    void searchCities(trimmed, controller.signal, language)
      .then((cities) => {
        if (!controller.signal.aborted) {
          setSearchResults(cities);
          setHasSearched(true);
        }
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          return;
        }
        if (!controller.signal.aborted) {
          setSearchResults([]);
          setHasSearched(true);
          setSearchError(resolveCitySearchErrorMessage(err, language));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });

    return (): void => {
      controller.abort();
    };
  }, [debouncedQuery, language]);

  const selectCity = useCallback(
    (city: LocationData): void => {
      setLocation(city);
      setSearchQuery('');
      void loadAqiForLocation(city, true);
    },
    [loadAqiForLocation, setSearchQuery],
  );

  const submitCitySearch = useCallback(async (): Promise<void> => {
    const trimmed = searchQuery.trim();
    const validation = validateCityQuery(trimmed, language);
    if (!validation.valid) {
      setSearchError(validation.error ?? null);
      return;
    }
    if (searchResults.length > 0) {
      selectCity(searchResults[0]);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const cities = await searchCities(trimmed, undefined, language);
      setSearchResults(cities);
      setHasSearched(true);
      if (cities.length > 0) {
        selectCity(cities[0]);
      }
    } catch (err: unknown) {
      setSearchError(resolveCitySearchErrorMessage(err, language));
    } finally {
      setIsSearching(false);
    }
  }, [language, searchQuery, searchResults, selectCity]);

  const loadByCoordinates = useCallback(
    async (latitude: number, longitude: number, label?: string): Promise<void> => {
      const defaultLabel =
        language === 'hi'
          ? `वर्तमान स्थान (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`
          : `Current Location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`;
      const nextLoc: LocationData = {
        id: 'geo-current',
        name: label ?? defaultLabel,
        country: '',
        latitude,
        longitude,
        source: 'geolocation',
      };
      setLocation(nextLoc);
      setSearchQuery('');
      await loadAqiForLocation(nextLoc, true);
    },
    [language, loadAqiForLocation, setSearchQuery],
  );

  const applyManualAqi = useCallback(
    (value: number): { success: boolean; error?: string } => {
      const parsed = validateManualAqi(value, language);
      if (!parsed.success) {
        return {
          success: false,
          error: parsed.error,
        };
      }

      setReading(createManualAirQualityReading(parsed.data));
      setAqiError(null);
      setIsLoadingAqi(false);
      return { success: true };
    },
    [language],
  );

  const refreshAqi = useCallback((): void => {
    void loadAqiForLocation(location, true);
  }, [loadAqiForLocation, location]);

  return {
    location,
    reading,
    isLoadingAqi,
    aqiError,
    searchQuery,
    setSearchQuery,
    searchResults,
    hasSearched,
    isSearching,
    searchError,
    selectCity,
    submitCitySearch,
    loadByCoordinates,
    applyManualAqi,
    refreshAqi,
  };
}
