import type { Prisma } from '@/generated/prisma/client';
import type { CVAnalysisResult } from '@/shared/types/cv';
import { prisma } from '@/shared/lib/prisma';
import { analyzeCV, computeOverallScore, evidenceCoverageScore } from '@/shared/utils/scoring-engine';
import { statusFor } from '@/shared/constants/scoring-config';
import { getIndustryDictionary } from '@/shared/constants/sector-keywords';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { resolveAnalysisContext } from './analysis-context';
import { resolveCvRevision } from './cv-revision';
import { getSemanticCVFeedbackWithProvenance } from './ai-analyser';
import { assertCapability, EntitlementRequiredError, getUserPlan } from '@/shared/entitlements/server';
import { reserveCapability, commitCapability, releaseCapability, reservationFingerprint, hashContent } from './capability-reservation';
import { APIError } from '@/shared/utils/api-error';
import { ANALYSIS_VERSIONS } from '@/shared/config/analysis-domain';
import { loadProfileTarget } from '@/features/dashboard/data/load-profile';
import { EmailVerificationRequiredError } from './email-verification-guard';

export interface AtsAnalysisInput {
  userId: string;
  operationId: string;
  file?: File;
  storedCvId?: string;
  profileId?: string;
  targetSelection?: 'detected' | 'active_profile' | 'saved_profile' | 'custom_role' | 'generic';
  savedProfileId?: string;
  targetRole?: string;
  targetOccupation?: string;
}

function applySemantic(result: CVAnalysisResult, feedback: NonNullable<Awaited<ReturnType<typeof getSemanticCVFeedbackWithProvenance>>>['data']): void {
  const summary = result.categories.find((item) => item.id === 'professionalSummary');
  if (summary) {
    summary.score = feedback.summaryScore;
    summary.details = feedback.summaryFeedback;
    summary.status = statusFor(summary.score, summary.maxScore);
  }
  const impact = result.categories.find((item) => item.id === 'impactStatements');
  if (impact) {
    impact.score = feedback.impactScore;
    impact.details = feedback.impactFeedback;
    impact.status = statusFor(impact.score, impact.maxScore);
  }
  for (const rewrite of feedback.rewrites) {
    result.recommendations.push({ priority: 'high', title: `Rewrite bullet: "${rewrite.original.slice(0, 45)}…"`, description: `Suggested rewrite: "${rewrite.suggested}"\n\nRationale: ${rewrite.rationale}`, timeEstimate: '10 min', kind: 'rewrite' });
  }
  for (const keyword of feedback.additionalKeywords) {
    if (!result.keywords.present.some((item) => item.keyword.toLowerCase() === keyword.keyword.toLowerCase())) {
      result.keywords.present.push(keyword);
    }
  }
  const coverage = result.categories.find((item) => item.id === 'evidenceCoverage');
  if (coverage) {
    const total = result.keywords.present.length + result.keywords.missing.length;
    coverage.score = total === 0 ? Math.min(10, Math.round((result.keywords.present.length / 8) * 10)) : evidenceCoverageScore(result.keywords);
    coverage.status = statusFor(coverage.score, coverage.maxScore);
    const sector = result.classification ? getIndustryDictionary(result.classification.sector)?.label : null;
    coverage.details = `${Math.round((coverage.score / coverage.maxScore) * 100)}% coverage of role-relevant keywords${sector ? ` for ${sector}` : ''}`;
  }
  result.aiApplied = true;
  result.aiTargetRole = feedback.detectedRole;
  result.aiAlignmentNote = feedback.alignmentNote;
  result.aiRiskFlags = feedback.riskFlags;
  result.aiClichés = feedback.clichés;
  result.overallScore = computeOverallScore(result.categories);
}

export async function runAtsAnalysis(input: AtsAnalysisInput): Promise<CVAnalysisResult> {
  await assertCapability(input.userId, 'ats_analysis');
  const plan = await getUserPlan(input.userId);
  const source = await resolveCvRevision({ userId: input.userId, plan, file: input.file, storedCvId: input.storedCvId });
  const profileTarget = input.profileId ? await loadProfileTarget(input.userId, input.profileId) : null;
  if (input.profileId && !profileTarget) throw new APIError('Career Profile not found.', 404);
  const selectedTarget = input.targetSelection === 'saved_profile' && input.savedProfileId
    ? await loadProfileTarget(input.userId, input.savedProfileId)
    : profileTarget;
  if (input.targetSelection === 'saved_profile' && !selectedTarget) throw new APIError('Saved Career Profile not found.', 404);

  let reserve: Awaited<ReturnType<typeof reserveCapability>> | null;
  try {
    reserve = await reserveCapability({
      userId: input.userId,
      capability: 'ai_enhanced_ats_analysis',
      operationId: input.operationId,
      fingerprint: reservationFingerprint(['ats', input.userId, source.checksum, input.targetSelection, input.savedProfileId, input.targetRole, input.targetOccupation]),
    });
  } catch (error) {
    if (!(error instanceof EmailVerificationRequiredError)) throw error;
    reserve = null;
  }
  if (reserve?.status === 'recovered' && reserve.reservation.resultRef) {
    const row = await prisma.atsAnalysis.findFirst({ where: { id: reserve.reservation.resultRef, userId: input.userId } });
    if (row) return { ...(row.resultJson as unknown as CVAnalysisResult), analysisId: row.id };
  }
  if (reserve?.status === 'conflict') throw new APIError('This operation ID was already used for different input.', 409);
  const verificationRequired = reserve === null;
  const aiAllowed = reserve !== null && reserve.status !== 'exhausted';
  const reservationHeld = reserve?.status === 'reserved';

  const selection = input.targetSelection ?? 'detected';
  const { context, classification } = await resolveAnalysisContext({
    mode: 'ats',
    cvText: source.text,
    explicitTarget: selection === 'custom_role' ? { occupation: input.targetOccupation ?? null, roleTitle: input.targetRole ?? null } : undefined,
    activeProfileTarget: selectedTarget ? { profileId: selectedTarget.profileId, occupation: selectedTarget.targetOccupation, roleTitle: selectedTarget.targetRoleTitle || selectedTarget.label, industry: selectedTarget.targetIndustry, seniority: selectedTarget.targetSeniority } : undefined,
    confirmProfileTarget: selection === 'active_profile' || selection === 'saved_profile',
    confirmedTargetKind: selection === 'saved_profile' ? 'saved' : 'active',
    forceGeneric: selection === 'generic',
    evidenceSource: { type: 'cv_only' },
    aiAllowed,
  });
  const occupationProfile = getOccupationProfile(classification.occupation);
  const result = analyzeCV(source.text, source.pageCount, { classification, profile: occupationProfile });
  result.fileName = source.filename;
  result.mode = 'ats';
  result.analysisContext = context;
  result.aiDetectedIndustry = classification.sector;
  result.outOfDomain = classification.confidence < 0.5 || classification.source === 'fallback';

  let provenance: { provider: string; model: string } | null = null;
  if (aiAllowed) {
    const enhanced = await getSemanticCVFeedbackWithProvenance(source.text, result, occupationProfile, classification).catch(() => null);
    if (enhanced) {
      applySemantic(result, enhanced.data);
      provenance = enhanced.provenance;
    } else {
      result.aiSkipped = 'error';
    }
  } else {
    result.aiSkipped = verificationRequired ? 'verification_required' : 'quota';
  }

  if (reservationHeld && !provenance) await releaseCapability({ userId: input.userId, capability: 'ai_enhanced_ats_analysis', operationId: input.operationId, reason: 'provider_unavailable' });
  const row = await prisma.atsAnalysis.create({
    data: {
      userId: input.userId,
      profileId: profileTarget?.profileId ?? null,
      cvRevisionId: source.id,
      overallScore: result.overallScore,
      resultJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
      scoringVersion: String(result.scoringVersion ?? 2),
      profileVersion: result.profileVersion ?? null,
      dictionaryVersion: result.dictionaryVersion ?? null,
      occupation: classification.occupation,
      applicationWorkflow: classification.applicationWorkflow,
      classification: JSON.parse(JSON.stringify(classification)) as Prisma.InputJsonValue,
      aiEnhanced: Boolean(provenance),
      aiProvider: provenance?.provider,
      aiModel: provenance?.model,
      promptVersion: provenance ? ANALYSIS_VERSIONS.atsPrompt : null,
    },
  });
  if (reservationHeld && provenance) {
    const committed = await commitCapability({ userId: input.userId, capability: 'ai_enhanced_ats_analysis', operationId: input.operationId, resultRef: row.id });
    if (committed.status !== 'committed') throw new APIError('ATS analysis could not be finalised.', 503);
  }
  result.analysisId = row.id;
  return result;
}
