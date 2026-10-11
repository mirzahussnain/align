import type { Prisma } from '@/generated/prisma/client';
import type { CVAnalysisResult } from '@/shared/types/cv';
import type { CareerProfileSnapshotData } from './career-profile-snapshot';
import { prisma } from '@/shared/lib/prisma';
import { APIError } from '@/shared/utils/api-error';
import { ANALYSIS_VERSIONS } from '@/shared/config/analysis-domain';
import { ANALYSIS_LIMITS } from '@/shared/policies';
import { assertCapability, EntitlementRequiredError, getUserPlan } from '@/shared/entitlements/server';
import { reserveCapability, commitCapability, releaseCapability, reservationFingerprint } from './capability-reservation';
import { resolveCvRevision } from './cv-revision';
import { createCareerProfileSnapshot } from './career-profile-snapshot';
import { createJobRevisionFromRequest } from './job-revision';
import { resolveMatchRequest, consumeMatchRequest } from './job-snapshot';
import { resolveAnalysisContext } from './analysis-context';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import { getJobMatchFeedbackWithProvenance } from './ai-analyser';
import { AiOrchestrationError } from './ai-orchestrator';
import { AiOperationError } from './ai-failure';
import { applyStructuredCandidateEvidence } from './job-match-structured-evidence';
import { storedJobMatchResult } from './stored-job-match';
import { buildMatchPracticalCompatibility } from './job-match-practical-compatibility';

export interface JobMatchInput {
  userId: string;
  operationId: string;
  requestId: string;
  file?: File;
  storedCvId?: string;
}

export async function runJobMatch(input: JobMatchInput): Promise<CVAnalysisResult> {
  // This higher-level assertion gives callers a canonical 403/429 response. The
  // reservation boundary independently rejects disabled capabilities too.
  await assertCapability(input.userId, 'job_match_analysis');
  const prepared = await resolveMatchRequest(input.userId, input.requestId);
  if (!prepared) throw new APIError('This Job Match request is invalid or has expired.', 404);
  if (prepared.selected.text.length > ANALYSIS_LIMITS.maxJobDescriptionCharacters) {
    throw new APIError('The job description is too long.', 413);
  }

  const plan = await getUserPlan(input.userId);
  const cv = await resolveCvRevision({ userId: input.userId, plan, file: input.file, storedCvId: input.storedCvId });
  const reservation = await reserveCapability({
    userId: input.userId,
    capability: 'job_match_analysis',
    operationId: input.operationId,
    fingerprint: reservationFingerprint(['job-match', input.userId, cv.checksum, prepared.request.selectedDescriptionHash, prepared.request.profileId]),
  });
  if (reservation.status === 'exhausted') throw new EntitlementRequiredError(reservation.decision);
  if (reservation.status === 'conflict') throw new APIError('This operation ID was already used for different input.', 409);
  if (reservation.status === 'recovered' && reservation.reservation.resultRef) {
    const recovered = await prisma.jobMatch.findFirst({ where: { id: reservation.reservation.resultRef, userId: input.userId }, include: { cvRevision: true, jobRevision: true } });
    if (recovered) return storedJobMatchResult(recovered);
    throw new APIError('The previously completed Job Match is no longer available.', 410);
  }
  if (reservation.status !== 'reserved') throw new APIError('Job Match access could not be reserved.', 403);

  try {
    const jobRevision = await createJobRevisionFromRequest({ userId: input.userId, requestId: input.requestId });
    const profileSnapshot = await createCareerProfileSnapshot({ userId: input.userId, profileId: prepared.request.profileId });
    const snapshotData = profileSnapshot.snapshotJson as unknown as CareerProfileSnapshotData;
    const target = snapshotData.profile.personal;
    const practicalCompatibility = buildMatchPracticalCompatibility({
      jobRevision,
      practicalFacts: snapshotData.practicalFacts,
    });
    const { context, classification } = await resolveAnalysisContext({
      mode: 'job_match',
      cvText: cv.text,
      jobDescription: jobRevision.description,
      activeProfileTarget: {
        profileId: prepared.request.profileId,
        occupation: target.targetOccupation,
        roleTitle: target.targetRoleTitle || snapshotData.profile.label,
        industry: target.targetIndustry,
        seniority: target.targetSeniority,
      },
      confirmProfileTarget: true,
      confirmedTargetKind: 'active',
      evidenceSource: { type: 'cv_only' },
      aiAllowed: true,
    });
    const occupation = getOccupationProfile(classification.occupation);
    const generated = await getJobMatchFeedbackWithProvenance(cv.text, jobRevision.description, occupation, classification, { userId: input.userId, operationId: input.operationId });
    if (!generated) throw new APIError('The Job Match provider did not return a valid result.', 502);
    const match = applyStructuredCandidateEvidence(generated.data, snapshotData);
    const result = analyzeCV(cv.text, cv.pageCount, { classification, profile: occupation });
    result.fileName = cv.filename;
    result.mode = 'job_match';
    result.analysisContext = context;
    result.aiApplied = true;
    result.jobDescription = jobRevision.description;
    result.jobMatchData = match;
    result.overallScore = match.matchScore;
    result.aiDetectedIndustry = classification.sector;
    result.practicalCompatibility = practicalCompatibility;

    const row = await prisma.jobMatch.create({
      data: {
        userId: input.userId,
        cvRevisionId: cv.id,
        jobRevisionId: jobRevision.id,
        profileSnapshotId: profileSnapshot.id,
        requestId: prepared.request.id,
        matchScore: match.matchScore,
        requirementLedgerJson: JSON.parse(JSON.stringify({
          schemaVersion: 1,
          analysisVersion: ANALYSIS_VERSIONS.jobMatchAlgorithm,
          requirements: match.requirements.map((requirement) => ({
            id: requirement.id,
            text: requirement.text,
            importance: requirement.importance.toUpperCase(),
            category: requirement.category.toUpperCase(),
            evidenceRequired: requirement.evidenceRequired,
            ...(requirement.clusterKey ? { clusterKey: requirement.clusterKey } : {}),
            ...(requirement.clusterLabel ? { clusterLabel: requirement.clusterLabel } : {}),
            sourceSection: requirement.sourceSection.toUpperCase(),
            analysis: {
              status: requirement.status.toUpperCase(),
              evidence: requirement.evidence.map((item) => ({ ...item, source: item.source.toUpperCase() })),
              confidence: requirement.confidence,
              deduction: { ...requirement.deduction, rubric: requirement.deduction.rubric.toUpperCase() },
            },
          })),
        })) as Prisma.InputJsonValue,
        requirementLedgerVersion: 1,
        advisoryJson: JSON.parse(JSON.stringify({
          schemaVersion: 1,
          jobTitle: match.jobTitle,
          jobCompany: match.jobCompany,
          domainFit: match.domainFit,
          matchScore: match.matchScore,
          matchFeedback: match.matchFeedback,
          experienceGap: match.experienceGap,
          tailoredRewrites: match.tailoredRewrites,
        })) as Prisma.InputJsonValue,
        practicalCompatibilityJson: JSON.parse(JSON.stringify(practicalCompatibility)) as Prisma.InputJsonValue,
        practicalCompatibilityVersion: 1,
        advisoryVersion: 1,
        analysisVersion: ANALYSIS_VERSIONS.jobMatchAlgorithm,
        promptVersion: ANALYSIS_VERSIONS.jobMatchPrompt,
        aiProvider: generated.provenance.provider,
        aiModel: generated.provenance.model,
      },
    });
    const committed = await commitCapability({ userId: input.userId, capability: 'job_match_analysis', operationId: input.operationId, resultRef: row.id });
    if (committed.status !== 'committed') throw new APIError('Job Match could not be finalised.', 503);
    await consumeMatchRequest(input.userId, input.requestId);
    result.analysisId = row.id;
    return result;
  } catch (error) {
    const failure = error instanceof AiOrchestrationError
      ? new AiOperationError({
          capability: 'job_match_analysis',
          operationId: input.operationId,
          reason: 'provider_unavailable',
        })
      : error;
    await releaseCapability({
      userId: input.userId,
      capability: 'job_match_analysis',
      operationId: input.operationId,
      reason: failure instanceof AiOperationError && failure.reason === 'provider_unavailable'
        ? 'provider_unavailable'
        : failure instanceof APIError
          ? 'operation_failed'
          : 'provider_unavailable',
    });
    throw failure;
  }
}
