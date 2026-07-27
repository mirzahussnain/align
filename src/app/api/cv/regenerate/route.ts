import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { rewriteCVWithProvenance, type ProviderProvenance } from '@/shared/services/cv-rewriter';
import { buildRewriteInput } from '@/shared/services/cv-rewrite-context';
import { loadCanonicalAnalysis } from '@/shared/services/canonical-analysis';
import { logReservationEvent } from '@/shared/services/reservation-observability';
import {
  validateRewrittenCv,
  TRUTHFULNESS_FAILURE_MESSAGE,
} from '@/shared/services/cv-rewrite-validation';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import {
  loadOwnedProfileData,
  loadProfileData,
  resolveProfileId,
} from '@/features/dashboard/data/load-profile';
import {
  ProfileEvidenceValidationError,
  type ApprovedProfileEvidenceOverlay,
} from '@/shared/types/profile-reasoning';
import {
  TRUTHFULNESS_VALIDATION_VERSION,
  TRUSTED_GENERATION_CONTEXT_VERSION,
  UNSUPPORTED_CLAIM_VALIDATION_VERSION,
  type AtsOptimizationData,
  type LedgerNativeRewriteInput,
  type UserProvidedContext,
} from '@/shared/types/cv-rewrite';
import { buildTrustedGenerationContext } from '@/shared/services/trusted-generation-context';
import { buildValidationCorpus } from '@/shared/services/cv-rewrite-validation';
import type { RewrittenCVData } from '@/shared/templates/types';
import {
  structuredRewriteToRewrittenData,
  validateStructuredRewriteProvenance,
  type SummaryCompactionDecision,
} from '@/shared/services/cv-rewrite-structured';
import {
  salvageStructuredDraft,
  type SalvageReport,
} from '@/shared/services/cv-rewrite-provenance';
import type { StructuredCvRewriteOutput } from '@/shared/types/cv-rewrite';
import { CV_TEMPLATE_CAPABILITIES } from '@/shared/constants/cv-template-capabilities';
import {
  prioritizeCvContent,
  type CvContentPriorityPlan,
} from '@/shared/services/cv-content-priority';
import {
  experienceDurationFact,
  scanUnsupportedClaims,
  toolVocabularyFromRequirements,
  unsupportedClaimUserMessage,
} from '@/shared/services/cv-generation-safety';
import { assertCapability, EntitlementRequiredError, getUserPlan } from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  reservationFingerprint,
  checkRepairEligibility,
  commitRepair,
} from '@/shared/services/capability-reservation';
import {
  AiOperationError,
  OperationConflictError,
  OperationInProgressError,
  ResultUnavailableError,
  markOperationRunning,
  reservationIsRunning,
} from '@/shared/services/ai-failure';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { storage } from '@/shared/lib/storage';
import {
  renderCvDocx,
  persistAndArchiveCv,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import { TemplateIdSchema } from '@/shared/constants/templates';
import { resolveApprovedApplicationEvidence, StructuredEvidenceValidationError } from '@/shared/services/structured-evidence';

const ProfileEvidenceRefSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('experience'), id: z.string().min(1) }),
  z.object({ type: z.literal('project'), id: z.string().min(1) }),
  z.object({ type: z.literal('education'), id: z.string().min(1) }),
  z.object({ type: z.literal('skill'), id: z.string().min(1) }),
  z.object({ type: z.literal('certification'), id: z.string().min(1) }),
  z.object({ type: z.literal('training'), id: z.string().min(1) }),
  z.object({ type: z.literal('licence'), id: z.string().min(1) }),
  z.object({ type: z.literal('professional_registration'), id: z.string().min(1) }),
  z.object({ type: z.literal('language'), id: z.string().min(1) }),
  z.object({ type: z.literal('volunteering'), id: z.string().min(1) }),
  z.object({ type: z.literal('other'), id: z.string().min(1) }),
]);

const RegenerateSchema = z.object({
  analysisId: z.string().min(1, 'analysisId is required'),
  templateId: TemplateIdSchema,
  hitlContext: z.record(z.string(), z.string()).optional().default({}),
  includeAtsOptimization: z.boolean().optional().default(true),
  /**
   * Profile items the user approved in the profile-bridge step. Only ids cross
   * the wire — the server re-resolves them against the stored profile, so a
   * tampered request cannot inject invented experience into the rewrite.
   */
  approvedProfileEvidence: z
    .array(
      z.object({
        requirementId: z.string().min(1),
        evidenceRef: ProfileEvidenceRefSchema,
        rationale: z.string().max(2000).optional(),
        approvalId: z.string().min(1).optional(),
      })
    )
    .optional()
    .default([]),
  /** Career track the approved ids belong to. Omitted uses the default. */
  profileId: z.string().optional(),
  applicationEvidenceContextIds: z.array(z.string().min(1)).optional().default([]),
});

/** hitlContext is a map of requirement label → the candidate's own free-text note. */
function toUserContext(hitlContext: Record<string, string>): UserProvidedContext[] {
  return Object.entries(hitlContext)
    .map(([label, text]) => ({ label, text: text.trim() }))
    .filter((note) => note.text.length > 0);
}

type SafetyRejection =
  | { kind: 'truthfulness' }
  | { kind: 'unsupported'; message: string };

interface MaterializedRewriteDraft {
  structured: StructuredCvRewriteOutput;
  data: RewrittenCVData;
  summary: SummaryCompactionDecision;
  claimSourceRefs: ReturnType<typeof structuredRewriteToRewrittenData>['claimSourceRefs'];
  /** Coarse provider/model that actually produced THIS draft (audit provenance). */
  providerProvenance: ProviderProvenance;
}

interface SafetyOutcome {
  draft: MaterializedRewriteDraft;
  correctionAttempts: number;
  rejection: SafetyRejection | null;
}

/**
 * Gate a generated draft through both truthfulness validation and the Stage 1
 * unsupported-claim scan. On the first failure it makes ONE controlled
 * correction attempt — re-running the model with the specific violations fed
 * back — then re-validates. If the corrected draft still fails, it rejects. The
 * caller must persist nothing and charge nothing for a rejected outcome.
 *
 * `input` is mutated only to attach correction notes for the retry; that is the
 * documented channel for correction feedback.
 */
async function enforceGenerationSafety(args: {
  input: LedgerNativeRewriteInput;
  firstDraft: MaterializedRewriteDraft;
  durationFact: ReturnType<typeof experienceDurationFact>;
  toolVocabulary: string[];
  rewrite: (input: LedgerNativeRewriteInput) => Promise<MaterializedRewriteDraft | null>;
}): Promise<SafetyOutcome> {
  const { input, durationFact, toolVocabulary, rewrite } = args;
  let draft = args.firstDraft;

  for (let attempt = 0; attempt <= 1; attempt++) {
    const validation = validateRewrittenCv(draft.data, input);
    const flags = validation.ok
      ? scanUnsupportedClaims({
          cv: draft.data,
          corpus: buildValidationCorpus(input),
          durationFact,
          toolVocabulary,
        })
      : [];

    if (validation.ok && flags.length === 0) {
      return { draft, correctionAttempts: attempt, rejection: null };
    }

    // Exhausted the single correction attempt — reject with the right message.
    if (attempt === 1) {
      return {
        draft,
        correctionAttempts: attempt,
        rejection: validation.ok
          ? { kind: 'unsupported', message: unsupportedClaimUserMessage(flags) }
          : { kind: 'truthfulness' },
      };
    }

    // One controlled correction attempt: feed the exact violations back.
    input.correctionNotes = validation.ok
      ? flags.map((flag) => flag.reason)
      : validation.reasons;
    const corrected = await rewrite(input);
    if (!corrected) {
      return {
        draft,
        correctionAttempts: 1,
        rejection: validation.ok
          ? { kind: 'unsupported', message: unsupportedClaimUserMessage(flags) }
          : { kind: 'truthfulness' },
      };
    }
    draft = corrected;
  }

  // Unreachable — the loop always returns — but satisfies the type checker.
  return { draft, correctionAttempts: 1, rejection: { kind: 'truthfulness' } };
}

/** Stream rendered DOCX bytes back as a downloadable attachment. */
function docxResponse(docxBuffer: Buffer | Uint8Array): NextResponse {
  return new NextResponse(new Uint8Array(docxBuffer), {
    status: 200,
    headers: {
      'Content-Type': DOCX_CONTENT_TYPE,
      'Content-Disposition': 'attachment; filename="Tailored_CV.docx"',
    },
  });
}

/**
 * Re-stream the archived DOCX of a committed generation without regenerating.
 * The row must exist, belong to the user, match the analysis this recovery is
 * for, and still have an archived object. Any missing link means the committed
 * result is unrecoverable — the reservation stays charged and the caller reports
 * RESULT_UNAVAILABLE (repairable via an explicit, non-double-charged repair).
 */
async function recoverGeneratedCv(args: {
  userId: string;
  resultRef: string | null;
  analysisId: string;
  operationId: string;
  repairable: boolean;
}): Promise<NextResponse> {
  const { userId, resultRef, analysisId, operationId, repairable } = args;
  const unavailable = () =>
    new ResultUnavailableError({ capability: 'cv_regeneration', operationId, repairable });

  if (!resultRef) throw unavailable();
  const cv = await prisma.generatedCV.findUnique({
    where: { id: resultRef },
    select: { userId: true, analysisId: true, fileKey: true },
  });
  if (!cv || cv.userId !== userId) throw unavailable();
  // The recovered document must belong to the analysis this request rebuilds.
  if (cv.analysisId && cv.analysisId !== analysisId) throw unavailable();
  if (!cv.fileKey) throw unavailable();

  let bytes: Buffer;
  try {
    bytes = await storage.download('rewrites', cv.fileKey);
  } catch (error) {
    console.warn(
      '[regenerate] Archived CV object missing on recovery:',
      error instanceof Error ? error.message : error
    );
    throw unavailable();
  }
  return docxResponse(bytes);
}

/**
 * Rebuild a tailored CV from a stored job-match analysis. Everything the rewrite
 * needs — the original CV text, the job description, and the canonical
 * JobMatchDataV2 ledger — was persisted when the analysis first ran, so we
 * re-run the rewrite without asking the user to re-upload or paste anything. The
 * ledger is projected into a compact, generation-specific context; the generated
 * draft is validated for invented claims before it is charged or persisted.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to generate a CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(rewriteLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Pruning caps derive from the effective plan, never subscriptionTier.
    const entitlements = entitlementsFor(await getUserPlan(session.user.id));

    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
    // An explicit linked repair of a lost committed result. A repair is free
    // (it re-produces a result the user already paid for), so it bypasses the
    // quota gate below and never reserves a fresh unit.
    const repairOfOperationId = request.headers.get('x-repair-of')?.trim() || null;

    // Checked before the model call, so a user out of allowance gets a clean
    // refusal rather than a CV they were not entitled to generate. Skipped for a
    // repair, which must succeed even when the quota is now exhausted.
    if (!repairOfOperationId) {
      await assertCapability(session.user.id, 'cv_regeneration');
    }

    const parsed = RegenerateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }
    const {
      analysisId,
      templateId,
      hitlContext,
      includeAtsOptimization,
      approvedProfileEvidence,
      profileId,
      applicationEvidenceContextIds,
    } = parsed.data;

    // Canonical, unprojected read from trusted storage — never the plan-projected
    // report shape. Ownership-checked and schema-validated inside the loader.
    const canonical = await loadCanonicalAnalysis({
      userId: session.user.id,
      analysisId,
      requireJobMatch: true,
    });
    if (!canonical.ok) {
      switch (canonical.error) {
        case 'not_found':
          throw new APIError('Analysis not found.', 404);
        case 'wrong_mode':
          throw new APIError('Only job-match analyses can be rebuilt into a CV.', 400);
        case 'invalid_result':
          throw new APIError('This analysis is missing the data needed to rebuild a CV.', 400);
        case 'invalid_job_match':
          throw new APIError(
            'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
            409
          );
      }
    }
    const rawResult = canonical.analysis.result;
    const cvText = canonical.analysis.cvText;
    const jobDescription = canonical.analysis.jobDescription;

    // Analysis-context handoff: the resolved target and evidence provenance from
    // the analysis this CV is built from. Carried for traceability and to guide
    // presentation only — it is NEVER treated as canonical evidence. The ledger
    // and the trusted generation context remain the sole sources of fact.
    const analysisContext = rawResult.analysisContext;
    const analysisContextProvenance = analysisContext
      ? {
          targetSource: analysisContext.targetSource,
          resolvedTargetOccupation: analysisContext.resolvedTargetOccupation,
          resolvedTargetRole: analysisContext.resolvedTargetRole ?? null,
          evidenceSource: analysisContext.evidenceSource?.type ?? null,
          targetProfileId: analysisContext.targetProfileId ?? null,
        }
      : null;

    if (cvText.trim().length < 50 || jobDescription.trim().length < 10) {
      throw new APIError('This analysis is missing the data needed to rebuild a CV.', 400);
    }

    // The canonical ledger is the single source of truth for generation. It is
    // never converted back into the old mandatory/desirable arrays. The loader
    // guarantees a valid v2 ledger for a job-match analysis (requireJobMatch);
    // the null-check narrows the type and defends against future loader changes.
    const storedJobMatch = canonical.analysis.jobMatchData;
    if (!storedJobMatch) {
      throw new APIError(
        'Stored job-match data failed integrity validation: schemaVersion 2 is required.',
        409
      );
    }

    const atsOptimizationData: AtsOptimizationData | undefined = includeAtsOptimization
      ? {
          // Only keywords the CV actually HAS. Surfacing them is emphasis;
          // inventing the ~90 missing ones would be fabrication.
          presentKeywords: (rawResult.keywords?.present ?? [])
            .map((keyword) => keyword.keyword)
            .filter(Boolean)
            .slice(0, 40),
          recommendations: (rawResult.recommendations ?? [])
            .map((recommendation) => recommendation.title)
            .filter(Boolean)
            .slice(0, 6),
          aiClichesToAvoid: (rawResult.aiClichés ?? []).slice(0, 20),
        }
      : undefined;

    // Which career track this CV belongs to. Resolved unconditionally: the CV is
    // filed under the active profile whether or not any profile items were
    // swapped in, otherwise a track's CV list would only ever show the CVs that
    // happened to use the reasoning step.
    let scopedProfileId = await resolveProfileId(session.user.id, profileId);

    let approvedEvidenceOverlay: ApprovedProfileEvidenceOverlay[] = [];
    const snapshotApprovalIds = approvedProfileEvidence.map((approval) => approval.approvalId).filter((id): id is string => Boolean(id));
    if (snapshotApprovalIds.length > 0) {
      const rows = await prisma.profileEvidenceApproval.findMany({ where: { id: { in: snapshotApprovalIds }, userId: session.user.id, analysisId, ...(scopedProfileId ? { profileId: scopedProfileId } : {}) } });
      if (rows.length !== snapshotApprovalIds.length) throw new APIError('Approved evidence snapshot is unavailable.', 409);
      const requirements = new Map(storedJobMatch.requirements.map((item) => [item.id, item]));
      approvedEvidenceOverlay = rows.map((row) => {
        const snapshot = row.snapshot as Record<string, unknown>;
        const requirement = requirements.get(row.requirementId);
        if (!requirement) throw new APIError('Approved evidence requirement is unavailable.', 409);
        return { requirementId: row.requirementId, evidenceRef: { type: row.evidenceType, id: row.evidenceId } as never, requirementText: requirement.text, sourceProfileId: row.profileId ?? '', resolvedEvidenceText: String(snapshot.displaySummary ?? ''), evidenceLocation: String(snapshot.displayTitle ?? 'Approved profile evidence'), userApproved: true as const, evidenceSnapshot: snapshot };
      });
    }
    // Legacy id-only approvals are re-resolved only for records created before snapshot persistence.
    const legacyApprovals = approvedProfileEvidence.filter((approval) => !approval.approvalId);
    if (legacyApprovals.length > 0) {
      const profile = await loadOwnedProfileData(session.user.id, profileId);
      if (!profile) throw new APIError('Profile not found.', 404);
      scopedProfileId = profile.profileId;
      try { approvedEvidenceOverlay = [...approvedEvidenceOverlay, ...resolveApprovedProfileEvidence(profile, legacyApprovals, storedJobMatch.requirements)]; }
      catch (error) { if (error instanceof ProfileEvidenceValidationError) throw new APIError(error.message, 400); throw error; }
    }
    let applicationContext: Awaited<ReturnType<typeof resolveApprovedApplicationEvidence>> = [];
    try {
      applicationContext = await resolveApprovedApplicationEvidence(session.user.id, analysisId, scopedProfileId, applicationEvidenceContextIds, storedJobMatch.requirements);
    } catch (error) {
      if (error instanceof StructuredEvidenceValidationError) throw new APIError(error.message, 400);
      throw error;
    }
    const userContext = [...toUserContext(hitlContext), ...applicationContext.map((item) => item.context)];

    // The single trusted-context assembly point for this path: canonical profile
    // snapshot + frozen approval snapshots + deterministic derived facts. The
    // builder's assertGenerationTrusted rejects any generated/inferred source
    // immediately, so unsafe evidence can never reach the prompt. Built before
    // the model call, so a quarantine failure spends no quota.
    const canonicalProfile = await loadProfileData(
      session.user.id,
      scopedProfileId ?? undefined
    );
    const trustedContext = buildTrustedGenerationContext({
      profile: canonicalProfile,
      approvedEvidence: approvedEvidenceOverlay,
    });
    const durationFact = experienceDurationFact(trustedContext);

    // Compact, budgeted, ledger-native projection. Unrelated ledger metadata
    // (confidence, deductions, UI fields) never reaches the prompt.
    const { input, debug } = buildRewriteInput({
      jobMatch: storedJobMatch,
      approvedProfileEvidence: approvedEvidenceOverlay,
      userContext,
      cvText,
      jobDescription,
      template: templateId,
      atsOptimizationData,
    });

    // The model is handed the ONE deterministic duration (never told to compute
    // its own) and any unresolved conflicts, and is forbidden from inferring
    // either. No id or scoring metadata crosses into the prompt.
    input.trustedExperienceDuration =
      durationFact.confidence === 'deterministic' ? durationFact.value : null;
    input.unresolvedConflicts = trustedContext.unresolvedConflicts.map((conflict) => ({
      field: `${conflict.entityType}.${conflict.field}`,
      reason: conflict.reason,
    }));

    input.applicationEvidence = applicationContext;

    // ── Atomic reservation (canonical ordering) ─────────────────────────────
    // Everything above is cheap, deterministic ownership/validation/quarantine
    // work that must be able to reject a request WITHOUT holding a unit. A unit
    // is held here, immediately before the provider call, and released on any
    // failure before the commit.
    const fingerprint = reservationFingerprint([
      'cv_regeneration',
      session.user.id,
      analysisId,
      scopedProfileId ?? '',
      templateId,
      approvedProfileEvidence
        .map((approval) => approval.approvalId ?? `${approval.requirementId}:${approval.evidenceRef.type}:${approval.evidenceRef.id}`)
        .sort()
        .join(','),
      [...applicationEvidenceContextIds].sort().join(','),
    ]);

    logReservationEvent(repairOfOperationId ? 'repair_started' : 'operation_started', {
      userId: session.user.id,
      capability: 'cv_regeneration',
      operationId,
      ...(repairOfOperationId ? { originalOperationId: repairOfOperationId } : {}),
      resultType: 'generated_cv',
    });

    let reservationHeld = false;
    let repairMode = false;
    if (repairOfOperationId) {
      // Explicit linked repair of a lost committed result: verify eligibility
      // before any provider work. A repair consumes no additional quota unit.
      const eligibility = await checkRepairEligibility({
        userId: session.user.id,
        capability: 'cv_regeneration',
        originalOperationId: repairOfOperationId,
      });
      if (eligibility.status === 'already_repaired') {
        // Only one successful repair is allowed — recover its result, if present.
        return await recoverGeneratedCv({
          userId: session.user.id,
          resultRef: eligibility.repair.resultRef,
          analysisId,
          operationId,
          repairable: false,
        });
      }
      if (eligibility.status === 'not_committed') {
        throw new APIError('There is no charged operation to repair.', 409, {
          code: 'REPAIR_NOT_ELIGIBLE',
        });
      }
      repairMode = true;
    } else {
      let reserve;
      try {
        reserve = await reserveCapability({
          userId: session.user.id,
          capability: 'cv_regeneration',
          operationId,
          fingerprint,
        });
      } catch (error) {
        // Authoritative enforcement failure: fail closed, never call the provider.
        console.error(
          '[regenerate] Reservation ledger unavailable; failing closed:',
          error instanceof Error ? error.message : error
        );
        throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'reservation_failure' });
      }
      if (reserve.status === 'conflict') {
        logReservationEvent('fingerprint_conflict', { userId: session.user.id, capability: 'cv_regeneration', operationId });
        throw new OperationConflictError('cv_regeneration', operationId);
      }
      if (reserve.status === 'exhausted') throw new EntitlementRequiredError(reserve.decision);
      if (reserve.status === 'recovered') {
        // This operation already committed — re-stream the stored DOCX, never regenerate.
        logReservationEvent('committed_result_recovered', { userId: session.user.id, capability: 'cv_regeneration', operationId, resultType: 'generated_cv' });
        return await recoverGeneratedCv({
          userId: session.user.id,
          resultRef: reserve.reservation.resultRef,
          analysisId,
          operationId,
          repairable: true,
        });
      }
      if (reserve.status === 'reserved') {
        if (reservationIsRunning(reserve.reservation)) {
          logReservationEvent('duplicate_operation_detected', { userId: session.user.id, capability: 'cv_regeneration', operationId });
          throw new OperationInProgressError('cv_regeneration', operationId);
        }
        await markOperationRunning(session.user.id, 'cv_regeneration', operationId);
        reservationHeld = true;
        logReservationEvent('operation_running', { userId: session.user.id, capability: 'cv_regeneration', operationId, resultType: 'generated_cv' });
      }
    }

    /** Release the held unit for a safe reason; a no-op for a repair (holds none). */
    const releaseGen = async (reason: string) => {
      if (!reservationHeld) return;
      reservationHeld = false;
      await releaseCapability({
        userId: session.user.id,
        capability: 'cv_regeneration',
        operationId,
        reason,
      });
      logReservationEvent('reservation_released', { userId: session.user.id, capability: 'cv_regeneration', operationId, reason });
    };

    // Tracks whether the result is durably persisted. A failure BEFORE this
    // releases the held unit; a failure at/after commit does NOT (the result is
    // safe and a retry finalises/recovers it — never a second provider call).
    let persisted = false;
    try {
      const firstRewrite = await rewriteCVWithProvenance(input);

      // Provider failure spends no quota.
      if (!firstRewrite) {
        throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'provider_unavailable' });
      }
      const structuredRewrite = firstRewrite.output;
      logReservationEvent('provider_succeeded', {
        userId: session.user.id,
        capability: 'cv_regeneration',
        operationId,
        provider: firstRewrite.provenance.provider,
        model: firstRewrite.provenance.model,
        attempt: firstRewrite.provenance.attempt,
        fallbackUsed: firstRewrite.provenance.fallbackUsed,
      });

    // The draft we carry forward — either the provider's first-pass output, or a
    // deterministically salvaged version of it. Salvage never weakens truthfulness:
    // it keeps every valid claim, drops only unsupported OPTIONAL claims, and
    // re-runs the full validator before the draft is allowed to proceed.
    let workingRewrite = structuredRewrite;
    let salvageReport: SalvageReport | null = null;
    let generationOutcome: 'accepted_first_pass' | 'accepted_after_deterministic_repair' =
      'accepted_first_pass';

    const provenanceValidation = validateStructuredRewriteProvenance(structuredRewrite, input);
    if (!provenanceValidation.ok) {
      // Before discarding a completed provider call, attempt deterministic salvage.
      // A terminal defect (invented employer/role/qualification/certification/
      // identity) or too high a defect load still rejects — repairing untrustworthy
      // output is never the goal, and a rejection still persists and charges nothing.
      logReservationEvent('deterministic_repair_started', {
        userId: session.user.id,
        capability: 'cv_regeneration',
        operationId,
        defectCount: provenanceValidation.reasons.length,
        repairMode: 'deterministic',
      });
      const salvage = salvageStructuredDraft(structuredRewrite, input);
      if (salvage.status === 'repaired') {
        console.info(
          `[regenerate] Deterministic provenance salvage repaired a draft for analysis ${analysisId} (removed=${salvage.report.removedClaims.length}, prunedRefs=${salvage.report.repairedReferences.length}).`
        );
        logReservationEvent('deterministic_repair_completed', {
          userId: session.user.id,
          capability: 'cv_regeneration',
          operationId,
          defectCount: provenanceValidation.reasons.length,
          repairMode: 'deterministic',
        });
        workingRewrite = salvage.output;
        salvageReport = salvage.report;
        generationOutcome = 'accepted_after_deterministic_repair';
      } else {
        // `unchanged` can only occur if the strict validator failed on something
        // the claim classifier does not model (e.g. a bad generationNotes entry);
        // it is treated as unrepairable, exactly like an explicit rejection.
        const rejectionReason = salvage.status === 'rejected' ? salvage.reason : 'unrepairable_output';
        console.warn(
          `[regenerate] Structured rewrite provenance rejected for analysis ${analysisId} (reason=${rejectionReason}): ${provenanceValidation.reasons.join(' | ')}`
        );
        logReservationEvent('generation_rejected', {
          userId: session.user.id,
          capability: 'cv_regeneration',
          operationId,
          reason: 'invalid_response',
          defectCount: provenanceValidation.reasons.length,
        });
        throw new APIError(
          'Generated CV content could not be verified against the supplied evidence.',
          422,
          // Dev-only: surface the exact per-block rejection reasons to the client so
          // the generation failure is diagnosable without scraping server logs.
          process.env.NODE_ENV !== 'production'
            ? {
                error: 'Generated CV content could not be verified against the supplied evidence.',
                reasons: provenanceValidation.reasons,
              }
            : undefined
        );
      }
    }
    const firstAdapter = structuredRewriteToRewrittenData(
      workingRewrite,
      CV_TEMPLATE_CAPABILITIES[templateId].summaryMaxChars
    );

    // Truthfulness + unsupported-claim gate, with one controlled correction
    // attempt. A rejection persists nothing, charges nothing, and returns a
    // single retryable message. JD-only tools are drawn from unmet tool
    // requirements so a tool named only in the vacancy cannot slip in as claimed.
    const safety = await enforceGenerationSafety({
      input,
      firstDraft: {
        structured: workingRewrite,
        providerProvenance: firstRewrite.provenance,
        ...firstAdapter,
      },
      durationFact,
      toolVocabulary: toolVocabularyFromRequirements(input.rewriteContext.requirements),
      rewrite: async (retryInput) => {
        const retry = await rewriteCVWithProvenance(retryInput);
        if (!retry) return null;
        // A correction retry is held to the same provenance bar, with the same
        // deterministic salvage available so a single stray optional-skill ref does
        // not throw away an otherwise-corrected draft.
        let retryOutput = retry.output;
        const retryValidation = validateStructuredRewriteProvenance(retry.output, retryInput);
        if (!retryValidation.ok) {
          const salvage = salvageStructuredDraft(retry.output, retryInput);
          if (salvage.status !== 'repaired') return null;
          retryOutput = salvage.output;
        }
        return {
          structured: retryOutput,
          providerProvenance: retry.provenance,
          ...structuredRewriteToRewrittenData(
            retryOutput,
            CV_TEMPLATE_CAPABILITIES[templateId].summaryMaxChars
          ),
        };
      },
    });
    if (safety.rejection) {
      console.warn(
        `[regenerate] Generation safety rejected a draft for analysis ${analysisId} (kind=${safety.rejection.kind}, corrections=${safety.correctionAttempts}).`
      );
      throw new APIError(
        safety.rejection.kind === 'unsupported'
          ? safety.rejection.message
          : TRUTHFULNESS_FAILURE_MESSAGE,
        422
      );
    }
    const validatedDraft = safety.draft;
    const contentPlan: CvContentPriorityPlan = prioritizeCvContent({
      data: validatedDraft.data,
      claimSourceRefs: validatedDraft.claimSourceRefs,
      requirements: input.rewriteContext.requirements,
      pageLengthExpectation: CV_TEMPLATE_CAPABILITIES[templateId].pageLengthExpectation,
    });
    const validatedData = contentPlan.data;

    // Convert the validated draft into the single generation contract before
    // rendering. Section presence, order and headings are planned from the
    // resolved target occupation carried by the analysis context (traceability
    // and presentation only — never treated as evidence). The renderer only
    // presents the planned spec.
    const buildSpec = planCvBuildSpec({
      data: validatedData,
      templateId,
      occupationId: analysisContext?.resolvedTargetOccupation ?? null,
      role: analysisContext?.resolvedTargetRole ?? null,
      targetSource: analysisContext?.targetSource ?? null,
      seniority: null,
      contentPlan,
    });
      let docxBuffer: Buffer;
      try {
        docxBuffer = await renderCvDocx(buildSpec);
      } catch (renderError) {
        console.warn('[regenerate] DOCX render failed:', renderError instanceof Error ? renderError.message : renderError);
        throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'render_failure' });
      }

      // Persist the canonical result and archive the document. Required before the
      // commit so the reservation's resultRef points at a recoverable row.
      let generatedCvId: string;
      try {
        generatedCvId = await persistAndArchiveCv({
        userId: session.user.id,
        data: validatedData,
        templateId,
        fileName: 'Tailored_CV.docx',
        docxBuffer,
        analysisId,
        profileId: scopedProfileId,
        // Full generation provenance — how this CV was made, kept separate from
        // its content. Never duplicates the ledger; only the ids supplied.
        provenance: {
          analysisId,
          profileId: scopedProfileId,
          requirementSchemaVersion: storedJobMatch.schemaVersion,
          requirementIds: input.rewriteContext.requirements.map((requirement) => requirement.id),
          approvedProfileEvidence: approvedEvidenceOverlay,
          userContext,
          applicationEvidenceContext: applicationContext,
          rewriteContractVersion: 1,
          sourceReferenceSchemaVersion: 1,
          claimSourceRefs: validatedDraft.claimSourceRefs,
          unsupportedRequirementsNotAdded:
            validatedDraft.structured.generationNotes?.unsupportedRequirementsNotAdded ?? [],
          summaryCompaction: validatedDraft.summary,
          priorityAlgorithmVersion: contentPlan.version,
          bulletPriorityDecisions: contentPlan.bulletDecisions,
          skillsGroupingDecisions: contentPlan.skillsDecisions,
          duplicatesRemoved: contentPlan.duplicatesRemoved,
          pageDensityDecision: contentPlan.density,
          optionalContentMovedLater: contentPlan.optionalContentMovedLater,
          omittedRedundantContent: contentPlan.omittedRedundantContent,
          template: templateId,
          // One route request holds exactly one reservation regardless of how many
          // providers the orchestrator tries internally (Gemini → fallback → Groq):
          // the successful fallback commits once, an all-provider failure releases
          // once. The ACTUAL winning provider/model is threaded up from the
          // orchestrator boundary (Stage 3), so provenance records what really
          // produced this document rather than the configured primary.
          provider: validatedDraft.providerProvenance.provider,
          model: validatedDraft.providerProvenance.model,
          providerAttempt: validatedDraft.providerProvenance.attempt,
          providerFallbackUsed: validatedDraft.providerProvenance.fallbackUsed,
          promptContextVersion: debug.promptContextVersion,
          estimatedPromptTokens: debug.estimatedPromptTokens,
          truthfulnessValidationVersion: TRUTHFULNESS_VALIDATION_VERSION,
          truthfulnessValidationResult: 'passed',
          // Stage 1 trusted-generation safety provenance.
          trustedContextVersion: TRUSTED_GENERATION_CONTEXT_VERSION,
          trustedContextProfileId: trustedContext.profileSnapshot.profileId,
          approvalSnapshotSourceClasses: trustedContext.approvedEvidenceSnapshots.map(
            (snapshot) => snapshot.sourceClass
          ),
          derivedFacts: trustedContext.derivedFacts.map((fact) => ({
            key: fact.key,
            confidence: fact.confidence,
            derivationRule: fact.derivationRule,
            supportingFactKeys: fact.supportingFactKeys,
          })),
          unresolvedConflicts: trustedContext.unresolvedConflicts,
          unsupportedClaimValidationVersion: UNSUPPORTED_CLAIM_VALIDATION_VERSION,
          unsupportedClaimValidationResult: 'passed',
          correctionAttempts: safety.correctionAttempts,
          // Claim-aware salvage provenance: which outcome state the draft reached
          // and, when repaired, the paths-only report of what was pruned/removed.
          // Never carries claim text or evidence content.
          generationOutcome,
          salvageReport,
          // Resolved analysis context carried into generation (traceability only).
          analysisContext: analysisContextProvenance,
          // Canonical build-spec provenance: how the document's structure was planned.
          cvBuildSpecVersion: buildSpec.version,
          contentPlannerVersion: buildSpec.provenance.plannerVersion,
          templateCapabilityVersion: buildSpec.provenance.capabilityVersion,
          resolvedOccupation: buildSpec.provenance.occupationId,
          roleArchetype: buildSpec.provenance.roleArchetype,
          plannedSectionOrder: buildSpec.provenance.sectionOrder,
          omittedEmptySections: buildSpec.provenance.omittedEmptySections,
          unsupportedByTemplate: buildSpec.provenance.unsupportedByTemplate,
        },
        entitlements,
        });
      } catch (persistError) {
        console.warn('[regenerate] Failed to persist generated CV:', persistError instanceof Error ? persistError.message : persistError);
        logReservationEvent('persistence_failed', { userId: session.user.id, capability: 'cv_regeneration', operationId, resultType: 'generated_cv' });
        throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'persistence_failure' });
      }

      // The result is durably persisted. From here a failure must not release the
      // unit or re-run the provider — a retry finalises/recovers instead.
      persisted = true;
      logReservationEvent('persistence_succeeded', { userId: session.user.id, capability: 'cv_regeneration', operationId, resultType: 'generated_cv' });

      if (repairMode) {
        // Free, linked repair: record the new result against the original charge
        // (repairOfOperationId), consuming no additional quota unit.
        const repair = await commitRepair({
          userId: session.user.id,
          capability: 'cv_regeneration',
          originalOperationId: repairOfOperationId!,
          repairOperationId: operationId,
          resultRef: generatedCvId,
        });
        if (repair.status === 'not_committed') {
          logReservationEvent('finalisation_failed', { userId: session.user.id, capability: 'cv_regeneration', operationId, originalOperationId: repairOfOperationId! });
          throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'reservation_failure' });
        }
        // A repair re-produces an already-paid-for result: it consumes no unit.
        logReservationEvent('repair_committed', { userId: session.user.id, capability: 'cv_regeneration', operationId, originalOperationId: repairOfOperationId!, resultType: 'generated_cv', charged: false });
      } else {
        // Commit exactly once, with the persisted id as the recovery reference.
        const commit = await commitCapability({
          userId: session.user.id,
          capability: 'cv_regeneration',
          operationId,
          resultRef: generatedCvId,
        });
        if (commit.status !== 'committed') {
          logReservationEvent('finalisation_failed', { userId: session.user.id, capability: 'cv_regeneration', operationId });
          throw new AiOperationError({ capability: 'cv_regeneration', operationId, reason: 'reservation_failure' });
        }
        reservationHeld = false;
        logReservationEvent('reservation_committed', { userId: session.user.id, capability: 'cv_regeneration', operationId, resultType: 'generated_cv', charged: true });
      }

      return docxResponse(docxBuffer);
    } catch (error) {
      if (!persisted) {
        // Any failure before persistence returns the held unit to the pool.
        await releaseGen(
          error instanceof AiOperationError
            ? error.reason
            : error instanceof APIError && error.statusCode === 422
              ? 'truthfulness_failure'
              : 'unknown'
        );
      }
      // A persisted result is never un-charged here: the commit-failure path
      // leaves the reservation intact so an explicit retry can finalise/recover.
      throw error;
    }
  });
}
