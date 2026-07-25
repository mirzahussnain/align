import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { applyRateLimit, rewriteLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { rewriteCV } from '@/shared/services/cv-rewriter';
import { buildRewriteInput } from '@/shared/services/cv-rewrite-context';
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
import { assertCapability, consumeCapability } from '@/shared/entitlements/server';
import { entitlementsFor } from '@/shared/lib/entitlements';
import { AI_CONFIG } from '@/shared/lib/config';
import {
  renderCvDocx,
  persistAndArchiveCv,
  DOCX_CONTENT_TYPE,
} from '@/shared/services/cv-generation';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { TemplateIdSchema } from '@/shared/constants/templates';
import { resolveApprovedApplicationEvidence, StructuredEvidenceValidationError } from '@/shared/services/structured-evidence';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';

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

    const entitlements = entitlementsFor(
      await prisma.user
        .findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } })
        .then((u) => u?.subscriptionTier ?? null)
    );

    // Checked before the model call, so a user out of allowance gets a clean
    // refusal rather than a CV they were not entitled to generate.
    await assertCapability(session.user.id, 'cv_regeneration');

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

    const analysis = await prisma.analysis.findUnique({
      where: { id: analysisId },
      select: {
        userId: true,
        mode: true,
        rawResult: true,
        jobDescription: true,
        jobMatchData: true,
      },
    });

    if (!analysis || analysis.userId !== session.user.id) {
      throw new APIError('Analysis not found.', 404);
    }

    if (analysis.mode !== 'job_match') {
      throw new APIError('Only job-match analyses can be rebuilt into a CV.', 400);
    }

    // Validated, not cast: stored blobs from older engine versions must fail
    // loudly here rather than feed a rewrite undefined fields.
    const storedResult = parseStoredAnalysisResult(analysis.rawResult);
    if (!storedResult) {
      throw new APIError('This analysis is missing the data needed to rebuild a CV.', 400);
    }
    const rawResult = storedResult.result;
    const cvText = rawResult.rawText ?? '';
    const jobDescription = analysis.jobDescription ?? rawResult.jobDescription ?? '';

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
    // never converted back into the old mandatory/desirable arrays.
    const storedJobMatch = parseStoredJobMatchData(analysis.jobMatchData);
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
    const structuredRewrite = await rewriteCV(input);

    // Provider failure spends no quota.
    if (!structuredRewrite) {
      throw new APIError('Failed to generate CV content from AI', 500);
    }

    const provenanceValidation = validateStructuredRewriteProvenance(structuredRewrite, input);
    if (!provenanceValidation.ok) {
      console.warn(
        `[regenerate] Structured rewrite provenance rejected for analysis ${analysisId}: ${provenanceValidation.reasons.join(' | ')}`
      );
      throw new APIError('Generated CV content could not be verified against the supplied evidence.', 422);
    }
    const firstAdapter = structuredRewriteToRewrittenData(
      structuredRewrite,
      CV_TEMPLATE_CAPABILITIES[templateId].summaryMaxChars
    );

    // Truthfulness + unsupported-claim gate, with one controlled correction
    // attempt. A rejection persists nothing, charges nothing, and returns a
    // single retryable message. JD-only tools are drawn from unmet tool
    // requirements so a tool named only in the vacancy cannot slip in as claimed.
    const safety = await enforceGenerationSafety({
      input,
      firstDraft: {
        structured: structuredRewrite,
        ...firstAdapter,
      },
      durationFact,
      toolVocabulary: toolVocabularyFromRequirements(input.rewriteContext.requirements),
      rewrite: async (retryInput) => {
        const retry = await rewriteCV(retryInput);
        if (!retry) return null;
        const retryValidation = validateStructuredRewriteProvenance(retry, retryInput);
        if (!retryValidation.ok) return null;
        return {
          structured: retry,
          ...structuredRewriteToRewrittenData(
            retry,
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
    const docxBuffer = await renderCvDocx(buildSpec);

    // Rendering, provider output and every safety gate succeeded. A caller can
    // reuse x-operation-id across a network retry without consuming twice.
    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();
    await consumeCapability(session.user.id, 'cv_regeneration', operationId);

    try {
      await persistAndArchiveCv({
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
          model: AI_CONFIG.gemini.model,
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
    }

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="Tailored_CV.docx"',
      },
    });
  });
}
