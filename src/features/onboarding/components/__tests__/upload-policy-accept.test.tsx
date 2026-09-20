// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { CapabilityDecision } from '@/shared/entitlements/registry';

const expectedAccept = '.pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text';
const policy = vi.hoisted(() => ({
  cv: {
    formats: ['pdf', 'docx', 'odt'],
    maxBytes: 10 * 1024 * 1024,
    maxDirectMultipartBytes: 4 * 1024 * 1024,
    mimeTypes: {
      pdf: ['application/pdf'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      odt: ['application/vnd.oasis.opendocument.text'],
    },
    canonicalMimeTypes: {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      odt: 'application/vnd.oasis.opendocument.text',
    },
    extensions: { pdf: '.pdf', docx: '.docx', odt: '.odt' },
    acceptedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
    ],
    fileInputAccept: '.pdf,.docx,.odt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text',
  },
  avatar: { maxBytes: 5 * 1024 * 1024 },
}));

vi.mock('@/shared/policies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/policies')>()),
  UPLOAD_POLICY: policy,
}));

import { UploadStep } from '../UploadStep';
import JobMatchPreparation from '@/features/jobs/components/JobMatchPreparation';
import PublicAtsDemo from '@/features/cv-analyzer/components/PublicAtsDemo';

afterEach(cleanup);

const capacity: CapabilityDecision = {
  capability: 'stored_source_cvs',
  plan: 'FREE',
  mode: 'resource_limit',
  allowed: true,
  limit: 3,
  used: 0,
  remaining: 3,
  reason: 'allowed',
};

describe('CV file-input format policy', () => {
  it('exposes every policy format from the onboarding upload input', () => {
    const { container } = render(<UploadStep
      stageIndex={1}
      totalStages={9}
      initialStoredCvs={[]}
      initialCapacity={capacity}
      maxBytes={10 * 1024 * 1024}
      onUploaded={vi.fn()}
      onManualPath={vi.fn()}
      onBack={vi.fn()}
      onUpgrade={vi.fn()}
    />);

    expect(container.querySelector<HTMLInputElement>('#onboarding-cv-file')?.accept)
      .toBe(expectedAccept);
  });

  it('exposes every policy format from the Job Match CV input', () => {
    const { container } = render(<JobMatchPreparation
      jobSnapshotId="job-1"
      title="Data Analyst"
      employerName="Example Ltd"
      providerDescription="A complete role description"
      descriptionAvailability="FULL"
      profiles={[{ profileId: 'profile-1', label: 'Data' }]}
      usage={null}
      onClose={vi.fn()}
    />);

    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.accept)
      .toBe(expectedAccept);
  });

  it('exposes every policy format from the public ATS CV input', () => {
    const { container } = render(<PublicAtsDemo />);

    expect(container.querySelector<HTMLInputElement>('input[type="file"]')?.accept)
      .toBe(expectedAccept);
  });
});
