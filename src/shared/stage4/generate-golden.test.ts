import { describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { GOLDEN_CV_FIXTURES } from './fixtures';
import { generateGoldenCvArtifacts } from './generator';

describe('Stage 4 golden DOCX generation', () => {
  it('generates and validates the deterministic review matrix', async () => {
    const manifest = await generateGoldenCvArtifacts();
    expect(manifest.entries).toHaveLength(GOLDEN_CV_FIXTURES.length);
    expect(manifest.entries).toHaveLength(28);
    expect(manifest.entries.every((entry) => entry.automatedCheck.passed)).toBe(true);
  }, 120_000);
});
