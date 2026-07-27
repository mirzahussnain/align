import { NextRequest, NextResponse } from 'next/server';
import { analyzeCV, computeOverallScore, evidenceCoverageScore } from '@/shared/utils/scoring-engine';
import { resolveAnalysisContext } from '@/shared/services/analysis-context';
import { getOccupationProfile } from '@/shared/occupations/registry';
import { getIndustryDictionary } from '@/shared/constants/sector-keywords';
import { extractTextFromPDF } from '@/shared/utils/pdf-parser';
import { getSemanticCVFeedback, getJobMatchFeedback } from '@/shared/services/ai-analyser';
import { statusFor } from '@/shared/constants/scoring-config';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { AnalyzeRequestSchema } from './schema';
import { applyRateLimit, analysisLimiter } from '@/shared/lib/rate-limit';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { storage, keyFor } from '@/shared/lib/storage';
import { entitlementsFor, sourceExpiryFrom, type Entitlements } from '@/shared/lib/entitlements';
import { pruneAnalyses, sweepExpiredSources } from '@/shared/services/storage-quota';
import {
  checkCapability,
  EntitlementRequiredError,
  assertCapability,
  getUserPlan,
} from '@/shared/entitlements/server';
import {
  reserveCapability,
  commitCapability,
  releaseCapability,
  reservationFingerprint,
  hashContent,
} from '@/shared/services/capability-reservation';
import {
  AiOperationError,
  OperationConflictError,
  OperationInProgressError,
  markOperationRunning,
  reservationIsRunning,
} from '@/shared/services/ai-failure';
import { projectAnalysisReport } from '@/shared/entitlements/report-projection';
import { loadCanonicalAnalysis } from '@/shared/services/canonical-analysis';
import { logReservationEvent } from '@/shared/services/reservation-observability';
import type { ProductCapability } from '@/shared/entitlements/registry';
import { cleanJobTitle, cleanJobCompany, deriveJobTitleFromJd } from '@/shared/utils/job-title';
import { loadProfileTarget, resolveProfileId } from '@/features/dashboard/data/load-profile';
import { recordFirstValueIfOnboarding } from '@/shared/services/onboarding';
import type { CVAnalysisResult } from '@/shared/types/cv';
import { JobMatchDataV2Schema } from '@/shared/schemas/ai-output';

/**
 * Persist a completed analysis and archive the original upload to object storage.
 * Best-effort: a DB or storage failure must never break the response the user
 * already paid an AI call for. The raw file is uploaded under the analysis id
 * so it can be re-analysed or re-downloaded later without a re-upload.
 *
 * Returns the new analysis id so the caller can hand it back to the client — the
 * results screen needs it to rebuild a tailored CV from this exact analysis.
 * Returns null when the DB write itself failed (there is then no id to expose).
 */
async function persistAnalysis(
  userId: string,
  profileId: string | null,
  entitlements: Entitlements,
  result: CVAnalysisResult,
  sourceFileName: string,
  sourceFile: Buffer,
  sourceContentType: string
): Promise<string | null> {
  try {
    // Analysis.jobMatchData is the canonical job-match payload. New writes do
    // not embed a second copy in rawResult, preventing the two JSON blobs from
    // drifting when readers evolve independently.
    const { jobMatchData: canonicalJobMatchData, ...rawResultWithoutJobMatch } = result;
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        // Files this analysis under the career track that was active, so the
        // engineering profile's history doesn't fill up with warehouse matches.
        profileId,
        mode: result.mode ?? 'ats',
        overallScore: result.overallScore,
        rawResult: JSON.parse(JSON.stringify(rawResultWithoutJobMatch)),
        jobDescription: result.jobDescription ?? null,
        jobMatchData: canonicalJobMatchData
          ? JSON.parse(JSON.stringify(canonicalJobMatchData))
          : undefined,
        // Promoted out of the match blob into columns so a history row can say
        // "Senior Data Engineer at FinCore" without deserialising the whole
        // payload. Sanitised, because the model is asked not to return a section
        // heading but nothing stops it doing so anyway.
        // The model's extraction first; the JD's own opening lines only if it
        // returned nothing usable. Both may yield null — plenty of listings
        // never state a title, and the history table falls back to the filename.
        jobTitle:
          cleanJobTitle(result.jobMatchData?.jobTitle) ??
          deriveJobTitleFromJd(result.jobDescription),
        jobCompany: cleanJobCompany(result.jobMatchData?.jobCompany),
        sourceFileName,
        // Version stamps and promoted classification columns (scoring v2) —
        // how stored scores are interpreted without guessing which formula
        // produced them.
        scoringVersion: result.scoringVersion ?? null,
        profileVersion: result.profileVersion ?? null,
        dictionaryVersion: result.dictionaryVersion ?? null,
        occupation: result.classification?.occupation ?? null,
        applicationWorkflow: result.classification?.applicationWorkflow ?? null,
        classification: result.classification
          ? JSON.parse(JSON.stringify(result.classification))
          : undefined,
      },
    });

    try {
      const key = keyFor.upload(userId, analysis.id, sourceFileName);
      await storage.upload({ bucket: 'uploads', key, body: sourceFile, contentType: sourceContentType });
      // Size and expiry are recorded at archive time so quota can be summed
      // from the DB, and retention swept, without ever listing the bucket.
      await prisma.analysis.update({
        where: { id: analysis.id },
        data: {
          sourceFileKey: key,
          sourceFileSize: sourceFile.byteLength,
          sourceExpiresAt: sourceExpiryFrom(entitlements),
        },
      });
    } catch (storageError) {
      // The analysis row still stands; only the archived file is missing.
      console.warn('[analyze] Failed to archive source file:', storageError instanceof Error ? storageError.message : storageError);
    }

    // Keep the user inside their tier's caps. Both are best-effort and never
    // throw, so a pruning failure can't cost the user the analysis itself.
    await pruneAnalyses(userId, entitlements);
    await sweepExpiredSources(userId);

    return analysis.id;
  } catch (error) {
    console.warn('[analyze] Failed to persist analysis:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Project a completed CVAnalysisResult into the plan-gated response shape. Shared
 * by the fresh-analysis path and committed recovery so both return the identical
 * projection for the same result.
 */
async function projectForUser(
  userId: string,
  result: CVAnalysisResult,
  mode: 'ats' | 'job_match'
): Promise<NextResponse> {
  const [report, requirementLedger, rewriteStrategy, eligibility] = await Promise.all([
    checkCapability(userId, mode === 'job_match' ? 'view_full_job_match_report' : 'view_full_ats_report'),
    checkCapability(userId, 'view_requirement_ledger'),
    checkCapability(userId, 'view_rewrite_strategy'),
    checkCapability(userId, 'view_eligibility_analysis'),
  ]);
  return NextResponse.json(
    projectAnalysisReport(result, { report, requirementLedger, rewriteStrategy, eligibility })
  );
}

/**
 * Recover a committed AI analysis without rerunning the model. The reservation
 * for this operation already committed, so the persisted Analysis is the
 * authoritative result: load it from canonical storage, verify it belongs to the
 * user and matches the operation's mode, rehydrate the stored result and return
 * its current plan projection. A missing/unreadable row means the committed
 * result is unrecoverable — the reservation stays charged and the caller reports
 * RESULT_UNAVAILABLE rather than silently re-billing a fresh run.
 */
async function recoverCommittedAnalysis(
  userId: string,
  mode: 'ats' | 'job_match',
  resultRef: string | null
): Promise<NextResponse | null> {
  if (!resultRef) return null;
  // Result recovery is an internal workflow: read the COMPLETE canonical analysis
  // from trusted storage (ownership-checked, schema-validated), never the
  // plan-projected report shape. Projection is applied afterwards by
  // projectForUser for the user-facing response.
  const canonical = await loadCanonicalAnalysis({
    userId,
    analysisId: resultRef,
    requireJobMatch: mode === 'job_match',
  });
  if (!canonical.ok || canonical.analysis.mode !== mode) return null;

  const result: CVAnalysisResult = {
    ...canonical.analysis.result,
    ...(canonical.analysis.jobMatchData ? { jobMatchData: canonical.analysis.jobMatchData } : {}),
    analysisId: canonical.analysis.id,
  };
  return projectForUser(userId, result, mode);
}

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    // AI analysis is gated behind authentication so the LLM endpoints can't be
    // abused anonymously. The signed-in user is also who we persist results for.
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      throw new APIError('Please sign in to analyze your CV.', 401);
    }

    const rateLimitResponse = await applyRateLimit(analysisLimiter, session.user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // Storage/retention limits derive from the effective plan (resolveBillingAccess
    // via getUserPlan), never the legacy subscriptionTier column.
    const entitlements = entitlementsFor(await getUserPlan(session.user.id));

    const formData = await request.formData();
    
    const parsed = AnalyzeRequestSchema.safeParse({
      file: formData.get('file'),
      mode: formData.get('mode') || 'ats',
      jobDescription: formData.get('jobDescription') || '',
      profileId: formData.get('profileId') || undefined,
      targetSelection: formData.get('targetSelection') || undefined,
      savedProfileId: formData.get('savedProfileId') || undefined,
      targetRole: formData.get('targetRole') || undefined,
      targetOccupation: formData.get('targetOccupation') || undefined,
      evidenceSource: formData.get('evidenceSource') || undefined,
      confirmProfileTarget: formData.get('confirmProfileTarget') ?? undefined,
    });

    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const {
      file,
      mode,
      jobDescription,
      profileId,
      targetSelection,
      savedProfileId,
      targetRole,
      targetOccupation,
      evidenceSource,
      confirmProfileTarget,
    } = parsed.data;

    if (mode === 'ats') await assertCapability(session.user.id, 'ats_analysis');

    // Evidence-source feature gate. The contract knows about Profile-backed
    // evidence, but only the CV-only scoring path exists today — anything else is
    // rejected here rather than silently ignored, so the UI can never present a
    // control that has no effect. Rejected before any quota check or model call.
    if (evidenceSource !== 'cv_only') {
      throw new APIError(
        'Profile-backed evidence is not available yet — analyse against the uploaded CV.',
        400
      );
    }

    // The user's explicit "What is this CV intended for?" answer. Absent behaves
    // as `detected` (the CV decides), which keeps the active-Profile leak closed.
    // Legacy clients that only send targetRole/confirmProfileTarget are mapped to
    // the equivalent selection. Job match ignores this entirely — its target is
    // always the JD.
    const effectiveTargetSelection =
      targetSelection ??
      (targetRole || targetOccupation
        ? 'custom_role'
        : confirmProfileTarget
          ? 'active_profile'
          : 'detected');

    // A "choose another saved Profile target" selection is resolved and
    // ownership-checked server-side; an unowned id is rejected, never trusted.
    let savedProfileTarget: Awaited<ReturnType<typeof loadProfileTarget>> = null;
    if (mode === 'ats' && effectiveTargetSelection === 'saved_profile' && savedProfileId) {
      savedProfileTarget = await loadProfileTarget(session.user.id, savedProfileId);
      if (!savedProfileTarget) {
        throw new APIError('The selected profile target could not be found.', 403);
      }
    }

    // Which career track this run belongs to. Resolved before the AI call so an
    // analysis is never left unfiled after the expensive part has already run.
    const scopedProfileId = await resolveProfileId(session.user.id, profileId);

    // Whether this request will actually invoke a model. Rule-based ATS scoring
    // is free and uncapped; only the AI layer is metered, so a user out of AI
    // quota still gets their local score rather than an outright refusal.
    const usesAI = mode === 'job_match' ? jobDescription.trim().length > 0 : true;
    const aiCapability: ProductCapability =
      mode === 'job_match' ? 'job_match_analysis' : 'ai_enhanced_ats_analysis';
    const operationId = request.headers.get('x-operation-id') ?? crypto.randomUUID();

    // 1. Decoupled PDF Extraction — deterministic and unmetered, done BEFORE any
    // reservation so an unreadable file is rejected without ever holding a unit
    // and so the cleaned text can seed the request fingerprint.
    const { text, pageCount } = await extractTextFromPDF(file);

    if (!text || text.trim().length < 50) {
      throw new APIError('Could not extract text from PDF. The file may be image-based or corrupted.', 400);
    }

    // ── Atomic AI reservation (canonical ordering) ──────────────────────────
    // A unit is held here, before the provider call, and released on any failure
    // before commit. Deterministic ATS never reaches this block; a quota-exhausted
    // ATS request degrades to the rule-based score with no reservation at all.
    let aiAllowed = true;
    let aiSucceeded = false;
    let reservationHeld = false;
    if (usesAI) {
      logReservationEvent('operation_started', {
        userId: session.user.id,
        capability: aiCapability,
        operationId,
        resultType: 'analysis',
      });
      const fingerprint = reservationFingerprint([
        aiCapability,
        session.user.id,
        mode,
        hashContent(text),
        mode === 'job_match' ? hashContent(jobDescription) : '',
        scopedProfileId ?? '',
        effectiveTargetSelection,
      ]);

      let reserve;
      try {
        reserve = await reserveCapability({
          userId: session.user.id,
          capability: aiCapability,
          operationId,
          fingerprint,
        });
      } catch (error) {
        // Authoritative enforcement failure: fail closed. A ledger read/write
        // error is never interpreted as zero usage, and no provider is called.
        console.error(
          '[analyze] Reservation ledger unavailable; failing closed:',
          error instanceof Error ? error.message : error
        );
        throw new AiOperationError({ capability: aiCapability, operationId, reason: 'reservation_failure' });
      }

      if (reserve.status === 'conflict') {
        logReservationEvent('fingerprint_conflict', { userId: session.user.id, capability: aiCapability, operationId });
        throw new OperationConflictError(aiCapability, operationId);
      }
      if (reserve.status === 'recovered') {
        // This operation already committed — return the stored analysis, never rerun.
        const recovered = await recoverCommittedAnalysis(
          session.user.id,
          mode,
          reserve.reservation.resultRef
        );
        if (recovered) {
          logReservationEvent('committed_result_recovered', { userId: session.user.id, capability: aiCapability, operationId, resultType: 'analysis' });
          return recovered;
        }
        // The committed result is gone. Stay charged; report unavailability.
        logReservationEvent('result_unavailable', { userId: session.user.id, capability: aiCapability, operationId, charged: true, retryable: false });
        throw new AiOperationError({
          capability: aiCapability,
          operationId,
          reason: 'result_unavailable',
          charged: true,
        });
      }
      if (reserve.status === 'exhausted') {
        // A job match without the model is not a degraded job match — refuse it.
        if (mode === 'job_match') throw new EntitlementRequiredError(reserve.decision);
        // ATS degrades honestly to the rule-based score; no unit is held.
        aiAllowed = false;
        console.info(
          `[analyze] AI quota exhausted for user ${session.user.id}; serving rule-based result.`
        );
      } else if (reserve.status === 'reserved') {
        if (reservationIsRunning(reserve.reservation)) {
          logReservationEvent('duplicate_operation_detected', { userId: session.user.id, capability: aiCapability, operationId });
          throw new OperationInProgressError(aiCapability, operationId);
        }
        await markOperationRunning(session.user.id, aiCapability, operationId);
        reservationHeld = true;
        logReservationEvent('operation_running', { userId: session.user.id, capability: aiCapability, operationId, resultType: 'analysis' });
      }
    }

    /** Release the held unit for a safe reason; a no-op when nothing is held. */
    const releaseAi = async (reason: string) => {
      if (!reservationHeld) return;
      reservationHeld = false;
      await releaseCapability({
        userId: session.user.id,
        capability: aiCapability,
        operationId,
        reason,
      });
      logReservationEvent('reservation_released', { userId: session.user.id, capability: aiCapability, operationId, reason });
    };

    // 2. Classification BEFORE scoring — the deterministic pass runs against
    // the right occupation profile and sector dictionary from the start.
    // The structured targetOccupation wins; the free-text role title (or the
    // career-track label as a stand-in) still resolves deterministically.
    const trackProfile = scopedProfileId
      ? await prisma.profile.findUnique({
          where: { id: scopedProfileId },
          select: {
            label: true,
            targetIndustry: true,
            targetOccupation: true,
            targetRoleTitle: true,
            targetSeniority: true,
          },
        })
      : null;

    // The active Profile's declared target, offered as a *candidate* only. It is
    // handed to the resolver for the mismatch notice always, but it sets the
    // scoring target only when the user confirmed it (active_profile) — otherwise
    // a Warehouse CV uploaded under a Software profile is analysed as warehouse,
    // from the CV's own evidence, not silently as software.
    const activeProfileTarget =
      trackProfile && scopedProfileId
        ? {
            profileId: scopedProfileId,
            occupation: trackProfile.targetOccupation,
            roleTitle: trackProfile.targetRoleTitle ?? trackProfile.label,
            industry: trackProfile.targetIndustry,
            seniority: trackProfile.targetSeniority,
          }
        : undefined;

    // Map the explicit selection to resolver inputs. Every path that sets the
    // target requires an explicit user choice; `detected` (the default) never
    // lets the Profile decide. Job match ignores selection — the JD is the target.
    const isAts = mode === 'ats';
    const useCustomRole = isAts && effectiveTargetSelection === 'custom_role';
    const useSavedProfile = isAts && effectiveTargetSelection === 'saved_profile';
    const useActiveProfile = isAts && effectiveTargetSelection === 'active_profile';

    const { context: analysisContext, classification } = await resolveAnalysisContext({
      mode,
      cvText: text,
      jobDescription: mode === 'job_match' && jobDescription.trim() ? jobDescription : undefined,
      explicitTarget: useCustomRole
        ? { occupation: targetOccupation ?? null, roleTitle: targetRole ?? null }
        : undefined,
      // A chosen saved Profile target overrides the active one as the confirmed
      // target; otherwise the active Profile rides along for the mismatch notice.
      activeProfileTarget:
        useSavedProfile && savedProfileTarget
          ? {
              profileId: savedProfileTarget.profileId,
              occupation: savedProfileTarget.targetOccupation,
              roleTitle: savedProfileTarget.targetRoleTitle || savedProfileTarget.label,
              industry: savedProfileTarget.targetIndustry,
              seniority: savedProfileTarget.targetSeniority,
            }
          : activeProfileTarget,
      confirmProfileTarget: useActiveProfile || useSavedProfile,
      // Provenance only: which Profile the confirmed target belongs to, so
      // history records `saved_profile_confirmed` vs `active_profile_confirmed`.
      confirmedTargetKind: useSavedProfile ? 'saved' : 'active',
      forceGeneric: isAts && effectiveTargetSelection === 'generic',
      // Uploaded CVs are CV-evidence. Profile-as-evidence is a feature-gated,
      // deferred scoring path; the request boundary above rejects any other
      // evidence source, so this stays cv_only without ever changing the target.
      evidenceSource: { type: 'cv_only' },
      aiAllowed,
    });
    const occupationProfile = getOccupationProfile(classification.occupation);

    // 3. Local rule-based analysis, occupation-aware from the first pass.
    const result = analyzeCV(text, pageCount, { classification, profile: occupationProfile });
    // The real uploaded filename, so the File Name check audits it rather than a
    // hardcoded placeholder.
    result.fileName = file.name || undefined;
    result.aiDetectedIndustry = classification.sector;
    result.outOfDomain = classification.confidence < 0.5 || classification.source === 'fallback';
    // The explicit context (evidence source, target source, resolved target,
    // mismatch) rides inside rawResult — persisted with no migration and read
    // back intact by the loose stored-result schema.
    result.analysisContext = analysisContext;

    // 4. AI semantic analysis as a hybrid layer
    result.mode = mode as 'ats' | 'job_match';

    if (!aiAllowed) {
      // Out of AI quota, ATS mode. The local scores above stand as the result.
      result.aiSkipped = 'quota';
    } else if (mode === 'job_match' && jobDescription.trim().length > 0) {
      // Job match IS the AI output — a provider failure has no honest degraded
      // form, so release the held unit and return a retryable operational error.
      let jobMatchFeedback: Awaited<ReturnType<typeof getJobMatchFeedback>> = null;
      try {
        jobMatchFeedback = await getJobMatchFeedback(text, jobDescription, occupationProfile, classification);
      } catch (aiError) {
        console.warn('[analyze] Job-match provider failed:', aiError instanceof Error ? aiError.message : aiError);
      }
      if (!jobMatchFeedback) {
        await releaseAi('provider_unavailable');
        throw new AiOperationError({ capability: aiCapability, operationId, reason: 'provider_unavailable' });
      }
      aiSucceeded = true;
      result.aiApplied = true;
      result.jobMatchData = jobMatchFeedback;
      result.jobDescription = jobDescription;
      // In job-match mode the headline score IS the match score, so the saved
      // overallScore (history table, trend, averages) agrees with the report's
      // dial instead of showing the generic local ATS score.
      result.overallScore = jobMatchFeedback.matchScore;
    } else {
      // ATS enrichment is optional: a provider failure keeps the deterministic
      // score and degrades honestly rather than erroring.
      let aiFeedback: Awaited<ReturnType<typeof getSemanticCVFeedback>> = null;
      try {
        aiFeedback = await getSemanticCVFeedback(text, result, occupationProfile, classification);
      } catch (aiError) {
        console.warn('AI semantic processing failed, falling back to local analysis results:', aiError instanceof Error ? aiError.message : aiError);
      }

      if (aiFeedback) {
        aiSucceeded = true;
        result.aiApplied = true;

          const summaryCat = result.categories.find(c => c.id === 'professionalSummary');
          if (summaryCat) {
            summaryCat.score = aiFeedback.summaryScore;
            summaryCat.details = aiFeedback.summaryFeedback;
            summaryCat.status = statusFor(aiFeedback.summaryScore, summaryCat.maxScore);
          }

          const impactCat = result.categories.find(c => c.id === 'impactStatements');
          if (impactCat) {
            impactCat.score = aiFeedback.impactScore;
            impactCat.details = aiFeedback.impactFeedback;
            impactCat.status = statusFor(aiFeedback.impactScore, impactCat.maxScore);
          }

          for (const rewrite of aiFeedback.rewrites) {
            result.recommendations.push({
              priority: 'high',
              title: `Rewrite bullet: "${rewrite.original.slice(0, 45)}..."`,
              description: `Suggested rewrite: "${rewrite.suggested}"\n\nRationale: ${rewrite.rationale}`,
              timeEstimate: '10 min',
              kind: 'rewrite',
            });
          }

          if (aiFeedback.alignmentNote) {
            result.recommendations.push({
              priority: 'medium',
              title: 'Role Alignment Feedback',
              description: aiFeedback.alignmentNote,
              timeEstimate: '5 min',
              kind: 'alignment',
            });
          }

          for (const add of aiFeedback.additionalKeywords) {
            const exists = result.keywords.present.some(
              p => p.keyword.toLowerCase() === add.keyword.toLowerCase()
            );
            if (!exists) {
              result.keywords.present.push({
                keyword: add.keyword,
                category: add.category,
                count: add.count,
              });
            }
          }

          // Recompute Evidence Coverage now the AI has surfaced extra
          // role-relevant keywords the parser's dictionary pass missed.
          const coverageCat = result.categories.find(c => c.id === 'evidenceCoverage');
          if (coverageCat) {
            const { present, missing } = result.keywords;
            const total = present.length + missing.length;
            const sectorLabel = getIndustryDictionary(classification.sector)?.label ?? 'this role';

            coverageCat.score =
              total === 0
                ? // No dictionary terms for this CV — score off the keywords the
                  // AI itself found rather than dividing by zero.
                  Math.min(10, Math.round((present.length / 8) * 10))
                : evidenceCoverageScore(result.keywords);

            coverageCat.status = statusFor(coverageCat.score, coverageCat.maxScore);
            const percentage = Math.round((coverageCat.score / coverageCat.maxScore) * 100);
            coverageCat.details =
              total === 0
                ? `${percentage}% coverage of role-relevant keywords detected by AI for this CV's domain`
                : `${percentage}% of key UK ${sectorLabel} keywords present`;
          }

          // Map extended AI fields
          result.aiTargetRole = aiFeedback.detectedRole;
          result.aiAlignmentNote = aiFeedback.alignmentNote;
          result.aiRiskFlags = aiFeedback.riskFlags;
          result.aiClichés = aiFeedback.clichés;

        result.overallScore = computeOverallScore(result.categories);
      } else {
        // AI enrichment was allowed and reserved but produced nothing usable —
        // keep the deterministic score and mark it so the UI says so. The held
        // unit is released below since no AI result is being charged.
        result.aiSkipped = 'error';
      }
    }

    // A job-match response without a valid v2 ledger is not a degraded match.
    // Refuse it before persistence so every new job-match row satisfies the
    // canonical storage contract. A failure here releases the held unit.
    if (mode === 'job_match') {
      const canonicalJobMatch = JobMatchDataV2Schema.safeParse(result.jobMatchData);
      if (!canonicalJobMatch.success) {
        await releaseAi('schema_failure');
        throw new AiOperationError({ capability: aiCapability, operationId, reason: 'invalid_response' });
      }
      result.jobMatchData = canonicalJobMatch.data;
    }

    // A held ATS unit that never produced an AI result (provider failure) returns
    // to the pool — only successful, validated AI work is ever charged.
    if (reservationHeld && !aiSucceeded) {
      await releaseAi('provider_unavailable');
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    const analysisId = await persistAnalysis(
      session.user.id,
      scopedProfileId,
      entitlements,
      result,
      file.name || 'CV.pdf',
      sourceBuffer,
      file.type || 'application/pdf'
    );

    // Commit exactly once, and only after the analysis is durably persisted so
    // the reservation's resultRef points at a recoverable row. If persistence
    // failed there is nothing to charge for — release and surface the failure.
    if (aiSucceeded && reservationHeld) {
      if (!analysisId) {
        await releaseAi('persistence_failure');
        throw new AiOperationError({ capability: aiCapability, operationId, reason: 'persistence_failure' });
      }
      let committed = false;
      try {
        const commit = await commitCapability({
          userId: session.user.id,
          capability: aiCapability,
          operationId,
          resultRef: analysisId,
        });
        committed = commit.status === 'committed';
      } catch (error) {
        console.error('[analyze] Commit failed after persistence:', error instanceof Error ? error.message : error);
      }
      if (!committed) {
        // The result is persisted and safe; the usage commit did not land. Do not
        // re-run the provider — surface a retryable finalisation error. A retry
        // with the same operation id recovers the committed result if the commit
        // in fact succeeded, or re-finalises otherwise.
        logReservationEvent('finalisation_failed', { userId: session.user.id, capability: aiCapability, operationId });
        throw new AiOperationError({ capability: aiCapability, operationId, reason: 'reservation_failure' });
      }
      reservationHeld = false;
      logReservationEvent('reservation_committed', { userId: session.user.id, capability: aiCapability, operationId, resultType: 'analysis', charged: true });
    }

    // Exposed only on the response, never persisted into the row's own blob.
    // The results screen threads this into the rewrite wizard so a fresh
    // analysis can be rebuilt into a CV without re-uploading the source.
    if (analysisId) result.analysisId = analysisId;

    // First value, recorded server-side from what actually happened rather than
    // from anything the client claims. A deterministic ATS result counts: a Free
    // user whose AI quota is spent has still received a useful outcome, and
    // onboarding must not require a paid operation to finish.
    if (analysisId) {
      await recordFirstValueIfOnboarding({
        userId: session.user.id,
        firstValueType:
          mode === 'job_match' ? 'JOB_MATCH' : aiSucceeded ? 'AI_ATS' : 'DETERMINISTIC_ATS',
        firstValueRef: analysisId,
      });
    }

    return projectForUser(session.user.id, result, mode);
  });
}
