import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    atsAnalysis: { findFirst: vi.fn() },
    jobMatch: { findFirst: vi.fn() },
  },
}));

import { GET } from '../[id]/route';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: 'u1' } } as never);
  vi.mocked(prisma.atsAnalysis.findFirst).mockResolvedValue(null);
  vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue(null);
});

describe('legacy analysis bookmark bridge', () => {
  it('redirects an owned ATS id to the ATS resource', async () => {
    vi.mocked(prisma.atsAnalysis.findFirst).mockResolvedValue({ id: 'ats-1' } as never);
    const response = await GET(new Request('http://test/api/analyses/ats-1'), { params: Promise.resolve({ id: 'ats-1' }) });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('http://test/api/ats-analyses/ats-1');
  });

  it('redirects an owned Job Match id to the Job Match resource', async () => {
    vi.mocked(prisma.jobMatch.findFirst).mockResolvedValue({ id: 'match-1' } as never);
    const response = await GET(new Request('http://test/api/analyses/match-1'), { params: Promise.resolve({ id: 'match-1' }) });
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('http://test/api/job-matches/match-1');
  });

  it('does not reveal an unknown or unowned id', async () => {
    const response = await GET(new Request('http://test/api/analyses/other'), { params: Promise.resolve({ id: 'other' }) });
    expect(response.status).toBe(404);
  });
});
