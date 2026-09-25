import 'server-only';

import { prisma } from '@/shared/lib/prisma';
import { getRateLimitRedis } from '@/shared/lib/rate-limit';
import { RedisCacheStore } from '@/shared/lib/cache/redis-cache-store';
import { checkObjectStorageReachability } from '@/shared/lib/storage-health';
import { requireAdminDataAccess } from './authorization';

export type SystemHealthStatus = 'reachable' | 'configured' | 'unavailable';

export interface SystemHealthProbes {
  database(): Promise<boolean>;
  upstashRest(): Promise<boolean>;
  redisTcp(): Promise<boolean>;
  r2(): Promise<boolean>;
}

export interface SystemHealthSnapshot {
  checkedAt: Date;
  services: Array<{
    name: string;
    status: SystemHealthStatus;
    detail: string;
  }>;
}

const HEALTH_TIMEOUT_MS = 1_500;
const HEALTH_CACHE_MS = 60_000;

function configured(
  environment: Readonly<Record<string, string | undefined>>,
  names: string[]
): boolean {
  return names.every((name) => Boolean(environment[name]?.trim()));
}

async function withTimeout(work: Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const defaultProbes: SystemHealthProbes = {
  async database() {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  },
  async upstashRest() {
    const redis = getRateLimitRedis();
    if (!redis) return false;
    return (await redis.ping()) === 'PONG';
  },
  async redisTcp() {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return false;
    const store = new RedisCacheStore({ url, commandTimeoutMs: HEALTH_TIMEOUT_MS });
    try {
      await store.get('__admin_healthcheck__');
      return true;
    } finally {
      await store.disconnect();
    }
  },
  r2: checkObjectStorageReachability,
};

async function reachability(
  name: string,
  isConfigured: boolean,
  probe: () => Promise<boolean>
): Promise<SystemHealthSnapshot['services'][number]> {
  if (!isConfigured) return { name, status: 'unavailable', detail: 'Not configured' };
  const reachable = await withTimeout(probe());
  return reachable
    ? { name, status: 'reachable', detail: 'Reachable' }
    : { name, status: 'unavailable', detail: 'Configured but unreachable' };
}

function configuration(
  name: string,
  isConfigured: boolean
): SystemHealthSnapshot['services'][number] {
  return isConfigured
    ? { name, status: 'configured', detail: 'Configured; connectivity not checked' }
    : { name, status: 'unavailable', detail: 'Not configured' };
}

export async function collectSystemHealth(input: {
  now?: Date;
  environment?: Readonly<Record<string, string | undefined>>;
  probes?: SystemHealthProbes;
} = {}): Promise<SystemHealthSnapshot> {
  const environment = input.environment ?? process.env;
  const probes = input.probes ?? defaultProbes;
  const [database, upstashRest, redisTcp, r2] = await Promise.all([
    reachability('Database', configured(environment, ['DATABASE_URL']), probes.database),
    reachability(
      'Upstash REST Redis',
      configured(environment, ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']),
      probes.upstashRest
    ),
    reachability('Redis TCP/cache', configured(environment, ['REDIS_URL']), probes.redisTcp),
    reachability(
      'R2',
      configured(environment, [
        'S3_ENDPOINT',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'S3_BUCKET_UPLOADS',
        'S3_BUCKET_REWRITES',
        'S3_BUCKET_AVATARS',
      ]),
      probes.r2
    ),
  ]);

  return {
    checkedAt: input.now ?? new Date(),
    services: [
      database,
      upstashRest,
      redisTcp,
      r2,
      configuration('Resend', configured(environment, ['RESEND_API_KEY', 'AUTH_EMAIL_FROM'])),
      configuration('Gemini', configured(environment, ['GEMINI_API_KEY'])),
      configuration('Groq', configured(environment, ['GROQ_API_KEY'])),
      configuration(
        'Stripe',
        configured(environment, [
          'STRIPE_SECRET_KEY',
          'STRIPE_WEBHOOK_SECRET',
          'STRIPE_PRO_MONTHLY_PRICE_ID',
        ])
      ),
    ],
  };
}

let cached: { expiresAt: number; snapshot: SystemHealthSnapshot } | null = null;

async function cachedSystemHealth(): Promise<SystemHealthSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.snapshot;
  const snapshot = await collectSystemHealth();
  cached = { expiresAt: now + HEALTH_CACHE_MS, snapshot };
  return snapshot;
}

export async function loadAdminSystemHealth(
  collector: () => Promise<SystemHealthSnapshot> = cachedSystemHealth
): Promise<SystemHealthSnapshot> {
  await requireAdminDataAccess('/admin');
  return collector();
}
