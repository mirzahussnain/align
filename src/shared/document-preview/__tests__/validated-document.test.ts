import { describe, expect, it, vi } from 'vitest';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import type { CvLayoutProfile } from '@/shared/templates/layout';
import { DocumentConversionError } from '../renderer-client';
import {
  renderValidatedDocument,
  type RenderDependencies,
} from '../validated-document';

function spec(): CvBuildSpecV2 {
  return {
    version: 4,
    generationId: 'generation-1',
    identity: { fullName: 'Alex Candidate' },
    links: [],
    sections: [
      {
        type: 'PROFILE',
        heading: 'Profile',
        lines: [{ id: 'profile-1', text: 'Evidence-backed profile text.' }],
      },
    ],
    evidenceBindings: [],
    normalizationIssues: [],
    presentation: {
      templateId: 'architect',
      density: 'BALANCED',
      targetLength: 'ONE_TO_TWO_PAGES',
    },
    provenance: {
      approvedEvidenceIds: ['evidence-1'],
      omittedEvidenceIds: [],
      sourceMode: 'JOB_MATCH',
      atsStrategy: 'STANDARD',
    },
  };
}

function dependencies(pageCounts: Partial<Record<CvLayoutProfile, number>>, finalPageOccupancy: Partial<Record<CvLayoutProfile, number>> = {}) {
  const generate = vi.fn(
    async (_spec: CvBuildSpecV2, options?: { profile?: CvLayoutProfile }) =>
      Buffer.from(`docx:${options?.profile ?? 'preferred'}`),
  );
  const convert = vi.fn(async ({ docx }: { docx: Buffer }) =>
    Buffer.from(`%PDF-${docx.toString().split(':')[1]}`),
  );
  const inspect = vi.fn(async (pdf: Buffer) => {
    const profile = pdf.toString().slice('%PDF-'.length) as CvLayoutProfile;
    return { pageCount: pageCounts[profile] ?? 3, finalPageOccupancy: finalPageOccupancy[profile] ?? 1 };
  });
  const renderPages = vi.fn(async (_pdf: Buffer, count: 1 | 2) =>
    Array.from({ length: count }, (_, index) => Buffer.from(`png:${index + 1}`)),
  );
  return {
    dependencies: {
      generate,
      convert,
      inspect,
      renderPages,
      rendererContractVersion: 'renderer-contract-test',
    } satisfies RenderDependencies,
    generate,
    convert,
    inspect,
    renderPages,
  };
}

describe('validated document layout selection', () => {
  it.each([
    [{ preferred: 1 }, 'preferred', 1, ['preferred']],
    [{ preferred: 2 }, 'preferred', 2, ['preferred']],
    [{ preferred: 3, compact: 2 }, 'compact', 2, ['preferred', 'compact']],
    [
      { preferred: 3, compact: 3, 'compact-tight': 2 },
      'compact-tight',
      2,
      ['preferred', 'compact', 'compact-tight'],
    ],
  ] as const)(
    'accepts page sequence %# without unnecessary layout attempts',
    async (pageCounts, expectedProfile, expectedPages, expectedAttempts) => {
      const fixture = dependencies(pageCounts);
      const value = spec();
      const original = structuredClone(value);

      const result = await renderValidatedDocument({
        spec: value,
        traceId: 'generation_1',
        dependencies: fixture.dependencies,
      });

      expect(result.profile).toBe(expectedProfile);
      expect(result.pageCount).toBe(expectedPages);
      expect(result.preview).toMatchObject({ status: 'READY' });
      expect(fixture.generate.mock.calls.map((call) => call[1]?.profile)).toEqual(
        expectedAttempts,
      );
      expect(value).toEqual(original);
    },
  );

  it('evaluates safe compact profiles for an underfilled second page and accepts a readable one-page result', async () => {
    const fixture = dependencies({ preferred: 2, compact: 1 }, { preferred: 0.18 });
    const result = await renderValidatedDocument({
      spec: spec(),
      traceId: 'generation_2',
      dependencies: fixture.dependencies,
    });
    expect(result.pageCount).toBe(1);
    expect(result.profile).toBe('compact');
    expect(fixture.generate).toHaveBeenCalledTimes(2);
    expect(fixture.convert).toHaveBeenCalledTimes(2);
  });

  it('retains the more readable two-page profile when tighter layouts do not reach one page', async () => {
    const fixture = dependencies(
      { preferred: 2, compact: 2, 'compact-tight': 2 },
      { preferred: 0.18, compact: 0.42, 'compact-tight': 0.5 },
    );
    const result = await renderValidatedDocument({ spec: spec(), traceId: 'generation_2b', dependencies: fixture.dependencies });
    expect(result.pageCount).toBe(2);
    expect(result.profile).toBe('preferred');
    expect(fixture.generate).toHaveBeenCalledTimes(3);
  });

  it('returns controlled page-limit failure with every observed count', async () => {
    const fixture = dependencies({
      preferred: 3,
      compact: 3,
      'compact-tight': 3,
    });
    await expect(
      renderValidatedDocument({
        spec: spec(),
        traceId: 'generation_3',
        dependencies: fixture.dependencies,
      }),
    ).rejects.toMatchObject({
      code: 'PAGE_LIMIT_EXCEEDED',
      observed: [
        { profile: 'preferred', pageCount: 3 },
        { profile: 'compact', pageCount: 3 },
        { profile: 'compact-tight', pageCount: 3 },
      ],
    });
  });

  it('preserves document conversion failures as a distinct state', async () => {
    const fixture = dependencies({ preferred: 1 });
    fixture.dependencies.convert = vi.fn(async () => {
      throw new DocumentConversionError('renderer unavailable', true, 503);
    });
    await expect(
      renderValidatedDocument({
        spec: spec(),
        traceId: 'generation_4',
        dependencies: fixture.dependencies,
      }),
    ).rejects.toMatchObject({ code: 'DOCUMENT_CONVERSION_FAILED' });
  });

  it('keeps a page-validated DOCX/PDF when thumbnail rendering fails', async () => {
    const fixture = dependencies({ preferred: 2 });
    fixture.dependencies.renderPages = vi.fn(async () => {
      throw new Error('canvas unavailable');
    });
    const result = await renderValidatedDocument({
      spec: spec(),
      traceId: 'generation_5',
      dependencies: fixture.dependencies,
    });
    expect(result.pageCount).toBe(2);
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.preview).toEqual({
      status: 'FAILED',
      failureCode: 'THUMBNAIL_RENDER_FAILED',
    });
  });

  it('hashes the accepted immutable bytes and renderer/template contracts', async () => {
    const first = dependencies({ preferred: 1 });
    const second = dependencies({ preferred: 1 });
    second.dependencies.rendererContractVersion = 'renderer-contract-next';

    const [a, b, c] = await Promise.all([
      renderValidatedDocument({
        spec: spec(),
        traceId: 'generation_hash_a',
        dependencies: first.dependencies,
      }),
      renderValidatedDocument({
        spec: spec(),
        traceId: 'generation_hash_b',
        dependencies: first.dependencies,
      }),
      renderValidatedDocument({
        spec: spec(),
        traceId: 'generation_hash_c',
        dependencies: second.dependencies,
      }),
    ]);
    expect(a.documentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(a.documentHash).toBe(b.documentHash);
    expect(c.documentHash).not.toBe(a.documentHash);
  });
});
