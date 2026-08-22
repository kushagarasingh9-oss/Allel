import { RECOVERY_CONFIG } from '../recovery/config';

export function isRetryableError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || (error as any)?.status || '';

  // Network timeouts, 429 rate limits, 5xx server errors are retryable
  if (/429|rate limit|timeout|socket hang up|econnreset|econnrefused|500|502|503|504/i.test(msg)) {
    return true;
  }
  if (code === 429 || (typeof code === 'number' && code >= 500 && code < 600)) {
    return true;
  }

  // Schema errors, invalid tokens, 400 bad requests, 401 unauth, 403 forbidden are NOT retryable
  if (/400|401|403|unauthorized|forbidden|invalid schema|zod/i.test(msg)) {
    return false;
  }

  return false;
}

export function computeNextAttemptTime(attemptCount: number, baseMs: number = RECOVERY_CONFIG.JOB_BACKOFF_BASE_MS): string {
  const multiplier = Math.pow(RECOVERY_CONFIG.JOB_BACKOFF_MULTIPLIER, attemptCount - 1);
  const delayMs = Math.min(baseMs * multiplier, RECOVERY_CONFIG.JOB_BACKOFF_MAX_MS);
  return new Date(Date.now() + delayMs).toISOString();
}
