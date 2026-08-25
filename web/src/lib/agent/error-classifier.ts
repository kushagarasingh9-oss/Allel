/**
 * Server-side model/provider failure classification.
 *
 * One classifier, two consumers:
 *  - `classifyAndSanitizeServerError` turns a failure into a founder-readable
 *    message, guaranteeing no vendor URLs, request IDs, or raw trace text reach
 *    the client.
 *  - `classifyModelFailure` decides whether the turn is worth another attempt.
 *
 * Both must agree on what a failure *is*, so the matching rules live in exactly
 * one place (`classifyModelFailureClass`). Adding a class means adding it here
 * and in both maps below — the compiler enforces that via `Record<...>`.
 */

export type ModelFailureClass =
  | 'rate_limit'
  | 'transient_upstream'
  | 'auth_config'
  | 'context_limit'
  | 'content_filter'
  | 'unknown'

/**
 * What to do about a failure.
 * - `retry`    transient; the identical request may succeed on another attempt.
 * - `fallback` the primary model/deployment is refusing work it would normally
 *              accept (quota). Retrying the same target hammers it; a different
 *              model is the useful move.
 * - `surface`  deterministic. Retrying cannot change the outcome.
 */
export type ModelFailureRecovery = 'retry' | 'fallback' | 'surface'

const FAILURE_MATCHERS: ReadonlyArray<{ failureClass: ModelFailureClass; markers: readonly string[] }> = [
  {
    failureClass: 'rate_limit',
    markers: [
      'rate_limit',
      'rate limit',
      '429',
      'tpm',
      'rpm',
      'quota',
      'provisioned throughput',
      'peak load',
      'high demand',
      'exceeds the maximum usage size',
    ],
  },
  {
    failureClass: 'transient_upstream',
    markers: [
      '500',
      '502',
      '503',
      '504',
      'overloaded',
      'timeout',
      'timed out',
      'etimedout',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'fetch failed',
      'service_unavailable',
      'service unavailable',
      'bad gateway',
      'azure support request',
      'an error processing your request',
      'the server had an error processing your request',
    ],
  },
  {
    failureClass: 'auth_config',
    markers: [
      '401',
      '403',
      'invalid_api_key',
      'invalid api key',
      'unauthorized',
      'permission denied',
      'deploymentnotfound',
      'model_not_found',
      'not configured',
    ],
  },
  {
    failureClass: 'context_limit',
    markers: ['context_length', 'maximum context length', 'token limit', 'too many tokens'],
  },
  {
    failureClass: 'content_filter',
    markers: ['content_filter', 'content filter', 'policy_violation', 'flagged', 'responsibleai'],
  },
]

const FOUNDER_MESSAGES: Record<ModelFailureClass, string> = {
  rate_limit:
    'OpenAI API rate limit reached. Please wait a few moments before trying again or check your OpenAI plan quota.',
  transient_upstream:
    'The AI model service is temporarily unavailable. Please try your request again in a few moments.',
  auth_config:
    'AI model authentication or configuration issue. Please check your API key settings.',
  context_limit:
    'The request exceeded the maximum conversation context limit. Try starting a fresh thread or asking a more focused question.',
  content_filter: 'The request could not be processed due to content safety policies.',
  unknown: 'The agent encountered an unexpected issue while processing your request. Please try again.',
}

const RECOVERY_BY_CLASS: Record<ModelFailureClass, ModelFailureRecovery> = {
  rate_limit: 'fallback',
  transient_upstream: 'retry',
  auth_config: 'surface',
  context_limit: 'surface',
  content_filter: 'surface',
  // An unclassified failure gets exactly one alternative attempt rather than
  // being retried blindly against the same target.
  unknown: 'fallback',
}

function extractErrorText(error: unknown): string {
  if (error instanceof Error) {
    // Provider SDKs frequently nest the useful status on a `cause`.
    const cause = (error as { cause?: unknown }).cause
    const causeText =
      cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
    const statusText = String((error as { status?: unknown }).status ?? '')
    return [error.name, error.message, statusText, causeText].filter(Boolean).join(' ')
  }
  return String(error ?? '')
}

/** The single source of truth for what kind of failure this is. */
export function classifyModelFailureClass(error: unknown): ModelFailureClass {
  const haystack = extractErrorText(error).toLowerCase()
  if (!haystack) return 'unknown'

  for (const { failureClass, markers } of FAILURE_MATCHERS) {
    if (markers.some((marker) => haystack.includes(marker))) {
      return failureClass
    }
  }

  return 'unknown'
}

/**
 * Whether another attempt is worth making, and against which target.
 * Pure — safe to unit test without a model call.
 */
export function classifyModelFailure(error: unknown): ModelFailureRecovery {
  return RECOVERY_BY_CLASS[classifyModelFailureClass(error)]
}

/**
 * True when the turn should be re-attempted on the configured fallback model.
 * `retry` qualifies too: the SDK has already exhausted its own retries against
 * the primary by the time we see the error.
 */
export function isFallbackEligibleFailure(error: unknown): boolean {
  const recovery = classifyModelFailure(error)
  return recovery === 'retry' || recovery === 'fallback'
}

/**
 * Founder-readable message for a failure. Never includes vendor URLs, request
 * IDs, or raw provider text — those belong in server logs only.
 */
export function classifyAndSanitizeServerError(error: unknown): string {
  return FOUNDER_MESSAGES[classifyModelFailureClass(error)]
}
