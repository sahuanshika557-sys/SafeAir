/**
 * Structured non-secret diagnostic summary for server and service errors.
 */
export interface SafeErrorDiagnostics {
  errorType: string;
  status: string | number;
  message: string;
}

const SECRET_PATTERN = /(AIza[0-9A-Za-z_-]{10,}|Bearer\s+[0-9A-Za-z._-]+|apiKey=[^&\s]+)/gi;

/**
 * Extracts a redacted error summary (error class/name, HTTP status/code, truncated message)
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

  return {
    errorType,
    status,
    message: redacted,
  };
}
