import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCATION, DEFAULT_PROFILE } from '../../src/constants/index.ts';
import { clearAqiCache, fetchAirQuality } from '../../src/services/airQuality.ts';
import {
  generatePersonalizedPlan,
  resetGeminiClientState,
  streamFollowUpChat,
} from '../../src/services/gemini.ts';
import {
  clearReverseGeocodeCache,
  reverseGeocodeCoordinates,
  searchCities,
} from '../../src/services/geocoding.ts';
import { createManualAirQualityReading } from '../../src/utils/aqi.ts';

function createSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`));
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true, model: 'gemini-2.5-flash' })}\n\n`),
      );
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const VALID_PLAN_PAYLOAD = {
  summary: 'High smog precautions for New Delhi.',
  bestTimeWindow: '1 PM - 4 PM',
  worstTimeWindow: '6 AM - 9 AM',
  dailyRoutine: [
    {
      title: 'Midday errands',
      detail: 'Run errands at noon.',
      whyItHelps: 'Lower inversion trapping.',
      estimatedImpact: 'Approximate: 25% lower exposure',
    },
  ],
  indoorAirHacks: [
    {
      title: 'Wet mop',
      detail: 'Mop daily instead of sweeping.',
      whyItHelps: 'Prevents dust resuspension.',
      estimatedImpact: 'Approximate: 20% lower indoor dust',
    },
  ],
  sustainableAlternatives: [
    {
      title: 'Take Metro',
      detail: 'Use metro instead of car.',
      whyItHelps: 'Cuts tailpipe emissions.',
      estimatedImpact: 'Approximate: 2,000 g CO2 saved/day',
    },
  ],
  healthProtection: [
    {
      title: 'N95 Mask',
      detail: 'Wear fitted N95 outdoors.',
      whyItHelps: 'Blocks fine PM2.5 particles.',
      estimatedImpact: 'Approximate: 50% lower PM2.5 inhalation',
    },
  ],
};

describe('Service layer (Open-Meteo + Reverse Geocode + Gemini SSE/JSON)', () => {
  beforeEach(() => {
    clearAqiCache();
    clearReverseGeocodeCache();
    resetGeminiClientState();
    vi.restoreAllMocks();
  });

  it('searches cities via Open-Meteo Geocoding API, falls back to /api/geocode, and handles errors', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1273294,
              name: 'Delhi',
              latitude: 28.6519,
              longitude: 77.2315,
              country: 'India',
              admin1: 'Delhi',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchCities('Delhi');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Delhi');

    // Direct Open-Meteo failure falls back to /api/geocode proxy
    fetchMock.mockRejectedValueOnce(new TypeError('Direct blocked')).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              id: 1264733,
              name: 'Lucknow',
              latitude: 26.8393,
              longitude: 80.9231,
              country: 'India',
              admin1: 'Uttar Pradesh',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const proxyResults = await searchCities('Lucknow');
    expect(proxyResults).toHaveLength(1);
    expect(proxyResults[0].name).toBe('Lucknow');
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/geocode');

    // Both direct and proxy malformed/failing surfaces localized error
    fetchMock
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(searchCities('Jaipur')).rejects.toThrow(/Unable to search cities/i);

    fetchMock
      .mockRejectedValueOnce(new Error('Network down'))
      .mockRejectedValueOnce(new Error('Proxy down'));
    await expect(searchCities('Patna', undefined, 'hi')).rejects.toThrow(/शहर खोजे नहीं जा सके/);
  });

  it('reverse geocodes coordinates via /api/reverse-geocode, caches, and degrades gracefully', async () => {
    expect(await reverseGeocodeCoordinates(Number.NaN, 77.2)).toBeNull();

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          resolved: true,
          name: 'Varanasi',
          admin1: 'Uttar Pradesh',
          country: 'India',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const resolved = await reverseGeocodeCoordinates(25.3176, 82.9739, 'en');
    expect(resolved).toEqual({ name: 'Varanasi', admin1: 'Uttar Pradesh', country: 'India' });
    // Cached second call makes no additional fetch
    const cached = await reverseGeocodeCoordinates(25.3176, 82.9739, 'en');
    expect(cached).toEqual(resolved);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Graceful null fallback on unresolved, HTTP error, or network error
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ resolved: false, name: null }), { status: 200 }),
    );
    expect(await reverseGeocodeCoordinates(10.0, 10.0, 'en')).toBeNull();

    fetchMock.mockResolvedValueOnce(new Response('Error', { status: 500 }));
    expect(await reverseGeocodeCoordinates(11.0, 11.0, 'en')).toBeNull();

    fetchMock.mockRejectedValueOnce(new Error('Offline'));
    expect(await reverseGeocodeCoordinates(12.0, 12.0, 'en')).toBeNull();
  });

  it('propagates AbortError on canceled geocoding searches', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(searchCities('Delhi', controller.signal)).rejects.toThrow();
  });

  it('fetches live AQI, deduplicates concurrent calls, falls back to /api/aqi, and caches', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({
                  current: {
                    time: '2026-11-18T12:00',
                    us_aqi: 215,
                    pm2_5: 132.44,
                    pm10: 195.21,
                    nitrogen_dioxide: 48.16,
                    ozone: 31.24,
                  },
                }),
                { status: 200 },
              ),
            );
          }, 10);
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Two concurrent fetches for the same coordinates should deduplicate to 1 upstream request
    const [first, concurrent] = await Promise.all([
      fetchAirQuality(28.61, 77.21),
      fetchAirQuality(28.61, 77.21),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(concurrent);
    expect(first.usAqi).toBe(215);
    expect(first.pm25).toBe(132.4);
    expect(first.pm10).toBe(195.2);
    expect(first.no2).toBe(48.2);
    expect(first.o3).toBe(31.2);
    expect(first.isManual).toBe(false);
    expect(first.category.key).toBe('very_unhealthy');

    // Second call uses 10-minute memory cache
    const second = await fetchAirQuality(28.61, 77.21);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Direct Open-Meteo failure falls back to /api/aqi and computes US AQI from PM2.5 if us_aqi is null
    fetchMock.mockRejectedValueOnce(new TypeError('CORS blocked')).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          current: {
            time: '2026-11-18T13:00',
            us_aqi: null,
            pm2_5: 55.4,
            pm10: 98.0,
            nitrogen_dioxide: 27.8,
            ozone: null,
          },
        }),
        { status: 200 },
      ),
    );
    const proxied = await fetchAirQuality(26.84, 80.94);
    expect(proxied.usAqi).toBe(150);
    expect(proxied.no2).toBe(27.8);
    expect(proxied.o3).toBeNull();
    expect(String(fetchMock.mock.calls[2][0])).toContain('/api/aqi');

    // Malformed payload rejected cleanly
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ bad: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ bad: true }), { status: 200 }));
    await expect(fetchAirQuality(19.07, 72.87)).rejects.toThrow(/Live air quality data/i);

    // Network failure handled cleanly in Hindi
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Proxy failed'));
    await expect(fetchAirQuality(12.97, 77.59, { language: 'hi' })).rejects.toThrow(
      /लाइव वायु गुणवत्ता डेटा लोड नहीं हो सका/,
    );
  });

  it('streams structured Gemini plan JSON, deduplicates concurrent calls, repairs malformed JSON, and maps categories', async () => {
    const validPlanJson = JSON.stringify(VALID_PLAN_PAYLOAD);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([validPlanJson.slice(0, 80), validPlanJson.slice(80)]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const reading = createManualAirQualityReading(215);
    const progressCallsA: string[] = [];
    const progressCallsB: string[] = [];
    const abortA = new AbortController();

    // Concurrent calls share one in-flight request; aborting one subscriber preserves the other
    const promiseA = generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      signal: abortA.signal,
      onStreamProgress: (acc) => progressCallsA.push(acc),
    });
    const promiseB = generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      onStreamProgress: (acc) => progressCallsB.push(acc),
    });

    const [plan, planB] = await Promise.all([promiseA, promiseB]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(progressCallsA.length).toBeGreaterThan(0);
    expect(progressCallsB.length).toBeGreaterThan(0);
    expect(plan.isFallback).toBe(false);
    expect(plan.modelUsed).toBe('gemini-2.5-flash');
    expect(plan.generatedForAqi).toBe(215);
    expect(plan.generatedForLocationId).toBe(DEFAULT_LOCATION.id);
    // Sanitized impact must strip duplicated leading "Approximate: "
    expect(plan.dailyRoutine[0].estimatedImpact).toBe('25% lower exposure');
    expect(planB.summary).toBe(plan.summary);

    // Cached call does not trigger fetch
    const cachedPlan = await generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
    });
    expect(cachedPlan.summary).toBe(plan.summary);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Non-streaming JSON fallback response from /api/plan succeeds cleanly
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: validPlanJson,
          model: 'gemini-2.5-flash-lite',
          nonStreaming: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const nonStreamPlan = await generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      bypassCache: true,
    });
    expect(nonStreamPlan.modelUsed).toBe('gemini-2.5-flash-lite');

    // Malformed SSE JSON triggers single repair request and succeeds when repair returns valid JSON
    fetchMock.mockResolvedValueOnce(createSseResponse(['{broken json'])).mockResolvedValueOnce(
      new Response(JSON.stringify({ text: validPlanJson, model: 'gemini-2.5-flash' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const repairedPlan = await generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      bypassCache: true,
    });
    expect(repairedPlan.dailyRoutine[0].title).toBe('Midday errands');

    // Malformed SSE JSON + failed repair throws clean localized message
    fetchMock
      .mockResolvedValueOnce(createSseResponse(['{broken json']))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'failed' }), { status: 502 }));
    await expect(
      generatePersonalizedPlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
        bypassCache: true,
      }),
    ).rejects.toThrow(/incomplete or malformed/i);

    // HTTP 500 without category uses friendly message and NEVER surfaces raw "HTTP 500"
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));
    await expect(
      generatePersonalizedPlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
        bypassCache: true,
      }),
    ).rejects.toSatisfy(
      (err: Error) => !/500/.test(err.message) && /temporarily unreachable/i.test(err.message),
    );

    // HTTP error with category maps via getLocalizedApiErrorMessage
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ category: 'invalid_key', error: 'raw' }), { status: 502 }),
    );
    await expect(
      generatePersonalizedPlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'hi',
        bypassCache: true,
      }),
    ).rejects.toThrow(/एआई सेवा की कुंजी अमान्य/);

    // SSE error event with errorType logs diagnostic type without leaking secrets
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: 'Unable to generate AI plan right now.',
              errorType: 'ApiError',
              category: 'model_unavailable',
            })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(errorStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    await expect(
      generatePersonalizedPlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
        bypassCache: true,
      }),
    ).rejects.toThrow(/AI model is temporarily unavailable/i);
    expect(warnSpy).toHaveBeenCalledWith('[SafeAir Saathi] AI stream failed:', {
      errorType: 'ApiError',
    });
  });

  it('streams follow-up chat tokens, handles non-streaming JSON fallback, and maps errors cleanly', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createSseResponse(['Wear an ', 'N95 mask.']))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'Seal windows at dawn.', nonStreaming: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const tokens: string[] = [];
    const reply = await streamFollowUpChat({
      message: 'Which mask works best?',
      history: [],
      context: { locationName: 'Delhi', usAqi: 240, categoryLabel: 'Very Unhealthy' },
      language: 'en',
      onToken: (text) => tokens.push(text),
    });

    expect(reply).toBe('Wear an N95 mask.');
    expect(tokens).toEqual(['Wear an ', 'Wear an N95 mask.']);

    const nonStreamTokens: string[] = [];
    const nonStreamReply = await streamFollowUpChat({
      message: 'When to close windows?',
      history: [],
      context: { locationName: 'Delhi', usAqi: 240, categoryLabel: 'Very Unhealthy' },
      language: 'en',
      onToken: (text) => nonStreamTokens.push(text),
    });
    expect(nonStreamReply).toBe('Seal windows at dawn.');
    expect(nonStreamTokens).toEqual(['Seal windows at dawn.']);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ category: 'quota_exceeded', error: 'Rate limit exceeded' }), {
        status: 429,
      }),
    );
    await expect(
      streamFollowUpChat({
        message: 'Hello',
        history: [],
        context: { locationName: 'Delhi', usAqi: 240, categoryLabel: 'Very Unhealthy' },
        language: 'en',
        onToken: () => undefined,
      }),
    ).rejects.toThrow(/busy right now/i);
  });

  it('enforces client-side 10 req/min rate limit across plan and chat requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(createSseResponse(['OK']))),
    );

    for (let i = 0; i < 10; i += 1) {
      await streamFollowUpChat({
        message: `Question ${i}`,
        history: [],
        context: { locationName: 'Delhi', usAqi: 200, categoryLabel: 'Unhealthy' },
        language: 'en',
        onToken: () => undefined,
      });
    }

    await expect(
      streamFollowUpChat({
        message: 'Eleventh question',
        history: [],
        context: { locationName: 'Delhi', usAqi: 200, categoryLabel: 'Unhealthy' },
        language: 'hi',
        onToken: () => undefined,
      }),
    ).rejects.toThrow(/अनुरोध सीमा पूरी हो गई है/);
  });

  it('handles caller AbortSignal safely across single and shared in-flight plan requests and JSON error responses', async () => {
    const reading = createManualAirQualityReading(185);
    const alreadyAborted = new AbortController();
    alreadyAborted.abort();

    // Aborted before joining a shared in-flight request rejects with AbortError immediately
    let releaseFirst!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementationOnce(async () => {
        await gate;
        return new Response(JSON.stringify({ category: 'bad_request', error: 'bad input' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const pendingFirst = generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
    });

    await expect(
      generatePersonalizedPlan({
        location: DEFAULT_LOCATION,
        airQuality: reading,
        profile: DEFAULT_PROFILE,
        language: 'en',
        signal: alreadyAborted.signal,
      }),
    ).rejects.toThrow();

    releaseFirst();
    await expect(pendingFirst).rejects.toThrow(/request could not be processed/i);

    // Concurrent subscriber aborts after joining while first subscriber still receives valid plan
    const validJson = JSON.stringify(VALID_PLAN_PAYLOAD);
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementationOnce(async () => {
        await secondGate;
        // Response with null body falls back cleanly to response.text()
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'text/plain' }),
          body: null,
          text: async () => validJson,
        } as unknown as Response;
      }),
    );

    const subAbort = new AbortController();
    const p1 = generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      onStreamProgress: vi.fn(),
    });
    const p2 = generatePersonalizedPlan({
      location: DEFAULT_LOCATION,
      airQuality: reading,
      profile: DEFAULT_PROFILE,
      language: 'en',
      signal: subAbort.signal,
      onStreamProgress: vi.fn(),
    });
    subAbort.abort();
    releaseSecond();
    const winner = await p1;
    expect(winner.dailyRoutine[0].title).toBe('Midday errands');
    await p2.catch(() => undefined);
  });
});
