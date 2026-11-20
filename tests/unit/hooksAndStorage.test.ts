import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE } from '../../src/constants/index.ts';
import { useAirQuality } from '../../src/hooks/useAirQuality.ts';
import { useDebounce } from '../../src/hooks/useDebounce.ts';
import { useGeolocation } from '../../src/hooks/useGeolocation.ts';
import { usePlanGenerator } from '../../src/hooks/usePlanGenerator.ts';
import { useSpeechSynthesis } from '../../src/hooks/useSpeechSynthesis.ts';
import { clearAqiCache } from '../../src/services/airQuality.ts';
import { resetGeminiClientState } from '../../src/services/gemini.ts';
import { createManualAirQualityReading } from '../../src/utils/aqi.ts';
import { loadLanguagePreference, saveLanguagePreference } from '../../src/utils/storage.ts';

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

  it('handles geolocation success, timeout, and permission denial in useGeolocation', async () => {
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

    act(() => result.current.clearError());
    expect(result.current.error).toBeNull();
  });

  it('loads AQI, searches cities, loads by coords, refreshes, and applies manual AQI in useAirQuality', async () => {
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

    await act(async () => {
      await result.current.loadByCoordinates(26.84, 80.94, 'Lucknow');
    });
    expect(result.current.location.name).toBe('Lucknow');

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

  it('falls back to rule-based plan and retries in usePlanGenerator', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Service unavailable' }), { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Still unavailable' }), { status: 503 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePlanGenerator());
    const reading = createManualAirQualityReading(220);

    await act(async () => {
      await result.current.generatePlan({
        location: {
          id: 'test-loc',
          name: 'Delhi',
          country: 'India',
          latitude: 28.61,
          longitude: 77.2,
          source: 'search',
        },
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
      });
    });

    expect(result.current.error).toContain('Service unavailable');
    expect(result.current.plan?.isFallback).toBe(true);

    await act(async () => {
      await result.current.retryLastPlan();
    });
    expect(result.current.error).toContain('Still unavailable');
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
});
