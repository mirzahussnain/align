import 'server-only';

import type { Redis } from '@upstash/redis';
import type { BetterAuthRateLimitStorage, RateLimit } from 'better-auth';

import { getRateLimitRedis } from './rate-limit';

const KEY_PREFIX = 'align:better-auth:rate-limit:';
const LEGACY_PREFIX = 'align:better-auth:rate-limit-state:';
const LEGACY_TTL_SECONDS = 60;

const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { count, ttl }
`;

export function createBetterAuthRateLimitStorage(
  redis: Redis | null = getRateLimitRedis()
): BetterAuthRateLimitStorage | undefined {
  if (!redis) return undefined;

  return {
    get: (key) => redis.get<RateLimit>(`${LEGACY_PREFIX}${key}`),
    set: async (key, value) => {
      await redis.set(`${LEGACY_PREFIX}${key}`, value, { ex: LEGACY_TTL_SECONDS });
    },
    consume: async (key, rule) => {
      const [count, ttl] = await redis.eval<[string], [number, number]>(
        CONSUME_SCRIPT,
        [`${KEY_PREFIX}${key}`],
        [String(rule.window)]
      );
      return count <= rule.max
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: ttl > 0 ? ttl : rule.window };
    },
  };
}

export const BETTER_AUTH_RATE_LIMIT_RULES = {
  '/sign-up/email': { window: 60, max: 5 },
  '/send-verification-email': { window: 60, max: 3 },
  '/request-password-reset': { window: 60, max: 3 },
  '/reset-password': { window: 60, max: 5 },
  '/change-password': { window: 60, max: 5 },
  '/list-sessions': { window: 60, max: 20 },
  '/revoke-session': { window: 60, max: 10 },
  '/revoke-other-sessions': { window: 60, max: 5 },
  '/delete-user': { window: 60, max: 3 },
} as const;
