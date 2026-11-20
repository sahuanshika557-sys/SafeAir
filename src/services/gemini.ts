import {
  API_TIMEOUT_MS,
  PLAN_CACHE_TTL_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../constants/index.ts';
import type {
  ActionPlan,
  AirQualityReading,
  ApiErrorCategory,
  ChatMessage,
  Language,
  LifestyleProfile,
  LocationData,
} from '../types/index.ts';
import { buildPlanCacheKey, TtlCache } from '../utils/cache.ts';
import { getLocalizedApiErrorMessage } from '../utils/errorDiagnostics.ts';
import { sanitizeActionPlanImpact } from '../utils/impactCalculator.ts';
import { createLinkedTimeoutController, isAbortError } from '../utils/network.ts';
import { SlidingWindowRateLimiter } from '../utils/rateLimiter.ts';
import { actionPlanSchema } from '../utils/validation.ts';

const planCache = new TtlCache<ActionPlan>(PLAN_CACHE_TTL_MS);
const clientRateLimiter = new SlidingWindowRateLimiter(
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
);

interface InFlightPlanEntry {
  promise: Promise<ActionPlan>;
  controller: AbortController;
  subscribers: number;
  progressListeners: Set<(partialText: string) => void>;
}

const inFlightPlanRequests = new Map<string, InFlightPlanEntry>();

const VALID_ERROR_CATEGORIES: ReadonlySet<string> = new Set([
  'missing_key',
  'invalid_key',
  'quota_exceeded',
  'model_unavailable',
  'timeout',
  'bad_request',
  'upstream_error',
]);

/**
 * Resets the client-side plan cache, in-flight request map, and sliding-window rate limiter.
 * Intended for deterministic unit and service tests.
 */
export function resetGeminiClientState(): void {
  planCache.clear();
  clientRateLimiter.reset();
  inFlightPlanRequests.clear();
}

function consumeClientRateLimit(language: Language, actionType: 'plan' | 'chat'): void {
  const rateCheck = clientRateLimiter.consume();
  if (rateCheck.allowed) {
    return;
  }
  const waitSeconds = Math.max(1, Math.ceil(rateCheck.retryAfterMs / 1000));
  if (language === 'hi') {
    const suffix = actionType === 'plan' ? 'पुनः प्रयास करें' : 'पूछें';
    throw new Error(`अनुरोध सीमा पूरी हो गई है। कृपया ${waitSeconds} सेकंड बाद ${suffix}।`);
  }
  const suffix = actionType === 'plan' ? 'trying again' : 'asking again';
  throw new Error(`Rate limit reached. Please wait ${waitSeconds}s before ${suffix}.`);
}

async function extractHttpErrorMessage(
  response: Response,
  language: Language,
  serviceType: 'plan' | 'chat',
): Promise<string> {
  const errorBody = (await response.json().catch(() => ({}))) as {
    error?: string;
    category?: string;
  };
  if (errorBody.category && VALID_ERROR_CATEGORIES.has(errorBody.category)) {
    return getLocalizedApiErrorMessage(
      errorBody.category as ApiErrorCategory,
      language,
      serviceType,
    );
  }
  if (errorBody.error && !/\bhttp\s*\d{3}\b/i.test(errorBody.error)) {
    return errorBody.error;
  }
  if (response.status === 429) {
    return getLocalizedApiErrorMessage('quota_exceeded', language, serviceType);
  }
  if (response.status === 503) {
    return getLocalizedApiErrorMessage('model_unavailable', language, serviceType);
  }
  if (response.status === 504) {
    return getLocalizedApiErrorMessage('timeout', language, serviceType);
  }
  return getLocalizedApiErrorMessage('upstream_error', language, serviceType);
}

/**
 * Parses Server-Sent Events lines from a fetch `ReadableStream` and forwards accumulated chunks.
 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
  language: Language,
  serviceType: 'plan' | 'chat',
): Promise<{ text: string; model?: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';
  let modelUsed: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const rawEvent of events) {
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) {
        continue;
      }
      const payloadStr = dataLine.slice(6).trim();
      if (!payloadStr) {
        continue;
      }
      const parsed = JSON.parse(payloadStr) as {
        chunk?: string;
        error?: string;
        errorType?: string;
        category?: string;
        model?: string;
        done?: boolean;
      };
      if (parsed.model) {
        modelUsed = parsed.model;
      }
      if (parsed.error) {
        if (parsed.errorType) {
          console.warn('[SafeAir Saathi] AI stream failed:', { errorType: parsed.errorType });
        }
        if (parsed.category && VALID_ERROR_CATEGORIES.has(parsed.category)) {
          throw new Error(
            getLocalizedApiErrorMessage(parsed.category as ApiErrorCategory, language, serviceType),
          );
        }
        throw new Error(parsed.error);
      }
      if (parsed.chunk) {
        accumulated += parsed.chunk;
        onChunk(accumulated);
      }
    }
  }

  return { text: accumulated, model: modelUsed };
}

async function readPlanOrChatResponseBody(
  response: Response,
  onProgress: (text: string) => void,
  language: Language,
  serviceType: 'plan' | 'chat',
): Promise<{ text: string; model?: string }> {
  const contentType = response.headers?.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const jsonPayload = (await response.json()) as {
      text?: string;
      model?: string;
      error?: string;
      category?: string;
    };
    if (jsonPayload.error) {
      if (jsonPayload.category && VALID_ERROR_CATEGORIES.has(jsonPayload.category)) {
        throw new Error(
          getLocalizedApiErrorMessage(
            jsonPayload.category as ApiErrorCategory,
            language,
            serviceType,
          ),
        );
      }
      throw new Error(jsonPayload.error);
    }
    const text = jsonPayload.text ?? '';
    if (text) {
      onProgress(text);
    }
    return { text, model: jsonPayload.model };
  }

  if (response.body) {
    return readSseStream(response.body, onProgress, language, serviceType);
  }

  const text = await response.text();
  if (text) {
    onProgress(text);
  }
  return { text };
}

function parseAndValidatePlanText(
  rawText: string,
  meta: {
    location: LocationData;
    airQuality: AirQualityReading;
    profile: LifestyleProfile;
    language: Language;
    modelUsed?: string;
  },
): ActionPlan | null {
  const cleanedJson = rawText
    .replace(/^```json\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanedJson);
  } catch {
    return null;
  }

  const validated = actionPlanSchema.safeParse(parsedJson);
  if (!validated.success) {
    return null;
  }

  const basePlan: ActionPlan = {
    ...validated.data,
    generatedAt: new Date().toISOString(),
    isFallback: false,
    generatedForLocationId: meta.location.id,
    generatedForLocationName: [meta.location.name, meta.location.country]
      .filter(Boolean)
      .join(', '),
    generatedForAqi: meta.airQuality.usAqi,
    generatedForCategoryKey: meta.airQuality.category.key,
    generatedForLanguage: meta.language,
    generatedForProfile: meta.profile,
    modelUsed: meta.modelUsed,
  };

  return sanitizeActionPlanImpact(basePlan, meta.language);
}

async function attemptPlanJsonRepair(params: {
  malformedText: string;
  location: LocationData;
  airQuality: AirQualityReading;
  profile: LifestyleProfile;
  language: Language;
  signal: AbortSignal;
}): Promise<ActionPlan | null> {
  try {
    const response = await fetch('/api/plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        location: params.location,
        airQuality: params.airQuality,
        profile: params.profile,
        language: params.language,
        stream: false,
        repairPreviousMalformed: params.malformedText.slice(0, 2200),
      }),
      signal: params.signal,
    });
    if (!response || !response.ok) {
      return null;
    }
    const { text, model } = await readPlanOrChatResponseBody(
      response,
      () => undefined,
      params.language,
      'plan',
    );
    return parseAndValidatePlanText(text, {
      location: params.location,
      airQuality: params.airQuality,
      profile: params.profile,
      language: params.language,
      modelUsed: model,
    });
  } catch (err: unknown) {
    if (isAbortError(err)) {
      throw err;
    }
    return null;
  }
}

/**
 * Requests a streamed structured JSON action plan (or automatic non-streaming JSON fallback)
 * from `/api/plan`, deduplicating identical in-flight requests and caching validated plans.
 *
 * @param params - Plan generation inputs, optional progress callback, abort signal, and cache override.
 * @returns Validated four-section {@link ActionPlan} with provenance metadata.
 */
export async function generatePersonalizedPlan(params: {
  location: LocationData;
  airQuality: AirQualityReading;
  profile: LifestyleProfile;
  language: Language;
  onStreamProgress?: (partialText: string) => void;
  signal?: AbortSignal;
  bypassCache?: boolean;
}): Promise<ActionPlan> {
  const { location, airQuality, profile, language, onStreamProgress, signal, bypassCache } = params;
  const cacheKey = buildPlanCacheKey(location, airQuality.category.key, profile, language);

  if (!bypassCache) {
    const cached = planCache.get(cacheKey);
    if (cached && cached.generatedForAqi === airQuality.usAqi) {
      return cached;
    }

    const existing = inFlightPlanRequests.get(cacheKey);
    if (existing && !existing.controller.signal.aborted) {
      existing.subscribers += 1;
      if (onStreamProgress) {
        existing.progressListeners.add(onStreamProgress);
      }
      const onCallerAbort = (): void => {
        existing.subscribers = Math.max(0, existing.subscribers - 1);
        if (onStreamProgress) {
          existing.progressListeners.delete(onStreamProgress);
        }
        if (existing.subscribers === 0) {
          existing.controller.abort();
        }
      };
      if (signal?.aborted) {
        onCallerAbort();
        throw new DOMException('Aborted', 'AbortError');
      }
      signal?.addEventListener('abort', onCallerAbort, { once: true });
      try {
        return await existing.promise;
      } finally {
        signal?.removeEventListener('abort', onCallerAbort);
      }
    }
  }

  consumeClientRateLimit(language, 'plan');
  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS * 4, signal);
  const progressListeners = new Set<(partialText: string) => void>();
  if (onStreamProgress) {
    progressListeners.add(onStreamProgress);
  }

  const executeFetch = async (): Promise<ActionPlan> => {
    try {
      const response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, airQuality, profile, language }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await extractHttpErrorMessage(response, language, 'plan'));
      }

      const { text: rawJsonText, model } = await readPlanOrChatResponseBody(
        response,
        (acc) => {
          for (const listener of progressListeners) {
            listener(acc);
          }
        },
        language,
        'plan',
      );

      let validPlan = parseAndValidatePlanText(rawJsonText, {
        location,
        airQuality,
        profile,
        language,
        modelUsed: model,
      });

      if (!validPlan && rawJsonText.trim()) {
        validPlan = await attemptPlanJsonRepair({
          malformedText: rawJsonText,
          location,
          airQuality,
          profile,
          language,
          signal: controller.signal,
        });
      }

      if (!validPlan) {
        throw new Error(
          language === 'hi'
            ? 'AI प्रतिक्रिया अधूरी या अमान्य थी। कृपया पुनः प्रयास करें।'
            : 'The AI response was incomplete or malformed. Please retry.',
        );
      }

      planCache.set(cacheKey, validPlan);
      return validPlan;
    } finally {
      inFlightPlanRequests.delete(cacheKey);
      cleanup();
    }
  };

  const promise = executeFetch();
  if (!bypassCache) {
    inFlightPlanRequests.set(cacheKey, {
      promise,
      controller,
      subscribers: 1,
      progressListeners,
    });
  }
  return promise;
}

/**
 * Streams a scoped follow-up chat response (or automatic non-streaming JSON fallback)
 * from `/api/chat`.
 *
 * @param params - Sanitized user question, bounded history, active AQI context, language, and stream callback.
 * @returns Full completed assistant reply text.
 */
export async function streamFollowUpChat(params: {
  message: string;
  history: readonly ChatMessage[];
  context: {
    locationName: string;
    usAqi: number;
    categoryLabel: string;
    planSummary?: string;
  };
  language: Language;
  onToken: (fullText: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  consumeClientRateLimit(params.language, 'chat');
  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS * 4, params.signal);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: params.message,
        history: params.history,
        context: params.context,
        language: params.language,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await extractHttpErrorMessage(response, params.language, 'chat'));
    }

    const { text } = await readPlanOrChatResponseBody(
      response,
      params.onToken,
      params.language,
      'chat',
    );
    return text;
  } finally {
    cleanup();
  }
}
