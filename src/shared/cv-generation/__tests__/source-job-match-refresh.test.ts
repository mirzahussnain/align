import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMatch: vi.fn(),
  extractStoredCvRecord: vi.fn(),
  extractionToCandidateEvidence: vi.fn(),
  profileToCandidateEvidence: vi.fn(),
}));

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { jobMatch: { findFirst: mocks.findMatch } },
}));
vi.mock('@/shared/services/stored-cv', () => ({
  extractStoredCvRecord: mocks.extractStoredCvRecord,
}));
vi.mock('../source-cv', () => ({
  extractionToCandidateEvidence: mocks.extractionToCandidateEvidence,
}));
vi.mock('../source-profile', () => ({
  profileToCandidateEvidence: mocks.profileToCandidateEvidence,
}));

import { CV_PARSER_VERSION } from '@/shared/services/cv-extraction';
import { loadJobMatchGenerationSource } from '../source-job-match';

const structured = {
  schemaVersion: 3,
  identity: {},
  detectedSections: [],
  experience: [], education: [], projects: [], skills: [], certifications: [],
  training: [], licences: [], professionalRegistrations: [], languages: [],
  volunteering: [], otherEvidence: [],
};

function match(parserVersion: string) {
  return {
    id: 'match-1', userId: 'user-1', jobRevisionId: 'job-revision-1',
    profileSnapshotId: 'profile-snapshot-1', requirementLedgerVersion: 1,
    requirementLedgerJson: { schemaVersion: 1, analysisVersion: 'job-match@1', requirements: [] },
    analysisVersion: 'job-match@1',
    cvRevision: {
      id: 'cv-revision-1', storedCvId: 'stored-cv-1', extractionId: 'old-extraction',
      extraction: { id: 'old-extraction', parserVersion, structuredData: structured },
    },
    profileSnapshot: { id: 'profile-snapshot-1', sourceProfileId: 'profile-1', snapshotJson: { profile: {} } },
    jobRevision: { title: 'Engineer', company: 'Acme', location: 'Remote', description: 'Build software.' },
  };
}

describe('loadJobMatchGenerationSource parser freshness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.extractionToCandidateEvidence.mockReturnValue({ source: 'cv' });
    mocks.profileToCandidateEvidence.mockReturnValue({ source: 'profile' });
  });

  it('reparses the same stored CV when the match extraction uses an older parser', async () => {
    mocks.findMatch.mockResolvedValue(match('cv-extract@2.3'));
    mocks.extractStoredCvRecord.mockResolvedValue({
      id: 'fresh-extraction', storedCvId: 'stored-cv-1', parserVersion: CV_PARSER_VERSION,
      status: 'READY', structuredData: structured,
    });

    const source = await loadJobMatchGenerationSource('user-1', 'match-1');

    expect(mocks.extractStoredCvRecord).toHaveBeenCalledWith({ userId: 'user-1', storedCvId: 'stored-cv-1' });
    expect(mocks.extractionToCandidateEvidence).toHaveBeenCalledWith(structured, {
      cvRevisionId: 'cv-revision-1', extractionId: 'fresh-extraction',
    });
    expect(source.linkage).toMatchObject({
      cvRevisionId: 'cv-revision-1', storedCvId: 'stored-cv-1', cvExtractionId: 'fresh-extraction',
    });
  });

  it('keeps the immutable extraction when it already uses the current parser', async () => {
    mocks.findMatch.mockResolvedValue(match(CV_PARSER_VERSION));

    const source = await loadJobMatchGenerationSource('user-1', 'match-1');

    expect(mocks.extractStoredCvRecord).not.toHaveBeenCalled();
    expect(source.linkage.cvExtractionId).toBe('old-extraction');
  });
});
