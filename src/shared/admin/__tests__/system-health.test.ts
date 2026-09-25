import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireAdminDataAccess: vi.fn() }));

vi.mock('../authorization', () => ({
  requireAdminDataAccess: mocks.requireAdminDataAccess,
}));

import {
  collectSystemHealth,
  loadAdminSystemHealth,
  type SystemHealthProbes,
} from '../system-health';

const NOW = new Date('2026-09-25T12:00:00.000Z');

function probes(overrides: Partial<SystemHealthProbes> = {}): SystemHealthProbes {
  return {
    database: vi.fn(async () => true),
    upstashRest: vi.fn(async () => true),
    redisTcp: vi.fn(async () => true),
    r2: vi.fn(async () => true),
    ...overrides,
  };
}

describe('admin system health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminDataAccess.mockResolvedValue({ user: { id: 'admin-1' } });
  });

  it('distinguishes reachable services from configuration-only providers', async () => {
    const result = await collectSystemHealth({
      now: NOW,
      environment: {
        DATABASE_URL: 'postgres://secret',
        UPSTASH_REDIS_REST_URL: 'https://secret-upstash',
        UPSTASH_REDIS_REST_TOKEN: 'secret-token',
        REDIS_URL: 'redis://:secret@cache',
        S3_ENDPOINT: 'https://secret-r2',
        S3_ACCESS_KEY_ID: 'secret-id',
        S3_SECRET_ACCESS_KEY: 'secret-key',
        S3_BUCKET_UPLOADS: 'secret-bucket',
        S3_BUCKET_REWRITES: 'secret-rewrites',
        S3_BUCKET_AVATARS: 'secret-avatars',
        RESEND_API_KEY: 'secret-resend',
        AUTH_EMAIL_FROM: 'support@example.com',
        GEMINI_API_KEY: 'secret-gemini',
        STRIPE_SECRET_KEY: 'secret-stripe',
        STRIPE_WEBHOOK_SECRET: 'secret-webhook',
        STRIPE_PRO_MONTHLY_PRICE_ID: 'secret-price',
      },
      probes: probes(),
    });

    expect(result.checkedAt).toEqual(NOW);
    expect(result.services).toEqual([
      { name: 'Database', status: 'reachable', detail: 'Reachable' },
      { name: 'Upstash REST Redis', status: 'reachable', detail: 'Reachable' },
      { name: 'Redis TCP/cache', status: 'reachable', detail: 'Reachable' },
      { name: 'R2', status: 'reachable', detail: 'Reachable' },
      { name: 'Resend', status: 'configured', detail: 'Configured; connectivity not checked' },
      { name: 'Gemini', status: 'configured', detail: 'Configured; connectivity not checked' },
      { name: 'Groq', status: 'unavailable', detail: 'Not configured' },
      { name: 'Stripe', status: 'configured', detail: 'Configured; connectivity not checked' },
    ]);
  });

  it('returns only safe generic output when a reachability probe fails', async () => {
    const result = await collectSystemHealth({
      now: NOW,
      environment: {
        DATABASE_URL: 'postgres://user:password@private-host/db',
        UPSTASH_REDIS_REST_URL: 'https://private-host',
        UPSTASH_REDIS_REST_TOKEN: 'top-secret',
      },
      probes: probes({
        database: vi.fn(async () => {
          throw new Error('postgres://user:password@private-host/db refused');
        }),
        upstashRest: vi.fn(async () => false),
      }),
    });

    expect(result.services[0]).toEqual({
      name: 'Database',
      status: 'unavailable',
      detail: 'Configured but unreachable',
    });
    expect(JSON.stringify(result)).not.toMatch(/password|private-host|top-secret/i);
  });

  it('authorizes before collecting a health snapshot', async () => {
    const collector = vi.fn();
    mocks.requireAdminDataAccess.mockRejectedValue(new Error('ADMIN_FORBIDDEN'));

    await expect(loadAdminSystemHealth(collector)).rejects.toThrow('ADMIN_FORBIDDEN');
    expect(collector).not.toHaveBeenCalled();
  });
});
