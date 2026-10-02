import type { ExactJobMatchSourceLinkage } from './types';
import { prisma } from '@/shared/lib/prisma';
import { parseStoredExtractionPayload } from '@/shared/services/cv-extraction/types';
import type { CareerProfileSnapshotData } from '@/shared/services/career-profile-snapshot';
import { RequirementLedgerSnapshotSchema } from './schemas';
import { extractionToCandidateEvidence } from './source-cv';
import { profileToCandidateEvidence } from './source-profile';

export interface JobMatchSourceRecord {
  id: string;
  jobRevisionId: string;
  profileSnapshotId: string;
  requirementLedgerVersion: number;
  analysisVersion: string;
  cvRevision: {
    id: string;
    storedCvId: string | null;
    extractionId: string | null;
  };
}

/**
 * Resolve only the immutable records cited by the match. There is deliberately
 * no fallback to a user's current/default CV or a newer extraction.
 */
export function jobMatchSourceLinkage(record: JobMatchSourceRecord): ExactJobMatchSourceLinkage {
  if (!record.cvRevision.storedCvId || !record.cvRevision.extractionId) {
    throw new Error('Job Match generation requires the exact stored CV and extraction used at match time.');
  }
  return {
    jobMatchId: record.id,
    storedCvId: record.cvRevision.storedCvId,
    cvExtractionId: record.cvRevision.extractionId,
    cvRevisionId: record.cvRevision.id,
    matchProfileSnapshotId: record.profileSnapshotId,
    jobRevisionId: record.jobRevisionId,
    requirementLedgerVersion: record.requirementLedgerVersion,
    analysisVersion: record.analysisVersion,
  };
}

export async function loadJobMatchGenerationSource(userId: string, jobMatchId: string) {
  const match = await prisma.jobMatch.findFirst({
    where: { id: jobMatchId, userId },
    include: { cvRevision: { include: { extraction: true } }, profileSnapshot: true, jobRevision: true },
  });
  if (!match) throw new Error('Job Match not found.');
  const linkage = jobMatchSourceLinkage({
    id: match.id, requirementLedgerVersion: match.requirementLedgerVersion,
    analysisVersion: match.analysisVersion ?? '', jobRevisionId: match.jobRevisionId,
    profileSnapshotId: match.profileSnapshotId, cvRevision: match.cvRevision,
  });
  const ledger = RequirementLedgerSnapshotSchema.parse(match.requirementLedgerJson);
  const extraction = parseStoredExtractionPayload(match.cvRevision.extraction?.structuredData);
  if (!extraction) throw new Error('The exact structured CV extraction used by this Job Match is unavailable.');
  const matchProfile = match.profileSnapshot.snapshotJson as unknown as CareerProfileSnapshotData;
  return {
    linkage,
    ledger,
    cvEvidence: extractionToCandidateEvidence(extraction, { cvRevisionId: match.cvRevision.id, extractionId: linkage.cvExtractionId }),
    matchProfileEvidence: profileToCandidateEvidence(matchProfile.profile, { snapshotId: match.profileSnapshot.id }),
    matchProfileId: match.profileSnapshot.sourceProfileId,
    target: { title: match.jobRevision.title, company: match.jobRevision.company, location: match.jobRevision.location, description: match.jobRevision.description },
  };
}
