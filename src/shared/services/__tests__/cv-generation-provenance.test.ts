import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/prisma', () => ({
  prisma: {
    generatedCV: {
      aggregate: vi.fn(async () => ({ _max: { versionNumber: null } })),
      create: vi.fn(async () => ({ id: 'cv-1' })),
      update: vi.fn(async () => ({})),
    },
  },
}));
vi.mock('@/shared/lib/storage', () => ({
  storage: { upload: vi.fn(async () => {}) },
  keyFor: { rewrite: vi.fn(() => 'user/cv-1/Tailored_CV.docx') },
}));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { prisma } from '@/shared/lib/prisma';
import { persistAndArchiveCv } from '@/shared/services/cv-generation';

beforeEach(() => vi.clearAllMocks());

describe('generated CV evidence provenance', () => {
  it('persists the approved evidence snapshot separately from rendered CV data', async () => {
    const approvedProfileEvidence = [
      {
        requirementId: 'requirement-001',
        evidenceRef: { type: 'certification', id: 'cert-1' },
        requirementText: 'Care Certificate',
        sourceProfileId: 'profile-1',
        resolvedEvidenceText: 'Care Certificate — Skills for Care — 2025',
        evidenceLocation: 'Care Certificate — Certification or licence',
        userApproved: true,
        rationale: 'Directly supports the named credential.',
      },
    ];

    await persistAndArchiveCv({
      userId: 'user-1',
      data: { fullName: 'A Candidate' } as never,
      templateId: 'architect',
      fileName: 'Tailored_CV.docx',
      docxBuffer: Buffer.from('docx'),
      jobMatchId: 'analysis-1',
      profileId: 'profile-1',
      provenance: { approvedProfileEvidence },
    });

    const createData = vi.mocked(prisma.generatedCV.create).mock.calls[0][0].data;
    expect(createData.data).toEqual({ fullName: 'A Candidate' });
    expect(createData.provenance).toEqual({ approvedProfileEvidence });
    expect(createData.provenance).not.toBe(createData.data);
  });
});
