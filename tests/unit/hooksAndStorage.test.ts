import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCATION, DEFAULT_PROFILE } from '../../src/constants/index.js';
import { useAirQuality } from '../../src/hooks/useAirQuality.js';
import { useDebounce } from '../../src/hooks/useDebounce.js';
import { useGeolocation } from '../../src/hooks/useGeolocation.js';
import { usePlanGenerator } from '../../src/hooks/usePlanGenerator.js';
import { useSpeechSynthesis } from '../../src/hooks/useSpeechSynthesis.js';
import { clearAqiCache } from '../../src/services/airQuality.js';
import { resetGeminiClientState } from '../../src/services/gemini.js';
import { clearReverseGeocodeCache } from '../../src/services/geocoding.js';
import { createManualAirQualityReading } from '../../src/utils/aqi.js';
import { loadLanguagePreference, saveLanguagePreference } from '../../src/utils/storage.js';

describe('Language storage helper', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to English, persists Hindi, and recovers on storage errors', () => {
    expect(loadLanguagePreference()).toBe('en');
    saveLanguagePreference('hi');
    expect(loadLanguagePreference()).toBe('hi');

    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    expect(loadLanguagePreference()).toBe('en');
    getSpy.mockRestore();

    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    expect(() => saveLanguagePreference('en')).not.toThrow();
    setSpy.mockRestore();
  });
});

describe('Custom hooks', () => {
  beforeEach(() => {
    clearAqiCache();
    clearReverseGeocodeCache();
    resetGeminiClientState();
    vi.restoreAllMocks();
  });

  it('debounces values in useDebounce', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ val }) => useDebounce(val, 400), {
      initialProps: { val: 'Del' },
    });
    expect(result.current).toBe('Del');
    rerender({ val: 'Delhi' });
    expect(result.current).toBe('Del');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe('Delhi');
    vi.useRealTimers();
  });

  it('handles geolocation success, timeout, unavailable, and permission denial in useGeolocation', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((success) => {
      success({
        coords: { latitude: 28.61, longitude: 77.2 },
      } as GeolocationPosition);
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeolocation());
    let coords: { latitude: number; longitude: number } | null = null;
    await act(async () => {
      coords = await result.current.requestLocation();
    });
    expect(coords).toEqual({ latitude: 28.61, longitude: 77.2 });

    getCurrentPosition.mockImplementation((_success, error) => {
      error?.({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError);
    });
    await act(async () => {
      coords = await result.current.requestLocation();
    });
    expect(coords).toBeNull();
    expect(result.current.error).toContain('permission denied');

    getCurrentPosition.mockImplementation((_success, error) => {
      error?.({ code: 3, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError);
    });
    await act(async () => {
      coords = await result.current.requestLocation();
    });
    expect(result.current.error).toContain('timed out');

    getCurrentPosition.mockImplementation((_success, error) => {
      error?.({ code: 2, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError);
    });
    await act(async () => {
      coords = await result.current.requestLocation();
    });
    expect(result.current.error).toContain('Unable to determine');

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('loads AQI, searches cities, resolves geolocation place names, and falls back to coords cleanly', async () => {
    let reverseShouldResolve = true;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: 101,
                  name: 'Patna',
                  latitude: 25.59,
                  longitude: 85.13,
                  country: 'India',
                  admin1: 'Bihar',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/reverse-geocode')) {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              reverseShouldResolve
                ? { resolved: true, name: 'Jaipur', admin1: 'Rajasthan', country: 'India' }
                : { resolved: false, name: null, admin1: '', country: '' },
            ),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            current: {
              time: '2026-11-18T12:00',
              us_aqi: 190,
              pm2_5: 110,
              pm10: 165,
              nitrogen_dioxide: 40,
              ozone: 25,
            },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(
      ({ lang }: { lang: 'en' | 'hi' }) => useAirQuality(lang),
      { initialProps: { lang: 'en' as 'en' | 'hi' } },
    );
    await waitFor(() => expect(result.current.isLoadingAqi).toBe(false));
    expect(result.current.reading?.usAqi).toBe(190);

    act(() => {
      result.current.setSearchQuery('Patna');
    });
    await act(async () => {
      await result.current.submitCitySearch();
    });
    await waitFor(() => expect(result.current.location.name).toBe('Patna'));

    // Switching language to Hindi must NOT overwrite Patna with default New Delhi
    const callsBeforeLangSwitch = fetchMock.mock.calls.length;
    rerender({ lang: 'hi' });
    expect(result.current.location.name).toBe('Patna');
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeLangSwitch);

    // Browser geolocation with resolved place name replaces coordinates cleanly
    await act(async () => {
      await result.current.loadByCoordinates(26.9124, 75.7873);
    });
    expect(result.current.location.name).toBe('Jaipur');
    expect(result.current.location.admin1).toBe('Rajasthan');
    expect(result.current.location.country).toBe('India');

    // Graceful coordinate fallback if reverse geocoding returns unresolved
    reverseShouldResolve = false;
    await act(async () => {
      await result.current.loadByCoordinates(22.5726, 88.3639);
    });
    expect(result.current.location.name).toContain('22.57');

    act(() => {
      result.current.refreshAqi();
    });
    await waitFor(() => expect(result.current.isLoadingAqi).toBe(false));

    const badManual = result.current.applyManualAqi(999);
    expect(badManual.success).toBe(false);

    let goodManual: { success: boolean; error?: string } = { success: false };
    act(() => {
      goodManual = result.current.applyManualAqi(310);
    });
    expect(goodManual.success).toBe(true);
    expect(result.current.reading?.usAqi).toBe(310);
    expect(result.current.reading?.category.key).toBe('hazardous');
    expect(result.current.reading?.no2).toBeNull();
    expect(result.current.reading?.o3).toBeNull();
  });

  it('produces localized Hindi geolocation error messages when language is hi', async () => {
    const getCurrentPosition = vi.fn<Geolocation['getCurrentPosition']>((_success, error) => {
      error?.({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 } as GeolocationPositionError);
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition },
    });

    const { result } = renderHook(() => useGeolocation('hi'));
    await act(async () => {
      await result.current.requestLocation();
    });
    expect(result.current.error).toContain('लोकेशन अनुमति अस्वीकार');
  });

  it('falls back to rule-based plan with provenance and retries in usePlanGenerator', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ category: 'model_unavailable', error: 'Model unavailable' }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ category: 'quota_exceeded', error: 'Quota exceeded' }), {
          status: 429,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePlanGenerator());
    const reading = createManualAirQualityReading(220);

    await act(async () => {
      await result.current.generatePlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
      });
    });

    expect(result.current.error).toContain('temporarily unavailable');
    expect(result.current.plan?.isFallback).toBe(true);
    expect(result.current.plan?.generatedForLocationId).toBe(DEFAULT_LOCATION.id);
    expect(result.current.plan?.generatedForAqi).toBe(220);

    await act(async () => {
      await result.current.retryLastPlan();
    });
    expect(result.current.error).toContain('busy right now');
  });

  it('invokes speechSynthesis cleanly in useSpeechSynthesis', () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        public text: string;
        public lang = 'en-IN';
        public rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      },
    );

    const { result } = renderHook(() => useSpeechSynthesis());
    expect(result.current.isSupported).toBe(true);
    act(() => {
      result.current.speak('Stay indoors today', 'en');
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.stop();
    });
    expect(cancelMock).toHaveBeenCalled();
  });

  it('handles debounced search, selectCity, search/AQI error paths, and live plan streaming success', async () => {
    const validPlanJson = JSON.stringify({
      summary: 'Tailored live plan.',
      bestTimeWindow: '1 PM - 4 PM',
      worstTimeWindow: '6 AM - 9 AM',
      dailyRoutine: [
        {
          title: 'Midday errands',
          detail: 'Go out at noon.',
          whyItHelps: 'Lower smog.',
          estimatedImpact: '20% lower exposure',
        },
      ],
      indoorAirHacks: [
        {
          title: 'Seal windows',
          detail: 'Use draft stoppers.',
          whyItHelps: 'Cuts infiltration.',
          estimatedImpact: '25% cleaner indoor air',
        },
      ],
      sustainableAlternatives: [
        {
          title: 'Metro commute',
          detail: 'Skip solo driving.',
          whyItHelps: 'Reduces PM2.5.',
          estimatedImpact: '11.5 kg CO2 avoided/week',
        },
      ],
      healthProtection: [
        {
          title: 'N95 mask',
          detail: 'Wear sealed N95.',
          whyItHelps: 'Filters PM2.5.',
          estimatedImpact: '30%–40% lower intake',
        },
      ],
    });

    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('geocoding-api.open-meteo.com')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: [
                {
                  id: 202,
                  name: 'Kanpur',
                  latitude: 26.45,
                  longitude: 80.33,
                  country: 'India',
                  admin1: 'Uttar Pradesh',
                },
              ],
            }),
            { status: 200 },
          ),
        );
      }
      if (url.includes('/api/plan')) {
        return Promise.resolve(
          new Response(JSON.stringify({ text: validPlanJson, model: 'gemini-2.5-flash' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.reject(new Error('AQI offline'));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAirQuality('en'));
    await waitFor(() => expect(result.current.isLoadingAqi).toBe(false));
    expect(result.current.aqiError).toContain('Live air quality data could not be loaded');

    // Invalid symbol query shows validation error immediately
    act(() => {
      result.current.setSearchQuery('@@@');
    });
    expect(result.current.searchError).toBeTruthy();

    // Short query clears results
    act(() => {
      result.current.setSearchQuery('a');
    });
    expect(result.current.searchResults).toEqual([]);

    // Valid search & debounced selectCity
    act(() => {
      result.current.setSearchQuery('Kanpur');
    });
    await waitFor(() => expect(result.current.searchResults).toHaveLength(1));
    act(() => {
      result.current.selectCity(result.current.searchResults[0]);
    });
    expect(result.current.location.name).toBe('Kanpur');

    // Plan generator live JSON/SSE success
    const { result: planHook } = renderHook(() => usePlanGenerator());
    await act(async () => {
      await planHook.current.generatePlan({
        location: DEFAULT_LOCATION,
        airQuality: createManualAirQualityReading(185),
        profile: DEFAULT_PROFILE,
        language: 'en',
      });
    });
    expect(planHook.current.error).toBeNull();
    expect(planHook.current.plan?.isFallback).toBe(false);
    expect(planHook.current.plan?.summary).toBe('Tailored live plan.');
  });
});
