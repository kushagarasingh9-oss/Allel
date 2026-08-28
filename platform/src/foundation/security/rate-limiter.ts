/**
 * In-memory sliding window rate limiter.
 *
 * Uses a Map of timestamp arrays per key. Entries older than the window
 * are pruned on every check, and the entire key is evicted once all its
 * timestamps have expired — so the Map never grows unbounded.
 */

import { NextResponse } from 'next/server'

type RateLimitEntry = {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

// Periodic cleanup interval (every 60 seconds)
const CLEANUP_INTERVAL_MS = 60_000
let lastCleanup = Date.now()

function pruneStore(now: number, maxWindowMs: number) {
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < maxWindowMs)
    if (entry.timestamps.length === 0) {
      store.delete(key)
    }
  }
  lastCleanup = now
}

export type RateLimitOptions = {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number
  /** Window duration in milliseconds. */
  windowMs: number
}

export type RateLimitResult = {
  /** Whether the request is allowed. */
  allowed: boolean
  /** Remaining requests in the current window. */
  remaining: number
  /** Milliseconds until the caller may retry (0 when allowed). */
  retryAfterMs: number
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * Uses a sliding window algorithm: only timestamps within the last
 * `windowMs` milliseconds count toward the limit.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  const { maxRequests, windowMs } = options
  const now = Date.now()

  // Periodic full-store cleanup to prevent memory leaks
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    pruneStore(now, windowMs)
  }

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Prune timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs)

  if (entry.timestamps.length >= maxRequests) {
    // Oldest relevant timestamp determines when the window slides enough
    const oldestInWindow = entry.timestamps[0]
    const retryAfterMs = oldestInWindow + windowMs - now

    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(retryAfterMs, 0),
    }
  }

  // Record this request
  entry.timestamps.push(now)

  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  }
}

/**
 * Build a standard 429 Too Many Requests response.
 */
export function rateLimitResponse(retryAfterMs: number): NextResponse {
  const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Retry-After-Ms': String(retryAfterMs),
      },
    }
  )
}
