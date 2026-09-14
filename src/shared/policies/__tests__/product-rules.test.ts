import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_LIMITS,
  REGENERATION_CONTEXT_LIMITS,
  RETENTION_POLICY,
  UPLOAD_POLICY,
} from '@/shared/policies';

describe('analysis policy', () => {
  it('preserves analysis input and evidence ceilings', () => {
    expect(ANALYSIS_LIMITS).toEqual({
      maxCvCharacters: 120_000,
      maxJobDescriptionCharacters: 50_000,
      maxProfileSnapshotBytes: 250_000,
      maxEvidenceItems: 250,
      maxCustomNoteCharacters: 2_000,
    });
  });

  it('preserves regeneration context ceilings', () => {
    expect(REGENERATION_CONTEXT_LIMITS).toEqual({
      maxHitlEntries: 20,
      maxHitlKeyCharacters: 120,
      maxHitlValueCharacters: 2_000,
      maxHitlBytes: 40_000,
      maxApprovedItems: 100,
      maxApplicationIds: 100,
      maxIdentifierCharacters: 128,
      maxTotalBytes: 65_536,
    });
  });
});

describe('upload policy', () => {
  it('preserves supported CV formats and upload ceilings', () => {
    expect(UPLOAD_POLICY.cv).toEqual({
      formats: ['pdf', 'docx'],
      maxBytes: 10 * 1024 * 1024,
      maxDirectMultipartBytes: 4 * 1024 * 1024,
      mimeTypes: {
        pdf: ['application/pdf'],
        docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      },
      canonicalMimeTypes: {
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      extensions: { pdf: '.pdf', docx: '.docx' },
      acceptedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      fileInputAccept: '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(UPLOAD_POLICY.cv.maxBytes).toBe(10 * 1024 * 1024);
    expect(UPLOAD_POLICY.avatar.maxBytes).toBe(5 * 1024 * 1024);
  });
});

describe('retention policy', () => {
  it('preserves temporary-data and upload-intent lifetimes', () => {
    expect(RETENTION_POLICY).toEqual({
      anonymousDemoHours: 24,
      staleJobDays: 45,
      abandonedRequestMinutes: 30,
      uploadIntent: {
        pendingMinutes: 5,
        validatingMinutes: 10,
      },
    });
  });
});
