import {
  API_TIMEOUT_MS,
  PLAN_CACHE_TTL_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from '../constants/index.ts';
import type {
  ActionPlan,
  AirQualityReading,
  ChatMessage,
  Language,
  LifestyleProfile,
  LocationData,
} from '../types/index.ts';
import { buildPlanCacheKey, TtlCache } from '../utils/cache.ts';
import { createLinkedTimeoutController } from '../utils/network.ts';
import { SlidingWindowRateLimiter } from '../utils/rateLimiter.ts';
import { actionPlanSchema } from '../utils/validation.ts';

const planCache = new TtlCache<ActionPlan>(PLAN_CACHE_TTL_MS);
const clientRateLimiter = new SlidingWindowRateLimiter(
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
);

/**
 * Resets the client-side plan cache and sliding-window rate limiter.
 * Intended for deterministic unit and service tests.
 */
export function resetGeminiClientState(): void {
  planCache.clear();
  clientRateLimiter.reset();
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
  const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
  if (errorBody.error) {
    return errorBody.error;
  }
  if (language === 'hi') {
    const prefix = serviceType === 'plan' ? 'AI सेवा' : 'चैट सेवा';
    return `${prefix} से त्रुटि प्राप्त हुई (HTTP ${response.status})।`;
  }
  const prefix = serviceType === 'plan' ? 'AI service' : 'Chat service';
  return `${prefix} returned HTTP ${response.status}.`;
}

/**
 * Parses Server-Sent Events lines from a fetch `ReadableStream` and forwards accumulated chunks.
 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (text: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

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
        done?: boolean;
      };
      if (parsed.error) {
        if (parsed.errorType) {
          console.warn('[SafeAir Saathi] AI stream failed:', { errorType: parsed.errorType });
        }
        throw new Error(parsed.error);
      }
      if (parsed.chunk) {
        accumulated += parsed.chunk;
        onChunk(accumulated);
      }
    }
  }

  return accumulated;
}

/**
 * Requests a streamed structured JSON action plan from the server-side `/api/plan` endpoint.
 * Caches validated plans per `(location, AQI category, profile, language)` key.
 *
 * @param params - Plan generation inputs, optional progress callback, abort signal, and cache override.
 * @returns Validated four-section {@link ActionPlan}.
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
    if (cached) {
      return cached;
    }
  }

  consumeClientRateLimit(language, 'plan');
  const { controller, cleanup } = createLinkedTimeoutController(API_TIMEOUT_MS * 4, signal);

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

    const rawJsonText = response.body
      ? await readSseStream(response.body, (acc) => onStreamProgress?.(acc))
      : await response.text();

    const cleanedJson = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanedJson);
    } catch (parseErr: unknown) {
      throw new Error(
        language === 'hi'
          ? 'AI प्रतिक्रिया अधूरी या अमान्य थी। कृपया पुनः प्रयास करें।'
          : 'The AI response was incomplete or malformed. Please retry.',
        { cause: parseErr },
      );
    }

    const validated = actionPlanSchema.safeParse(parsedJson);
    if (!validated.success) {
      throw new Error(
        language === 'hi'
          ? 'तैयार योजना अपेक्षित प्रारूप से मेल नहीं खाती। कृपया पुनः प्रयास करें।'
          : 'The generated plan did not match the expected structure. Please retry.',
      );
    }

    const plan: ActionPlan = {
      ...validated.data,
      generatedAt: new Date().toISOString(),
      isFallback: false,
    };
    planCache.set(cacheKey, plan);
    return plan;
  } finally {
    cleanup();
  }
}

/**
 * Streams a scoped follow-up chat response from the server-side `/api/chat` endpoint.
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

    if (!response.body) {
      const text = await response.text();
      params.onToken(text);
      return text;
    }

    return await readSseStream(response.body, params.onToken);
  } finally {
    cleanup();
  }
}
