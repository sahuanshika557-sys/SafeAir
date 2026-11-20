import { describe, expect, it } from 'vitest';
import { extractSafeErrorDiagnostics } from '../../src/utils/errorDiagnostics.ts';

describe('extractSafeErrorDiagnostics', () => {
  it('extracts errorType, numeric status, and message safely', () => {
    const err = Object.assign(new Error('Model gemini-2.5-flash returned HTTP 404'), {
      name: 'ApiError',
      status: 404,
    });
    const diag = extractSafeErrorDiagnostics(err);
    expect(diag.errorType).toBe('ApiError');
    expect(diag.status).toBe(404);
    expect(diag.message).toContain('HTTP 404');
  });

  it('redacts API keys, Bearer tokens, and query apiKey parameters', () => {
    const err = new Error(
      'Request failed with AIzaSyDummySecretKey1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.payload and ?apiKey=secret_val_99',
    );
    const diag = extractSafeErrorDiagnostics(err);
    expect(diag.message).not.toContain('AIzaSyDummySecretKey');
    expect(diag.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(diag.message).not.toContain('secret_val_99');
    expect(diag.message).toContain('[REDACTED]');
  });

  it('handles non-Error objects and truncates overly long messages', () => {
    const longErr = new Error('x'.repeat(500));
    expect(extractSafeErrorDiagnostics(longErr).message).toHaveLength(300);

    const unknownDiag = extractSafeErrorDiagnostics({ code: 'ECONNRESET' });
    expect(unknownDiag.errorType).toBe('UnknownError');
    expect(unknownDiag.status).toBe('ECONNRESET');
    expect(unknownDiag.message).toBe('Unknown failure');
  });
});
