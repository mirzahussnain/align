import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/shared/services/scheduled-maintenance', () => ({ runScheduledMaintenance: mocks.run }));

import { GET } from '../route';

const request = (authorization?: string) => new Request('https://align.test/api/cron/maintenance', {
  headers: authorization ? { authorization } : undefined,
});

describe('GET /api/cron/maintenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret-at-least-16-chars';
    mocks.run.mockResolvedValue({ status: 'completed', durationMs: 12, retention: {}, providers: {} });
  });

  it.each([undefined, 'Bearer wrong'])('rejects a missing or invalid cron credential', async (authorization) => {
    const response = await GET(request(authorization));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is not configured', async () => {
    delete process.env.CRON_SECRET;
    const response = await GET(request('Bearer undefined'));
    expect(response.status).toBe(401);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('returns a bounded outcome for an authenticated invocation', async () => {
    const response = await GET(request('Bearer cron-secret-at-least-16-chars'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'completed' });
    expect(mocks.run).toHaveBeenCalledOnce();
  });

  it('acknowledges a protected overlapping run without starting another', async () => {
    mocks.run.mockResolvedValue({ status: 'already_running' });
    const response = await GET(request('Bearer cron-secret-at-least-16-chars'));
    expect(response.status).toBe(202);
  });
});
