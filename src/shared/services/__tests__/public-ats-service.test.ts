import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { anonymousAtsResult: { findUnique: vi.fn() } },
}));

import { prisma } from '@/shared/lib/prisma';
import { getPublicAtsDemo, projectPublicAtsPreview, publicAtsClientIp, publicAtsIdentifier } from '../public-ats-service';

describe('public ATS demo privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET = 'test-secret';
  });

  it('stores only a stable keyed hash for a client IP', () => {
    const hash = publicAtsIdentifier('203.0.113.10');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('203.0.113.10');
    expect(publicAtsIdentifier('203.0.113.10')).toBe(hash);
  });

  it('uses the trusted proxy header precedence and extracts the first forwarded IP', () => {
    expect(publicAtsClientIp(new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.2' }))).toBe('203.0.113.10');
    expect(publicAtsClientIp(new Headers({ 'cf-connecting-ip': '198.51.100.4', 'x-real-ip': '10.0.0.3' }))).toBe('198.51.100.4');
  });

  it('fails closed for an expired token even when result data still exists', async () => {
    vi.mocked(prisma.anonymousAtsResult.findUnique).mockResolvedValue({
      status: 'READY',
      expiresAt: new Date(Date.now() - 1_000),
      resultJson: { overallScore: 72 },
    } as never);
    await expect(getPublicAtsDemo('opaque-token')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('projects a dedicated anonymous preview without raw CV or full-report payloads', () => {
    const preview = projectPublicAtsPreview({
      overallScore: 68,
      rawText: 'private raw CV text',
      pageCount: 1,
      categories: [
        { id: 'formatting', label: 'Formatting', score: 8, maxScore: 10, status: 'good', details: 'Full internal detail' },
        { id: 'sections', label: 'Sections', score: 6, maxScore: 10, status: 'needs-improvement', details: 'Full internal detail' },
      ],
      recommendations: [{ priority: 'high', title: 'Add measurable outcomes', description: 'Full recommendation detail', timeEstimate: '10 min' }],
      keywords: { present: [], missing: [], categoryBreakdown: [] },
      sectionOrder: { currentOrder: [], recommendedOrder: [], isOptimal: true, suggestions: [] },
      formatting: { fontConsistency: true, fontCount: 1, hasImages: false, hasSpecialCharacters: false, pageCount: 1, estimatedReadTime: '1 min', issues: [] },
      compliance: [],
    });

    expect(preview.viewerMode).toBe('anonymous_demo');
    expect(preview.weaknesses).toEqual(['Add measurable outcomes']);
    expect(preview).not.toHaveProperty('rawText');
    expect(preview).not.toHaveProperty('recommendations');
    expect(JSON.stringify(preview)).not.toContain('private raw CV text');
    expect(JSON.stringify(preview)).not.toContain('Full recommendation detail');
  });
});
