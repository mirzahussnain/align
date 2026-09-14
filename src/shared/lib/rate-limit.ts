import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

/**
 * Shared rate limiter factory using Upstash Redis sliding window.
 * All limiters are pre-configured per route tier based on compute cost.
 *
 * Requires env vars (add to .env.local and Vercel):
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 *
 * When credentials are absent (local dev without Upstash), rate limiting
 * is silently skipped — the app continues to function normally.
 */

const isConfigured =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) &&
  Boolean(process.env.UPSTASH_REDIS_REST_TOKEN);

const redis = isConfigured ? Redis.fromEnv() : null;

const createRateLimiter = (requests: number, window: `${number} s` | `${number} m` | `${number} h`) =>
  redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window),
        analytics: false,
      })
    : null;

// 🔴 Expensive AI compute — strict limits
export const analysisLimiter = createRateLimiter(5, '1 m');  // 5 analyses per minute
export const rewriteLimiter  = createRateLimiter(3, '1 m');  // 3 rewrites per minute
export const publicAtsLimiter = createRateLimiter(3, '24 h'); // network-level anonymous abuse guard

// 🟡 Billing — user-initiated checkout/portal actions (webhooks are NOT limited)
export const billingLimiter  = createRateLimiter(10, '1 m'); // 10 billing actions per minute

// 🟡 Data fetching — relaxed limits
export const jobsLimiter     = createRateLimiter(30, '1 m'); // 30 job fetches per minute
export const sponsorsLimiter = createRateLimiter(20, '1 m'); // 20 sponsor lookups per minute
export const trendsLimiter   = createRateLimiter(10, '1 m'); // 10 trend lookups per minute

/**
 * Apply rate limiting to a Next.js route handler.
 * Returns a 429 NextResponse if the limit is exceeded.
 * Returns null if the request is allowed OR if Upstash is not configured.
 *
 * @param limiter - The Ratelimit instance (or null if unconfigured)
 * @param identifier - Unique identifier for the request (e.g. IP address)
 */
export async function applyRateLimit(
  limiter: Ratelimit | null,
  identifier: string
): Promise<NextResponse | null> {
  // If Upstash is not configured, skip rate limiting silently
  if (!limiter) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Request protection is temporarily unavailable.', code: 'RATE_LIMIT_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (!isConfigured) {
      console.warn('[rate-limit] Upstash not configured. Rate limiting is disabled. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable.');
    }
    return null;
  }

  const { success, limit, remaining, reset } = await limiter.limit(identifier);

  if (!success) {
    return NextResponse.json(
      {
        error: 'Too many requests. Please slow down.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((reset - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    );
  }
  return null;
}
