import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import aqiHandler from '../../api/aqi.ts';
import chatHandler from '../../api/chat.ts';
import geocodeHandler from '../../api/geocode.ts';
import planHandler from '../../api/plan.ts';
import { DEFAULT_LOCATION, DEFAULT_PROFILE } from '../../src/constants/index.ts';
import {
  resetServerRateLimiter,
  type ServerApiRequest,
  type ServerApiResponse,
} from '../../src/server/apiHandlers.ts';
import { createManualAirQualityReading } from '../../src/utils/aqi.ts';

function createMockRequest(options: {
  method: string;
  url: string;
  query?: Record<string, string>;
  body?: unknown;
}): ServerApiRequest {
  const req = new EventEmitter() as ServerApiRequest;
  req.method = options.method;
  req.url = options.url;
  req.query = options.query;
  req.body = options.body;
  return req;
}

function createMockResponse(): {
  res: ServerApiResponse;
  headers: Record<string, string>;
  chunks: string[];
  getBody: () => string;
} {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
      return res;
    },
    write(chunk: string | Uint8Array) {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    },
    end(chunk?: string | Uint8Array) {
      if (chunk !== undefined) {
        chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      }
      return res;
    },
    flushHeaders: vi.fn(),
  } as unknown as ServerApiResponse;

  return {
    res,
    headers,
    chunks,
    getBody: () => chunks.join(''),
  };
}

describe('Vercel serverless functions & shared server handlers', () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    resetServerRateLimiter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });

  it('enforces GET and validates parameters in /api/geocode and /api/aqi', async () => {
    const postGeoReq = createMockRequest({ method: 'POST', url: '/api/geocode?name=Delhi' });
    const postGeoRes = createMockResponse();
    await geocodeHandler(postGeoReq, postGeoRes.res);
    expect(postGeoRes.res.statusCode).toBe(405);

    const badGeoReq = createMockRequest({
      method: 'GET',
      url: '/api/geocode?name=x',
      query: { name: 'x' },
    });
    const badGeoRes = createMockResponse();
    await geocodeHandler(badGeoReq, badGeoRes.res);
    expect(badGeoRes.res.statusCode).toBe(400);

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ id: 1, name: 'Delhi' }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ current: { us_aqi: 155 } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const goodGeoReq = createMockRequest({
      method: 'GET',
      url: '/api/geocode?name=Delhi',
      query: { name: 'Delhi' },
    });
    const goodGeoRes = createMockResponse();
    await geocodeHandler(goodGeoReq, goodGeoRes.res);
    expect(goodGeoRes.res.statusCode).toBe(200);
    expect(JSON.parse(goodGeoRes.getBody())).toEqual({ results: [{ id: 1, name: 'Delhi' }] });

    const badAqiReq = createMockRequest({
      method: 'GET',
      url: '/api/aqi?latitude=999&longitude=77',
      query: { latitude: '999', longitude: '77' },
    });
    const badAqiRes = createMockResponse();
    await aqiHandler(badAqiReq, badAqiRes.res);
    expect(badAqiRes.res.statusCode).toBe(400);

    const goodAqiReq = createMockRequest({
      method: 'GET',
      url: '/api/aqi?latitude=28.6139&longitude=77.2090',
    });
    const goodAqiRes = createMockResponse();
    await aqiHandler(goodAqiReq, goodAqiRes.res);
    expect(goodAqiRes.res.statusCode).toBe(200);
    expect(JSON.parse(goodAqiRes.getBody())).toEqual({ current: { us_aqi: 155 } });
  });

  it('validates methods, payloads, and missing GEMINI_API_KEY in /api/plan and /api/chat', async () => {
    delete process.env.GEMINI_API_KEY;

    const getPlanReq = createMockRequest({ method: 'GET', url: '/api/plan' });
    const getPlanRes = createMockResponse();
    await planHandler(getPlanReq, getPlanRes.res);
    expect(getPlanRes.res.statusCode).toBe(405);

    const badPlanReq = createMockRequest({ method: 'POST', url: '/api/plan', body: {} });
    const badPlanRes = createMockResponse();
    await planHandler(badPlanReq, badPlanRes.res);
    expect(badPlanRes.res.statusCode).toBe(400);

    const validPlanReq = createMockRequest({
      method: 'POST',
      url: '/api/plan',
      body: {
        language: 'en',
        location: DEFAULT_LOCATION,
        airQuality: createManualAirQualityReading(180),
        profile: DEFAULT_PROFILE,
      },
    });
    const validPlanRes = createMockResponse();
    await planHandler(validPlanReq, validPlanRes.res);
    expect(validPlanRes.res.statusCode).toBe(503);
    expect(JSON.parse(validPlanRes.getBody()).error).toMatch(/not configured/i);

    const validChatReq = createMockRequest({
      method: 'POST',
      url: '/api/chat',
      body: {
        language: 'hi',
        message: 'N95 मास्क कब पहनना चाहिए?',
        history: [],
        context: {
          locationName: 'New Delhi',
          usAqi: 180,
          categoryLabel: 'अस्वस्थ',
        },
      },
    });
    const validChatRes = createMockResponse();
    await chatHandler(validChatReq, validChatRes.res);
    expect(validChatRes.res.statusCode).toBe(503);
    expect(JSON.parse(validChatRes.getBody()).error).toMatch(/एपीआई कुंजी कॉन्फ़िगर नहीं/);
  });
});
