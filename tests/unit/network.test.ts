import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildOpenMeteoAqiUrl,
  buildOpenMeteoGeocodingUrl,
  createLinkedTimeoutController,
  fetchJsonWithProxyFallback,
  isAbortError,
} from '../../src/utils/network.ts';

describe('Network utility helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('detects AbortError across DOMException and standard Error instances', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
    const err = new Error('Canceled');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
    expect(isAbortError(new Error('Other error'))).toBe(false);
    expect(isAbortError('AbortError')).toBe(false);
  });

  it('builds canonical Open-Meteo geocoding and air quality URLs', () => {
    const geoUrl = buildOpenMeteoGeocodingUrl('New Delhi');
    expect(geoUrl).toContain('geocoding-api.open-meteo.com');
    expect(geoUrl).toContain('name=New+Delhi');
    expect(geoUrl).toContain('count=6');

    const aqiUrl = buildOpenMeteoAqiUrl(28.61394, 77.20902);
    expect(aqiUrl).toContain('air-quality-api.open-meteo.com');
    expect(aqiUrl).toContain('latitude=28.6139');
    expect(aqiUrl).toContain('longitude=77.2090');
    expect(aqiUrl).toContain('nitrogen_dioxide');
    expect(aqiUrl).toContain('ozone');
  });

  it('aborts on timeout, links external signal, and throws immediately if pre-aborted', () => {
    vi.useFakeTimers();
    const { controller, cleanup } = createLinkedTimeoutController(500);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(500);
    expect(controller.signal.aborted).toBe(true);
    cleanup();

    const external = new AbortController();
    const linked = createLinkedTimeoutController(5000, external.signal);
    external.abort();
    expect(linked.controller.signal.aborted).toBe(true);
    linked.cleanup();

    expect(() => createLinkedTimeoutController(5000, external.signal)).toThrow();
  });

  it('falls back to proxy on non-abort failures and preserves abort errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Direct blocked'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const controller = new AbortController();
    const data = await fetchJsonWithProxyFallback(
      'https://example.com/direct',
      '/api/proxy',
      controller.signal,
      'Test API',
    );
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));
    await expect(
      fetchJsonWithProxyFallback(
        'https://example.com/direct',
        '/api/proxy',
        controller.signal,
        'Test API',
      ),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
