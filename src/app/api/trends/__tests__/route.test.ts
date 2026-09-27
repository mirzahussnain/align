import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), limit: vi.fn() }));
vi.mock('@/shared/services/career-market', () => ({ resolveCareerMarketSnapshot: mocks.resolve }));
vi.mock('@/shared/lib/rate-limit', () => ({ trendsLimiter: {}, applyRateLimit: mocks.limit }));

import { GET } from '../route';

describe('GET /api/trends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue(null);
    mocks.resolve.mockResolvedValue({ freshness: 'FRESH', snapshot: { id: 'market-1', sampleSize: 24 } });
  });

  it('requires a role instead of silently serving a hardcoded technology sample', async () => {
    const response = await GET(new Request('https://align.test/api/trends') as never);
    expect(response.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns a labelled snapshot for the requested role and location', async () => {
    const response = await GET(new Request('https://align.test/api/trends?role=Registered%20Nurse&location=Leeds') as never);
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith({ role: 'Registered Nurse', location: 'Leeds' });
    await expect(response.json()).resolves.toMatchObject({
      freshness: 'FRESH',
      snapshot: { id: 'market-1' },
      methodology: { scope: 'BOUNDED_SAMPLE' },
    });
  });

  it('reports a duplicate in-flight generation without inventing market data', async () => {
    mocks.resolve.mockResolvedValue({ freshness: 'PENDING', snapshot: null });
    const response = await GET(new Request('https://align.test/api/trends?role=Analyst&location=UK') as never);
    expect(response.status).toBe(202);
  });
});
