import type { ApiErrorCategory, Language } from '../types/index.js';

/**
 * Structured non-secret diagnostic summary for server and service errors.
 */
export interface SafeErrorDiagnostics {
  errorType: string;
  status: string | number;
  message: string;
  category: ApiErrorCategory;
}

const SECRET_PATTERN = /(AIza[0-9A-Za-z_-]{10,}|Bearer\s+[0-9A-Za-z._-]+|apiKey=[^&\s]+)/gi;

/**
 * Classifies an unknown upstream or network error into a standard {@link ApiErrorCategory}
 * with an appropriate HTTP status code and retryability flag.
 *
 * @param err - Caught unknown error value.
 * @returns Classification result (`category`, `httpStatus`, and `retryable`).
 */
export function classifyUpstreamError(err: unknown): {
  category: ApiErrorCategory;
  httpStatus: number;
  retryable: boolean;
} {
  const diag = extractSafeErrorDiagnostics(err);
  return {
    category: diag.category,
    httpStatus: mapCategoryToHttpStatus(diag.category),
    retryable:
      diag.category === 'quota_exceeded' ||
      diag.category === 'model_unavailable' ||
      diag.category === 'timeout' ||
      diag.category === 'upstream_error',
  };
}

function mapCategoryToHttpStatus(category: ApiErrorCategory): number {
  switch (category) {
    case 'missing_key':
      return 503;
    case 'invalid_key':
      return 502;
    case 'quota_exceeded':
      return 429;
    case 'model_unavailable':
      return 503;
    case 'timeout':
      return 504;
    case 'bad_request':
      return 400;
    case 'upstream_error':
    default:
      return 502;
  }
}

function determineCategory(
  errorType: string,
  status: string | number,
  lowerMsg: string,
): ApiErrorCategory {
  if (
    errorType === 'AbortError' ||
    status === 504 ||
    status === 'ETIMEDOUT' ||
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('deadline_exceeded')
  ) {
    return 'timeout';
  }
  if (
    status === 401 ||
    lowerMsg.includes('api_key_invalid') ||
    lowerMsg.includes('api key not valid') ||
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('api key expired') ||
    lowerMsg.includes('unauthenticated') ||
    lowerMsg.includes('unauthorized')
  ) {
    return 'invalid_key';
  }
  if (
    status === 429 ||
    lowerMsg.includes('resource_exhausted') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('rate limit')
  ) {
    return 'quota_exceeded';
  }
  if (
    status === 404 ||
    status === 503 ||
    lowerMsg.includes('not_found') ||
    lowerMsg.includes('model_not_found') ||
    lowerMsg.includes('not found') ||
    lowerMsg.includes('unavailable') ||
    lowerMsg.includes('overloaded') ||
    (lowerMsg.includes('model') &&
      (lowerMsg.includes('permission') ||
        lowerMsg.includes('access') ||
        lowerMsg.includes('allowed') ||
        lowerMsg.includes('enabled') ||
        lowerMsg.includes('supported')))
  ) {
    return 'model_unavailable';
  }
  if (
    status === 403 ||
    lowerMsg.includes('permission_denied') ||
    lowerMsg.includes('permission') ||
    lowerMsg.includes('access denied') ||
    lowerMsg.includes('forbidden')
  ) {
    return 'invalid_key';
  }
  if (status === 400 || lowerMsg.includes('invalid_argument') || lowerMsg.includes('bad request')) {
    return 'bad_request';
  }
  return 'upstream_error';
}

/**
 * Determines whether an `invalid_key` error is a definitive API key/authentication rejection
 * (affecting every model) rather than a model-scoped permission/access error.
 *
 * @param err - Caught unknown error value.
 * @returns `true` if retrying backup models cannot succeed due to invalid/expired credentials.
 */
export function isDefinitiveKeyFailure(err: unknown): boolean {
  const diag = extractSafeErrorDiagnostics(err);
  if (diag.category !== 'invalid_key') {
    return false;
  }
  const lowerMsg = diag.message.toLowerCase();
  return (
    diag.status === 401 ||
    lowerMsg.includes('api_key_invalid') ||
    lowerMsg.includes('api key not valid') ||
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('api key expired') ||
    lowerMsg.includes('unauthenticated') ||
    lowerMsg.includes('unauthorized')
  );
}

/**
 * Extracts a redacted error summary (error class/name, HTTP status/code, category, truncated message)
 * guaranteed never to expose API keys or bearer tokens.
 *
 * @param err - Caught unknown error value.
 * @returns Sanitized {@link SafeErrorDiagnostics} summary safe for logs and telemetry.
 */
export function extractSafeErrorDiagnostics(err: unknown): SafeErrorDiagnostics {
  const errObj = err as { name?: unknown; status?: unknown; code?: unknown } | null;
  const errorType =
    typeof errObj?.name === 'string' && errObj.name.trim() ? errObj.name : 'UnknownError';
  const rawStatus = errObj?.status ?? errObj?.code;
  const status =
    typeof rawStatus === 'number' || typeof rawStatus === 'string' ? rawStatus : 'unknown';

  const rawMessage = err instanceof Error ? err.message : 'Unknown failure';
  const redacted = rawMessage.replace(SECRET_PATTERN, '[REDACTED]').slice(0, 300);
  const category = determineCategory(errorType, status, redacted.toLowerCase());

  return {
    errorType,
    status,
    message: redacted,
    category,
  };
}

/**
 * Maps an {@link ApiErrorCategory} to a friendly, localized user-facing message
 * distinguishing invalid credentials, quota limits, and unavailable models
 * without exposing raw HTTP status codes or internal diagnostics.
 *
 * @param category - Classified error category.
 * @param language - Target UI language (`'en'` or `'hi'`).
 * @param context - Whether the error occurred during plan generation or chat.
 * @returns Friendly localized message.
 */
export function getLocalizedApiErrorMessage(
  category: ApiErrorCategory,
  language: Language,
  context: 'plan' | 'chat',
): string {
  const suffixEn = context === 'plan' ? ' Showing rule-based guidance instead.' : '';
  const suffixHi =
    context === 'plan' ? ' इसके बजाय नियम-आधारित सुरक्षा मार्गदर्शन दिखाया जा रहा है।' : '';

  if (language === 'hi') {
    switch (category) {
      case 'missing_key':
        return `सर्वर पर एआई सेवा कॉन्फ़िगर नहीं है।${suffixHi}`;
      case 'invalid_key':
        return `एआई सेवा की एपीआई कुंजी अमान्य है या अस्वीकृत कर दी गई है। कृपया सर्वर कुंजी कॉन्फ़िगरेशन जांचें।${suffixHi}`;
      case 'quota_exceeded':
        return `एआई सेवा की उपयोग सीमा (कोटा) अभी समाप्त हो गई है। कृपया एक मिनट में पुनः प्रयास करें।${suffixHi}`;
      case 'model_unavailable':
        return `कॉन्फ़िगर किया गया एआई मॉडल अभी उपलब्ध या सुलभ नहीं है। कृपया कुछ क्षण बाद पुनः प्रयास करें।${suffixHi}`;
      case 'timeout':
        return `एआई सेवा से उत्तर मिलने में बहुत समय लगा। कृपया पुनः प्रयास करें।${suffixHi}`;
      case 'bad_request':
        return `अनुरोध डेटा अमान्य था। कृपया अपनी जानकारी जांचकर पुनः प्रयास करें।${suffixHi}`;
      case 'upstream_error':
      default:
        return `एआई सेवा अभी अस्थायी रूप से उपलब्ध नहीं है। कृपया थोड़ी देर बाद पुनः प्रयास करें।${suffixHi}`;
    }
  }

  switch (category) {
    case 'missing_key':
      return `The AI service is not configured on the server.${suffixEn}`;
    case 'invalid_key':
      return `The server AI API key is invalid or rejected. Please verify the API key configuration.${suffixEn}`;
    case 'quota_exceeded':
      return `The AI quota or rate limit has been reached. Please retry in a minute.${suffixEn}`;
    case 'model_unavailable':
      return `The AI model is unavailable or not accessible for this key. Please retry shortly.${suffixEn}`;
    case 'timeout':
      return `The AI service took too long to respond. Please retry.${suffixEn}`;
    case 'bad_request':
      return `The request could not be processed. Please review your details and retry.${suffixEn}`;
    case 'upstream_error':
    default:
      return `The AI service is temporarily unreachable. Please retry in a moment.${suffixEn}`;
  }
}
