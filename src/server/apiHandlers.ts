import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GoogleGenAI,
  HarmBlockThreshold,
  HarmCategory,
  ThinkingLevel,
  Type,
  type Schema,
} from '@google/genai';
import { z } from 'zod';
import {
  API_TIMEOUT_MS,
  AQI_CACHE_TTL_MS,
  GEMINI_FALLBACK_MODELS,
  GEMINI_MODEL,
  HEALTH_PROBE_RATE_LIMIT_MAX,
  HEALTH_PROBE_TIMEOUT_MS,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_FREE_TEXT_LENGTH,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  REVERSE_GEOCODE_CACHE_TTL_MS,
  SERVER_GEMINI_TOTAL_TIMEOUT_MS,
} from '../constants/index.js';
import type { ApiErrorCategory, Language } from '../types/index.js';
import { TtlCache, buildAqiCacheKey } from '../utils/cache.js';
import {
  classifyUpstreamError,
  extractSafeErrorDiagnostics,
  getLocalizedApiErrorMessage,
  isDefinitiveKeyFailure,
} from '../utils/errorDiagnostics.js';
import {
  buildOpenMeteoAqiUrl,
  buildOpenMeteoGeocodingUrl,
  buildReverseGeocodingUrl,
  createLinkedTimeoutController,
} from '../utils/network.js';
import {
  buildChatSystemInstruction,
  buildChatUserPrompt,
  buildPlanRepairUserPrompt,
  buildPlanSystemInstruction,
  buildPlanUserPrompt,
} from '../utils/promptBuilder.js';
import { SlidingWindowRateLimiter } from '../utils/rateLimiter.js';
import {
  actionPlanSchema,
  lifestyleProfileSchema,
  sanitizeTextInput,
  validateCityQuery,
} from '../utils/validation.js';

/**
 * Minimal Node/Express/Vercel compatible request interface for API handlers.
 */
export interface ServerApiRequest extends IncomingMessage {
  query?: Record<string, unknown>;
  body?: unknown;
}

/**
 * Minimal Node/Express/Vercel compatible response type for API handlers.
 */
export type ServerApiResponse = ServerResponse;

const MAX_BODY_BYTES = 32 * 1024;
const MAX_TRACKED_IPS = 500;
const BASE_RETRY_DELAY_MS = 250;

const rateLimitersByIp = new Map<string, SlidingWindowRateLimiter>();
const probeRateLimitersByIp = new Map<string, SlidingWindowRateLimiter>();
const geocodeCache = new TtlCache<unknown>(AQI_CACHE_TTL_MS, 100);
const aqiCache = new TtlCache<unknown>(AQI_CACHE_TTL_MS, 100);
const reverseGeocodeCache = new TtlCache<{
  resolved: boolean;
  name: string | null;
  admin1: string;
  country: string;
}>(REVERSE_GEOCODE_CACHE_TTL_MS, 100);

class PayloadTooLargeError extends Error {
  constructor() {
    super('Request payload exceeds limit.');
    this.name = 'PayloadTooLargeError';
  }
}

class UnsupportedMediaTypeError extends Error {
  constructor() {
    super('Content-Type must be application/json.');
    this.name = 'UnsupportedMediaTypeError';
  }
}

/**
 * Dependency-injection overrides intended purely for unit/integration testing of retry,
 * fallback, and error classification paths without touching production behavior.
 */
export interface ServerAiTestOverrides {
  aiClient?: Pick<GoogleGenAI, 'models'>;
  retryDelayBaseMs?: number;
  totalTimeoutMs?: number;
}

let aiTestOverrides: ServerAiTestOverrides | null = null;

/**
 * Registers or clears test overrides for server Gemini calls (testing only).
 *
 * @param overrides - Mock `@google/genai` models object and fast retry timings, or `null` to reset.
 */
export function setServerAiTestOverrides(overrides: ServerAiTestOverrides | null): void {
  aiTestOverrides = overrides;
}

/**
 * Clears server-side geocode, AQI, and reverse-geocode TTL caches (intended for tests).
 */
export function resetServerCaches(): void {
  geocodeCache.clear();
  aqiCache.clear();
  reverseGeocodeCache.clear();
}

/**
 * Resets all server-side per-IP sliding-window rate limiters (intended for tests).
 */
export function resetServerRateLimiter(): void {
  rateLimitersByIp.clear();
  probeRateLimitersByIp.clear();
}

/**
 * Returns the configured primary Gemini model name from `GEMINI_MODEL` or the public default.
 */
export function getPrimaryGeminiModel(): string {
  const configured = process.env.GEMINI_MODEL?.trim();
  return configured || GEMINI_MODEL;
}

/**
 * Returns ordered unique Gemini model candidates for primary execution and automatic fallback.
 * When `GEMINI_MODEL` is set, it runs first, followed by the ordered fallback list.
 */
export function getGeminiModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim();
  const extraFallback = process.env.GEMINI_FALLBACK_MODEL?.trim();
  return Array.from(
    new Set(
      [primary, extraFallback, ...GEMINI_FALLBACK_MODELS].filter((value): value is string =>
        Boolean(value && value.trim()),
      ),
    ),
  );
}

function hasConfiguredGeminiKey(): boolean {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

function getClientIp(req: ServerApiRequest): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().slice(0, 80);
  }
  if (Array.isArray(forwarded) && typeof forwarded[0] === 'string' && forwarded[0].trim()) {
    return forwarded[0].split(',')[0].trim().slice(0, 80);
  }
  const remoteAddr = req.socket?.remoteAddress;
  return typeof remoteAddr === 'string' && remoteAddr.trim() ? remoteAddr.slice(0, 80) : 'local';
}

function consumeRateLimitFromMap(
  map: Map<string, SlidingWindowRateLimiter>,
  req: ServerApiRequest,
  maxRequests: number,
) {
  const ip = getClientIp(req);
  let limiter = map.get(ip);
  if (!limiter) {
    if (map.size >= MAX_TRACKED_IPS) {
      const oldestIp = map.keys().next().value;
      if (oldestIp !== undefined) {
        map.delete(oldestIp);
      }
    }
    limiter = new SlidingWindowRateLimiter(maxRequests, RATE_LIMIT_WINDOW_MS);
    map.set(ip, limiter);
  }
  return limiter.consume();
}

function consumePerIpRateLimit(req: ServerApiRequest) {
  return consumeRateLimitFromMap(rateLimitersByIp, req, RATE_LIMIT_MAX_REQUESTS * 2);
}

function consumeProbeRateLimit(req: ServerApiRequest) {
  return consumeRateLimitFromMap(probeRateLimitersByIp, req, HEALTH_PROBE_RATE_LIMIT_MAX);
}

const recommendationItemGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Short actionable headline.' },
    detail: {
      type: Type.STRING,
      description: 'Specific practical step tailored to the household.',
    },
    whyItHelps: {
      type: Type.STRING,
      description: 'Plain-language reason explaining the mechanism.',
    },
    estimatedImpact: {
      type: Type.STRING,
      description:
        'Approximate PM2.5 reduction or CO2 saved without repeating the word Approximate.',
    },
    timeWindow: { type: Type.STRING, description: 'Optional recommended or avoided time window.' },
  },
  required: ['title', 'detail', 'whyItHelps', 'estimatedImpact'],
};

const actionPlanResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    bestTimeWindow: { type: Type.STRING },
    worstTimeWindow: { type: Type.STRING },
    dailyRoutine: { type: Type.ARRAY, items: recommendationItemGeminiSchema },
    indoorAirHacks: { type: Type.ARRAY, items: recommendationItemGeminiSchema },
    sustainableAlternatives: { type: Type.ARRAY, items: recommendationItemGeminiSchema },
    healthProtection: { type: Type.ARRAY, items: recommendationItemGeminiSchema },
  },
  required: [
    'summary',
    'bestTimeWindow',
    'worstTimeWindow',
    'dailyRoutine',
    'indoorAirHacks',
    'sustainableAlternatives',
    'healthProtection',
  ],
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

const planRequestSchema = z.object({
  language: z.enum(['en', 'hi']),
  stream: z.boolean().optional(),
  repairPreviousMalformed: z.string().max(2500).optional(),
  location: z.object({
    id: z.string().max(120),
    name: z.string().min(1).max(120),
    admin1: z.string().max(120).optional(),
    country: z.string().max(120),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    source: z.enum(['search', 'geolocation', 'manual']),
  }),
  airQuality: z.object({
    usAqi: z.number().finite().min(0).max(500),
    pm25: z.number().finite().min(0).max(2000).nullable(),
    pm10: z.number().finite().min(0).max(2000).nullable(),
    no2: z.number().finite().min(0).max(2000).nullable(),
    o3: z.number().finite().min(0).max(2000).nullable(),
    timestamp: z.string().max(80),
    source: z.string().max(160),
    isManual: z.boolean(),
    category: z.object({
      key: z.enum(['good', 'moderate', 'sensitive', 'unhealthy', 'very_unhealthy', 'hazardous']),
      labelEn: z.string().max(80),
      labelHi: z.string().max(80),
      minAqi: z.number(),
      maxAqi: z.number(),
      accentHex: z.string().max(20),
      surfaceClass: z.string().max(120),
      textClass: z.string().max(120),
      borderClass: z.string().max(120),
      summaryEn: z.string().max(300),
      summaryHi: z.string().max(300),
    }),
  }),
  profile: lifestyleProfileSchema,
});

const chatRequestSchema = z.object({
  language: z.enum(['en', 'hi']),
  stream: z.boolean().optional(),
  message: z.string().min(1).max(MAX_FREE_TEXT_LENGTH),
  history: z
    .array(
      z.object({
        id: z.string().max(80),
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
        timestamp: z.string().max(80),
      }),
    )
    .max(MAX_CHAT_HISTORY_MESSAGES * 2),
  context: z.object({
    locationName: z.string().max(150),
    usAqi: z.number().finite().min(0).max(500),
    categoryLabel: z.string().max(100),
    planSummary: z.string().max(600).optional(),
  }),
});

const bigDataCloudResponseSchema = z.object({
  city: z.string().optional().default(''),
  locality: z.string().optional().default(''),
  principalSubdivision: z.string().optional().default(''),
  countryName: z.string().optional().default(''),
});

function setSecurityHeaders(res: ServerApiResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

function sendJson(
  res: ServerApiResponse,
  statusCode: number,
  payload: unknown,
  cacheControl?: string,
): void {
  if (res.writableEnded) {
    return;
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setSecurityHeaders(res);
  if (cacheControl) {
    res.setHeader('Cache-Control', cacheControl);
  }
  res.end(JSON.stringify(payload));
}

function getQueryParam(req: ServerApiRequest, key: string): string {
  if (req.query && key in req.query) {
    const val = req.query[key];
    if (typeof val === 'string') {
      return val;
    }
    if (Array.isArray(val) && typeof val[0] === 'string') {
      return val[0];
    }
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get(key) ?? '';
}

function checkPostContentType(req: ServerApiRequest): void {
  const rawType = req.headers?.['content-type'];
  if (!rawType) {
    return;
  }
  const normalized = Array.isArray(rawType) ? rawType[0] : rawType;
  if (!normalized.toLowerCase().includes('application/json')) {
    throw new UnsupportedMediaTypeError();
  }
}

async function readJsonBody(req: ServerApiRequest): Promise<unknown> {
  checkPostContentType(req);

  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf-8') > MAX_BODY_BYTES) {
        throw new PayloadTooLargeError();
      }
      return req.body.trim() ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) {
        throw new PayloadTooLargeError();
      }
      const text = req.body.toString('utf-8').trim();
      return text ? JSON.parse(text) : {};
    }
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf-8') > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    return req.body;
  }

  if (req.readableEnded) {
    return {};
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new PayloadTooLargeError());
        if (typeof req.destroy === 'function') {
          req.destroy();
        }
        return;
      }
      chunks.push(buf);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (parseErr) {
        reject(parseErr);
      }
    });

    req.on('error', reject);
  });
}

function enforceHttpMethod(
  req: ServerApiRequest,
  res: ServerApiResponse,
  allowedMethod: 'GET' | 'POST',
): boolean {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', `${allowedMethod}, OPTIONS`);
    setSecurityHeaders(res);
    res.end();
    return false;
  }
  if (method !== allowedMethod) {
    res.setHeader('Allow', `${allowedMethod}, OPTIONS`);
    sendJson(res, 405, {
      error: `Method ${method} not allowed.`,
      category: 'bad_request' satisfies ApiErrorCategory,
    });
    return false;
  }
  return true;
}

function createGeminiClient(): Pick<GoogleGenAI, 'models'> | null {
  if (aiTestOverrides?.aiClient) {
    return aiTestOverrides.aiClient;
  }
  if (!hasConfiguredGeminiKey()) {
    return null;
  }
  const apiKey = process.env.GEMINI_API_KEY!.trim();
  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return client.models ? { models: client.models } : null;
}

function writeSseEvent(res: ServerApiResponse, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function delayWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      globalThis.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = globalThis.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function buildModelConfig(
  model: string,
  systemInstruction: string,
  responseSchema: Schema | undefined,
  abortSignal: AbortSignal,
) {
  const isGemini3Or4 = /^gemini-[34]/i.test(model);
  return {
    systemInstruction,
    safetySettings,
    abortSignal,
    ...(isGemini3Or4
      ? {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        }
      : {
          temperature: 0.25,
          maxOutputTokens: responseSchema ? 2800 : 1200,
        }),
    ...(responseSchema
      ? {
          responseMimeType: 'application/json',
          responseSchema,
        }
      : {}),
  };
}

interface FirstChunkStreamResult {
  firstChunk: string;
  iterator: AsyncIterator<{ text?: string }>;
  model: string;
}

async function openValidatedStreamWithRetry(
  ai: Pick<GoogleGenAI, 'models'>,
  params: {
    routeLabel: '/api/plan' | '/api/chat';
    contents: string;
    systemInstruction: string;
    responseSchema?: Schema;
    signal: AbortSignal;
  },
): Promise<FirstChunkStreamResult> {
  const baseDelay = aiTestOverrides?.retryDelayBaseMs ?? BASE_RETRY_DELAY_MS;
  const models = getGeminiModelCandidates();
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (params.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const stream = await ai.models.generateContentStream({
          model,
          contents: params.contents,
          config: buildModelConfig(
            model,
            params.systemInstruction,
            params.responseSchema,
            params.signal,
          ),
        });
        const iterator = stream[Symbol.asyncIterator]();
        let firstChunk = '';
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            break;
          }
          if (next.value?.text) {
            firstChunk = next.value.text;
            break;
          }
        }
        if (!firstChunk) {
          throw new Error('Empty stream response from Gemini.');
        }
        return { firstChunk, iterator, model };
      } catch (err: unknown) {
        lastError = err;
        const { category, httpStatus, retryable } = classifyUpstreamError(err);
        console.error(`[SafeAir Saathi] ${params.routeLabel} stream attempt failed:`, {
          model,
          attempt: attempt + 1,
          category,
          status: httpStatus,
        });

        if (category === 'bad_request' || isDefinitiveKeyFailure(err)) {
          throw err;
        }
        if (category === 'model_unavailable' || category === 'invalid_key') {
          break;
        }
        if (retryable && attempt < 2) {
          const jitter = Math.floor(Math.random() * Math.max(1, Math.round(baseDelay * 0.4)));
          const waitMs = baseDelay * Math.pow(2, attempt) + jitter;
          await delayWithAbort(waitMs, params.signal);
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error('All Gemini model attempts failed.');
}

async function generateNonStreamingWithRetry(
  ai: Pick<GoogleGenAI, 'models'>,
  params: {
    routeLabel: '/api/plan' | '/api/chat';
    contents: string;
    systemInstruction: string;
    responseSchema?: Schema;
    signal: AbortSignal;
  },
): Promise<{ text: string; model: string }> {
  const baseDelay = aiTestOverrides?.retryDelayBaseMs ?? BASE_RETRY_DELAY_MS;
  const models = getGeminiModelCandidates();
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (params.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: buildModelConfig(
            model,
            params.systemInstruction,
            params.responseSchema,
            params.signal,
          ),
        });
        const text = (response.text ?? '').trim();
        if (!text) {
          throw new Error('Empty response from Gemini.');
        }
        return { text, model };
      } catch (err: unknown) {
        lastError = err;
        const { category, httpStatus, retryable } = classifyUpstreamError(err);
        console.error(`[SafeAir Saathi] ${params.routeLabel} generateContent attempt failed:`, {
          model,
          attempt: attempt + 1,
          category,
          status: httpStatus,
        });

        if (category === 'bad_request' || isDefinitiveKeyFailure(err)) {
          throw err;
        }
        if (category === 'model_unavailable' || category === 'invalid_key') {
          break;
        }
        if (retryable && attempt < 2) {
          const jitter = Math.floor(Math.random() * Math.max(1, Math.round(baseDelay * 0.4)));
          const waitMs = baseDelay * Math.pow(2, attempt) + jitter;
          await delayWithAbort(waitMs, params.signal);
          continue;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error('All Gemini non-streaming attempts failed.');
}

function tryParseValidPlanJson(rawText: string): string | null {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const validated = actionPlanSchema.safeParse(parsed);
    return validated.success ? JSON.stringify(validated.data) : null;
  } catch {
    return null;
  }
}

async function handleGeminiResponse(
  res: ServerApiResponse,
  options: {
    routeLabel: '/api/plan' | '/api/chat';
    contextType: 'plan' | 'chat';
    language: Language;
    preferNonStreaming: boolean;
    contents: string;
    systemInstruction: string;
    responseSchema?: Schema;
  },
): Promise<void> {
  const ai = createGeminiClient();
  if (!ai) {
    console.error(`[SafeAir Saathi] ${options.routeLabel} unavailable:`, {
      category: 'missing_key',
      status: 503,
    });
    sendJson(res, 503, {
      error: getLocalizedApiErrorMessage('missing_key', options.language, options.contextType),
      category: 'missing_key' satisfies ApiErrorCategory,
    });
    return;
  }

  const totalBudget = aiTestOverrides?.totalTimeoutMs ?? SERVER_GEMINI_TOTAL_TIMEOUT_MS;
  const { controller, cleanup } = createLinkedTimeoutController(totalBudget);

  const onResClose = (): void => {
    if (!res.writableEnded) {
      controller.abort();
    }
  };
  res.on?.('close', onResClose);

  try {
    if (!options.preferNonStreaming) {
      try {
        const streamResult = await openValidatedStreamWithRetry(ai, {
          routeLabel: options.routeLabel,
          contents: options.contents,
          systemInstruction: options.systemInstruction,
          responseSchema: options.responseSchema,
          signal: controller.signal,
        });

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        setSecurityHeaders(res);
        if (typeof res.flushHeaders === 'function') {
          res.flushHeaders();
        }

        writeSseEvent(res, { chunk: streamResult.firstChunk, model: streamResult.model });

        try {
          while (true) {
            const step = await streamResult.iterator.next();
            if (step.done) {
              break;
            }
            if (step.value?.text) {
              writeSseEvent(res, { chunk: step.value.text });
            }
          }
          writeSseEvent(res, { done: true, model: streamResult.model });
        } catch (midStreamErr: unknown) {
          const { category, httpStatus } = classifyUpstreamError(midStreamErr);
          const diag = extractSafeErrorDiagnostics(midStreamErr);
          console.error(`[SafeAir Saathi] ${options.routeLabel} mid-stream failure:`, {
            category,
            status: httpStatus,
          });
          writeSseEvent(res, {
            error: getLocalizedApiErrorMessage(category, options.language, options.contextType),
            category,
            errorType: diag.errorType,
          });
        } finally {
          res.end();
        }
        return;
      } catch (streamStartErr: unknown) {
        const { category } = classifyUpstreamError(streamStartErr);
        // If auth/request/timeout caused pre-stream failure, surface cleanly without wasting extra call;
        // otherwise fall back automatically to non-streaming JSON generation.
        if (category === 'invalid_key' || category === 'bad_request' || controller.signal.aborted) {
          throw streamStartErr;
        }
      }
    }

    // Non-streaming JSON fallback (or explicit non-streaming request)
    const generated = await generateNonStreamingWithRetry(ai, {
      routeLabel: options.routeLabel,
      contents: options.contents,
      systemInstruction: options.systemInstruction,
      responseSchema: options.responseSchema,
      signal: controller.signal,
    });

    if (options.contextType === 'plan') {
      let validPlanJson = tryParseValidPlanJson(generated.text);
      if (!validPlanJson) {
        const repair = await generateNonStreamingWithRetry(ai, {
          routeLabel: options.routeLabel,
          contents: buildPlanRepairUserPrompt(generated.text, options.language),
          systemInstruction: options.systemInstruction,
          responseSchema: options.responseSchema,
          signal: controller.signal,
        });
        validPlanJson = tryParseValidPlanJson(repair.text);
      }

      if (!validPlanJson) {
        sendJson(res, 502, {
          error: getLocalizedApiErrorMessage('upstream_error', options.language, 'plan'),
          category: 'upstream_error' satisfies ApiErrorCategory,
        });
        return;
      }

      sendJson(res, 200, {
        text: validPlanJson,
        model: generated.model,
        nonStreaming: true,
      });
      return;
    }

    sendJson(res, 200, {
      text: generated.text,
      model: generated.model,
      nonStreaming: true,
    });
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error(`[SafeAir Saathi] ${options.routeLabel} failed:`, {
      category,
      status: httpStatus,
    });
    sendJson(res, httpStatus, {
      error: getLocalizedApiErrorMessage(category, options.language, options.contextType),
      category,
    });
  } finally {
    res.off?.('close', onResClose);
    cleanup();
  }
}

async function proxyOpenMeteoJson(
  res: ServerApiResponse,
  targetUrl: string,
  routeLabel: '/api/geocode' | '/api/aqi',
  cache: TtlCache<unknown>,
  cacheKey: string,
  upstreamFailMessage: string,
  unreachableMessage: string,
): Promise<void> {
  const cached = cache.get(cacheKey);
  if (cached !== undefined) {
    sendJson(res, 200, cached, 'public, s-maxage=300, stale-while-revalidate=60');
    return;
  }

  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS);
  try {
    const upstream = await fetch(targetUrl, { signal: controller.signal });
    if (!upstream.ok) {
      const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
      console.error(`[SafeAir Saathi] ${routeLabel} upstream status:`, { status });
      sendJson(res, status, { error: upstreamFailMessage, category: 'upstream_error' });
      return;
    }
    const data: unknown = await upstream.json();
    cache.set(cacheKey, data);
    sendJson(res, 200, data, 'public, s-maxage=300, stale-while-revalidate=60');
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error(`[SafeAir Saathi] ${routeLabel} failed:`, { category, status: httpStatus });
    sendJson(res, httpStatus, { error: unreachableMessage, category });
  } finally {
    cleanup();
  }
}

type HealthProbeCategory =
  | 'missing_key'
  | 'invalid_key'
  | 'quota_exceeded'
  | 'model_unavailable'
  | 'timeout'
  | 'upstream_error';

async function runHealthProbe(req: ServerApiRequest, res: ServerApiResponse): Promise<void> {
  const modelTried = getPrimaryGeminiModel();
  const rate = consumeProbeRateLimit(req);
  if (!rate.allowed) {
    sendJson(
      res,
      429,
      {
        ok: false,
        modelTried,
        status: 429,
        category: 'quota_exceeded' satisfies HealthProbeCategory,
      },
      'no-store',
    );
    return;
  }

  const ai = createGeminiClient();
  if (!ai) {
    sendJson(
      res,
      503,
      {
        ok: false,
        modelTried,
        status: 503,
        category: 'missing_key' satisfies HealthProbeCategory,
      },
      'no-store',
    );
    return;
  }

  const probeTimeout = aiTestOverrides?.totalTimeoutMs ?? HEALTH_PROBE_TIMEOUT_MS;
  const { controller, cleanup } = createLinkedTimeoutController(probeTimeout);
  try {
    const isGemini3Or4 = /^gemini-[34]/i.test(modelTried);
    await ai.models.generateContent({
      model: modelTried,
      contents: 'Reply with OK.',
      config: {
        abortSignal: controller.signal,
        ...(isGemini3Or4
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : { maxOutputTokens: 16 }),
      },
    });
    sendJson(
      res,
      200,
      {
        ok: true,
        modelTried,
        status: 200,
        category: null,
      },
      'no-store',
    );
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    const diag = extractSafeErrorDiagnostics(err);
    const probeCategory: HealthProbeCategory =
      category === 'bad_request' ? 'upstream_error' : category;
    const reportedStatus =
      typeof diag.status === 'number' && diag.status >= 100 && diag.status < 600
        ? diag.status
        : httpStatus;
    console.error('[SafeAir Saathi] /api/health probe failed:', {
      model: modelTried,
      category: probeCategory,
      status: reportedStatus,
    });
    sendJson(
      res,
      httpStatus,
      {
        ok: false,
        modelTried,
        status: reportedStatus,
        category: probeCategory,
      },
      'no-store',
    );
  } finally {
    cleanup();
  }
}

/**
 * Shared handler for `GET /api/health` exposing configuration readiness and optional
 * rate-limited `?probe=1` live Gemini connectivity diagnostics without leaking secrets.
 *
 * @param req - Incoming HTTP request.
 * @param res - Outgoing HTTP JSON response.
 */
export async function handleHealthRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'GET')) {
      return;
    }

    const probeParam = getQueryParam(req, 'probe').trim().toLowerCase();
    if (probeParam === '1' || probeParam === 'true') {
      await runHealthProbe(req, res);
      return;
    }

    sendJson(
      res,
      200,
      {
        ok: true,
        keyConfigured: hasConfiguredGeminiKey(),
        model: getPrimaryGeminiModel(),
        fallbackModels: getGeminiModelCandidates(),
        runtime: 'nodejs',
        time: new Date().toISOString(),
      },
      'no-store',
    );
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/health failed:', { category, status: httpStatus });
    sendJson(res, 500, { ok: false, error: 'Health check error.' }, 'no-store');
  }
}

/**
 * Shared handler for `GET /api/geocode` across Express and Vercel serverless functions.
 *
 * @param req - Incoming HTTP request with `name` query parameter.
 * @param res - Outgoing HTTP response returning Open-Meteo geocoding JSON.
 */
export async function handleGeocodeRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'GET')) {
      return;
    }
    const rawQuery = getQueryParam(req, 'name');
    const { valid, sanitized } = validateCityQuery(rawQuery);
    if (!valid) {
      sendJson(res, 400, { error: 'Invalid city search query.', category: 'bad_request' });
      return;
    }

    await proxyOpenMeteoJson(
      res,
      buildOpenMeteoGeocodingUrl(sanitized),
      '/api/geocode',
      geocodeCache,
      sanitized.toLowerCase(),
      'Upstream geocoding failed.',
      'Unable to reach geocoding service.',
    );
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/geocode unhandled:', { category, status: httpStatus });
    sendJson(res, httpStatus, { error: 'Unable to process geocoding request.', category });
  }
}

/**
 * Shared handler for `GET /api/reverse-geocode` resolving coordinates to a city/locality name
 * via a free no-key provider with caching and graceful degradation.
 *
 * @param req - Incoming HTTP request with `latitude`, `longitude`, and optional `language`.
 * @param res - Outgoing HTTP JSON response with resolved place metadata.
 */
export async function handleReverseGeocodeRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'GET')) {
      return;
    }
    const latParam = getQueryParam(req, 'latitude');
    const lonParam = getQueryParam(req, 'longitude');
    const langParam = getQueryParam(req, 'language') === 'hi' ? 'hi' : 'en';
    const lat = latParam ? Number(latParam) : Number.NaN;
    const lon = lonParam ? Number(lonParam) : Number.NaN;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      sendJson(res, 400, { error: 'Invalid coordinates.', category: 'bad_request' });
      return;
    }

    const cacheKey = `${buildAqiCacheKey(lat, lon)}:${langParam}`;
    const cached = reverseGeocodeCache.get(cacheKey);
    if (cached) {
      sendJson(res, 200, cached, 'public, s-maxage=3600, stale-while-revalidate=600');
      return;
    }

    const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS);
    try {
      const upstream = await fetch(buildReverseGeocodingUrl(lat, lon, langParam), {
        signal: controller.signal,
      });
      if (!upstream.ok) {
        sendJson(res, 200, { resolved: false, name: null, admin1: '', country: '' });
        return;
      }
      const raw: unknown = await upstream.json();
      const parsed = bigDataCloudResponseSchema.safeParse(raw);
      if (!parsed.success) {
        sendJson(res, 200, { resolved: false, name: null, admin1: '', country: '' });
        return;
      }
      const primaryName =
        sanitizeTextInput(parsed.data.locality || parsed.data.city, 120) ||
        sanitizeTextInput(parsed.data.principalSubdivision, 120);
      const admin1 = sanitizeTextInput(parsed.data.principalSubdivision, 120);
      const country = sanitizeTextInput(parsed.data.countryName, 120);
      const payload = {
        resolved: Boolean(primaryName),
        name: primaryName || null,
        admin1: admin1 === primaryName ? '' : admin1,
        country,
      };
      if (payload.resolved) {
        reverseGeocodeCache.set(cacheKey, payload);
      }
      sendJson(res, 200, payload, 'public, s-maxage=3600, stale-while-revalidate=600');
    } catch (err: unknown) {
      const { category, httpStatus } = classifyUpstreamError(err);
      console.error('[SafeAir Saathi] /api/reverse-geocode failed:', {
        category,
        status: httpStatus,
      });
      sendJson(res, 200, { resolved: false, name: null, admin1: '', country: '' });
    } finally {
      cleanup();
    }
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/reverse-geocode unhandled:', {
      category,
      status: httpStatus,
    });
    sendJson(res, 200, { resolved: false, name: null, admin1: '', country: '' });
  }
}

/**
 * Shared handler for `GET /api/aqi` across Express and Vercel serverless functions.
 *
 * @param req - Incoming HTTP request with `latitude` and `longitude` query parameters.
 * @param res - Outgoing HTTP response returning Open-Meteo air quality JSON.
 */
export async function handleAqiRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'GET')) {
      return;
    }
    const latParam = getQueryParam(req, 'latitude');
    const lonParam = getQueryParam(req, 'longitude');
    const lat = latParam ? Number(latParam) : Number.NaN;
    const lon = lonParam ? Number(lonParam) : Number.NaN;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      sendJson(res, 400, { error: 'Invalid coordinates.', category: 'bad_request' });
      return;
    }

    await proxyOpenMeteoJson(
      res,
      buildOpenMeteoAqiUrl(lat, lon),
      '/api/aqi',
      aqiCache,
      buildAqiCacheKey(lat, lon),
      'Upstream air quality lookup failed.',
      'Unable to reach air quality service.',
    );
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/aqi unhandled:', { category, status: httpStatus });
    sendJson(res, httpStatus, { error: 'Unable to fetch air quality.', category });
  }
}

/**
 * Shared handler for `POST /api/plan` streaming structured 4-section plans via SSE with
 * automatic non-streaming JSON fallback, retry with backoff, and category-based errors.
 *
 * @param req - Incoming HTTP POST request with location, air quality, profile, and language.
 * @param res - Outgoing HTTP SSE or JSON response.
 */
export async function handlePlanRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'POST')) {
      return;
    }

    const rate = consumePerIpRateLimit(req);
    if (!rate.allowed) {
      sendJson(res, 429, {
        error: getLocalizedApiErrorMessage('quota_exceeded', 'en', 'plan'),
        category: 'quota_exceeded' satisfies ApiErrorCategory,
      });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err: unknown) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, {
          error: 'Request payload exceeds maximum size.',
          category: 'bad_request' satisfies ApiErrorCategory,
        });
        return;
      }
      if (err instanceof UnsupportedMediaTypeError) {
        sendJson(res, 415, {
          error: 'Content-Type must be application/json.',
          category: 'bad_request' satisfies ApiErrorCategory,
        });
        return;
      }
      sendJson(res, 400, {
        error: 'Invalid JSON request payload for plan generation.',
        category: 'bad_request' satisfies ApiErrorCategory,
      });
      return;
    }

    const parsed = planRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, {
        error: 'Invalid request payload for plan generation.',
        category: 'bad_request' satisfies ApiErrorCategory,
      });
      return;
    }

    const { location, airQuality, profile, language, stream, repairPreviousMalformed } =
      parsed.data;
    const contents = repairPreviousMalformed
      ? buildPlanRepairUserPrompt(repairPreviousMalformed, language)
      : buildPlanUserPrompt(location, airQuality, profile, language);

    const acceptHeader = req.headers?.['accept'];
    const preferNonStreaming =
      stream === false ||
      Boolean(repairPreviousMalformed) ||
      (typeof acceptHeader === 'string' && acceptHeader.includes('application/json'));

    await handleGeminiResponse(res, {
      routeLabel: '/api/plan',
      contextType: 'plan',
      language,
      preferNonStreaming,
      contents,
      systemInstruction: buildPlanSystemInstruction(language),
      responseSchema: actionPlanResponseSchema,
    });
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/plan unhandled:', { category, status: httpStatus });
    sendJson(res, httpStatus, {
      error: getLocalizedApiErrorMessage(category, 'en', 'plan'),
      category,
    });
  }
}

/**
 * Shared handler for `POST /api/chat` streaming scoped follow-up replies via SSE with
 * automatic non-streaming JSON fallback and category-based errors.
 *
 * @param req - Incoming HTTP POST request with message, history, context, and language.
 * @param res - Outgoing HTTP SSE or JSON response.
 */
export async function handleChatRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  try {
    if (!enforceHttpMethod(req, res, 'POST')) {
      return;
    }

    const rate = consumePerIpRateLimit(req);
    if (!rate.allowed) {
      sendJson(res, 429, {
        error: getLocalizedApiErrorMessage('quota_exceeded', 'en', 'chat'),
        category: 'quota_exceeded' satisfies ApiErrorCategory,
      });
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err: unknown) {
      if (err instanceof PayloadTooLargeError) {
        sendJson(res, 413, {
          error: 'Request payload exceeds maximum size.',
          category: 'bad_request' satisfies ApiErrorCategory,
        });
        return;
      }
      if (err instanceof UnsupportedMediaTypeError) {
        sendJson(res, 415, {
          error: 'Content-Type must be application/json.',
          category: 'bad_request' satisfies ApiErrorCategory,
        });
        return;
      }
      sendJson(res, 400, {
        error: 'Invalid JSON chat request payload.',
        category: 'bad_request' satisfies ApiErrorCategory,
      });
      return;
    }

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      sendJson(res, 400, {
        error: 'Invalid chat message or context.',
        category: 'bad_request' satisfies ApiErrorCategory,
      });
      return;
    }

    const sanitizedMessage = sanitizeTextInput(parsed.data.message, MAX_FREE_TEXT_LENGTH);
    if (!sanitizedMessage) {
      sendJson(res, 400, {
        error: 'Please enter a valid question.',
        category: 'bad_request' satisfies ApiErrorCategory,
      });
      return;
    }

    const acceptHeader = req.headers?.['accept'];
    const preferNonStreaming =
      parsed.data.stream === false ||
      (typeof acceptHeader === 'string' && acceptHeader.includes('application/json'));

    await handleGeminiResponse(res, {
      routeLabel: '/api/chat',
      contextType: 'chat',
      language: parsed.data.language,
      preferNonStreaming,
      contents: buildChatUserPrompt(sanitizedMessage, parsed.data.history, parsed.data.context),
      systemInstruction: buildChatSystemInstruction(parsed.data.language),
    });
  } catch (err: unknown) {
    const { category, httpStatus } = classifyUpstreamError(err);
    console.error('[SafeAir Saathi] /api/chat unhandled:', { category, status: httpStatus });
    sendJson(res, httpStatus, {
      error: getLocalizedApiErrorMessage(category, 'en', 'chat'),
      category,
    });
  }
}
