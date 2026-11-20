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
  GEMINI_FALLBACK_MODEL,
  GEMINI_MODEL,
  MAX_CHAT_HISTORY_MESSAGES,
  MAX_FREE_TEXT_LENGTH,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../constants/index.ts';
import type { Language } from '../types/index.ts';
import { extractSafeErrorDiagnostics } from '../utils/errorDiagnostics.ts';
import {
  buildOpenMeteoAqiUrl,
  buildOpenMeteoGeocodingUrl,
  createLinkedTimeoutController,
} from '../utils/network.ts';
import {
  buildChatSystemInstruction,
  buildChatUserPrompt,
  buildPlanSystemInstruction,
  buildPlanUserPrompt,
} from '../utils/promptBuilder.ts';
import { SlidingWindowRateLimiter } from '../utils/rateLimiter.ts';
import {
  lifestyleProfileSchema,
  sanitizeTextInput,
  validateCityQuery,
} from '../utils/validation.ts';

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

const serverRateLimiter = new SlidingWindowRateLimiter(
  RATE_LIMIT_MAX_REQUESTS * 2,
  RATE_LIMIT_WINDOW_MS,
);

/**
 * Resets the server-side sliding-window rate limiter (intended for unit/integration tests).
 */
export function resetServerRateLimiter(): void {
  serverRateLimiter.reset();
}

const MODEL_CANDIDATES = Array.from(new Set([GEMINI_MODEL, GEMINI_FALLBACK_MODEL]));

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
      description: 'Approximate PM2.5 exposure reduction or CO2 saved, marked as approximate.',
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

function sendJson(res: ServerApiResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

async function readJsonBody(req: ServerApiRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return JSON.parse(req.body);
    }
    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString('utf-8'));
    }
    return req.body;
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error('Request payload exceeds limit.'));
        req.destroy();
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
    res.end();
    return false;
  }
  if (method !== allowedMethod) {
    res.setHeader('Allow', `${allowedMethod}, OPTIONS`);
    sendJson(res, 405, { error: `Method ${method} not allowed.` });
    return false;
  }
  return true;
}

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function writeSseEvent(res: ServerApiResponse, payload: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

async function generateStreamWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseSchema?: Schema;
  },
): Promise<AsyncIterable<{ text?: string }>> {
  const config = {
    systemInstruction: params.systemInstruction,
    safetySettings,
    thinkingConfig: {
      thinkingLevel: ThinkingLevel.LOW,
    },
    ...(params.responseSchema
      ? {
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        }
      : {}),
  };

  let lastError: unknown;
  const attemptDiagnostics: Array<{
    model: string;
    attempt: number;
    errorType: string;
    status: string | number;
  }> = [];

  for (const model of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await ai.models.generateContentStream({
          model,
          contents: params.contents,
          config,
        });
      } catch (err: unknown) {
        lastError = err;
        const diag = extractSafeErrorDiagnostics(err);
        attemptDiagnostics.push({
          model,
          attempt: attempt + 1,
          errorType: diag.errorType,
          status: diag.status,
        });

        const isNotFound = diag.status === 404 || diag.message.includes('404');
        const isTransient =
          diag.status === 503 || diag.status === 429 || diag.message.includes('UNAVAILABLE');

        if (isNotFound) {
          break;
        }
        if (isTransient && attempt === 0) {
          await delayMs(500);
          continue;
        }
        if (isTransient) {
          break;
        }
        throw err;
      }
    }
  }

  console.error('[SafeAir Saathi] All Gemini model attempts failed:', {
    attempts: attemptDiagnostics,
  });
  throw lastError;
}

async function streamGeminiSseResponse(
  res: ServerApiResponse,
  options: {
    routeLabel: '/api/plan' | '/api/chat';
    language: Language;
    missingKeyError: Record<Language, string>;
    streamError: Record<Language, string>;
    contents: string;
    systemInstruction: string;
    responseSchema?: Schema;
  },
): Promise<void> {
  const ai = createGeminiClient();
  if (!ai) {
    console.error(`[SafeAir Saathi] ${options.routeLabel} missing GEMINI_API_KEY configuration.`);
    sendJson(res, 503, { error: options.missingKeyError[options.language] });
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  try {
    const stream = await generateStreamWithFallback(ai, {
      contents: options.contents,
      systemInstruction: options.systemInstruction,
      responseSchema: options.responseSchema,
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        writeSseEvent(res, { chunk: chunk.text });
      }
    }
    writeSseEvent(res, { done: true });
  } catch (err: unknown) {
    const diag = extractSafeErrorDiagnostics(err);
    console.error(`[SafeAir Saathi] ${options.routeLabel} Gemini error:`, diag);
    writeSseEvent(res, {
      error: options.streamError[options.language],
      errorType: diag.errorType,
    });
  } finally {
    res.end();
  }
}

async function proxyOpenMeteoJson(
  res: ServerApiResponse,
  targetUrl: string,
  routeLabel: '/api/geocode' | '/api/aqi',
  upstreamFailMessage: string,
  unreachableMessage: string,
): Promise<void> {
  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS);
  try {
    const upstream = await fetch(targetUrl, { signal: controller.signal });
    if (!upstream.ok) {
      sendJson(res, upstream.status, { error: upstreamFailMessage });
      return;
    }
    const data: unknown = await upstream.json();
    sendJson(res, 200, data);
  } catch (err: unknown) {
    console.error(`[SafeAir Saathi] ${routeLabel} error:`, extractSafeErrorDiagnostics(err));
    sendJson(res, 502, { error: unreachableMessage });
  } finally {
    cleanup();
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
  if (!enforceHttpMethod(req, res, 'GET')) {
    return;
  }
  const rawQuery = getQueryParam(req, 'name');
  const { valid, sanitized } = validateCityQuery(rawQuery);
  if (!valid) {
    sendJson(res, 400, { error: 'Invalid city search query.' });
    return;
  }

  await proxyOpenMeteoJson(
    res,
    buildOpenMeteoGeocodingUrl(sanitized),
    '/api/geocode',
    'Upstream geocoding failed.',
    'Unable to reach geocoding service.',
  );
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
    sendJson(res, 400, { error: 'Invalid coordinates.' });
    return;
  }

  await proxyOpenMeteoJson(
    res,
    buildOpenMeteoAqiUrl(lat, lon),
    '/api/aqi',
    'Upstream air quality lookup failed.',
    'Unable to reach air quality service.',
  );
}

/**
 * Shared handler for `POST /api/plan` streaming structured 4-section plans via SSE.
 *
 * @param req - Incoming HTTP POST request with location, air quality, profile, and language.
 * @param res - Outgoing HTTP SSE response streaming Gemini JSON chunks.
 */
export async function handlePlanRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  if (!enforceHttpMethod(req, res, 'POST')) {
    return;
  }

  const rate = serverRateLimiter.consume();
  if (!rate.allowed) {
    sendJson(res, 429, { error: 'Too many plan requests. Please wait a minute and retry.' });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid request payload for plan generation.' });
    return;
  }

  const parsed = planRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid request payload for plan generation.' });
    return;
  }

  const { location, airQuality, profile, language } = parsed.data;
  await streamGeminiSseResponse(res, {
    routeLabel: '/api/plan',
    language,
    missingKeyError: {
      en: 'Gemini AI service is not configured on the server. Using rule-based guidance instead.',
      hi: 'सर्वर पर जेमिनी एआई सेवा कॉन्फ़िगर नहीं है। नियम-आधारित मार्गदर्शन दिखाया जा रहा है।',
    },
    streamError: {
      en: 'Unable to generate AI plan right now. Showing rule-based guidance instead.',
      hi: 'AI योजना अभी तैयार नहीं हो सकी। इसके बजाय नियम-आधारित सुरक्षा मार्गदर्शन दिखाया जा रहा है।',
    },
    contents: buildPlanUserPrompt(location, airQuality, profile, language),
    systemInstruction: buildPlanSystemInstruction(language),
    responseSchema: actionPlanResponseSchema,
  });
}

/**
 * Shared handler for `POST /api/chat` streaming scoped follow-up replies via SSE.
 *
 * @param req - Incoming HTTP POST request with message, history, context, and language.
 * @param res - Outgoing HTTP SSE response streaming Gemini markdown chunks.
 */
export async function handleChatRequest(
  req: ServerApiRequest,
  res: ServerApiResponse,
): Promise<void> {
  if (!enforceHttpMethod(req, res, 'POST')) {
    return;
  }

  const rate = serverRateLimiter.consume();
  if (!rate.allowed) {
    sendJson(res, 429, { error: 'Too many chat requests. Please wait a minute and retry.' });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid chat message or context.' });
    return;
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    sendJson(res, 400, { error: 'Invalid chat message or context.' });
    return;
  }

  const sanitizedMessage = sanitizeTextInput(parsed.data.message, MAX_FREE_TEXT_LENGTH);
  if (!sanitizedMessage) {
    sendJson(res, 400, { error: 'Please enter a valid question.' });
    return;
  }

  await streamGeminiSseResponse(res, {
    routeLabel: '/api/chat',
    language: parsed.data.language,
    missingKeyError: {
      en: 'Gemini AI chat is currently unavailable because no API key is configured.',
      hi: 'जेमिनी एआई चैट अभी उपलब्ध नहीं है क्योंकि एपीआई कुंजी कॉन्फ़िगर नहीं है।',
    },
    streamError: {
      en: 'Unable to complete the reply right now. Please try again shortly.',
      hi: 'अभी उत्तर पूरा नहीं हो सका। कृपया कुछ क्षण बाद पुनः प्रयास करें।',
    },
    contents: buildChatUserPrompt(sanitizedMessage, parsed.data.history, parsed.data.context),
    systemInstruction: buildChatSystemInstruction(parsed.data.language),
  });
}
