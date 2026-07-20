import { NextRequest, NextResponse } from 'next/server';
import { analyzeCV, computeOverallScore, evidenceCoverageScore } from '@/shared/utils/scoring-engine';
import { classifyCV } from '@/shared/services/classifier';
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
import { checkQuota, recordUsage } from '@/shared/services/usage-meter';
import { cleanJobTitle, cleanJobCompany, deriveJobTitleFromJd } from '@/shared/utils/job-title';
import { resolveProfileId } from '@/features/dashboard/data/load-profile';
import type { CVAnalysisResult } from '@/shared/types/cv';

/**
 * Persist a completed analysis and archive the original upload to object storage.
 * Best-effort: a DB or storage failure must never break the response the user
 * already paid an AI call for. The raw file is uploaded under the analysis id
 * so it can be re-analysed or re-downloaded later without a re-upload.
 */
async function persistAnalysis(
  userId: string,
  profileId: string | null,
  entitlements: Entitlements,
  result: CVAnalysisResult,
  sourceFileName: string,
  sourceFile: Buffer,
  sourceContentType: string
): Promise<void> {
  try {
    const analysis = await prisma.analysis.create({
      data: {
        userId,
        // Files this analysis under the career track that was active, so the
        // engineering profile's history doesn't fill up with warehouse matches.
        profileId,
        mode: result.mode ?? 'ats',
        overallScore: result.overallScore,
        rawResult: JSON.parse(JSON.stringify(result)),
        jobDescription: result.jobDescription ?? null,
        jobMatchData: result.jobMatchData ? JSON.parse(JSON.stringify(result.jobMatchData)) : undefined,
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
  } catch (error) {
    console.warn('[analyze] Failed to persist analysis:', error instanceof Error ? error.message : error);
  }
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

    const tier = await prisma.user
      .findUnique({ where: { id: session.user.id }, select: { subscriptionTier: true } })
      .then((u) => u?.subscriptionTier ?? null);
    const entitlements = entitlementsFor(tier);

    const formData = await request.formData();
    
    const parsed = AnalyzeRequestSchema.safeParse({
      file: formData.get('file'),
      mode: formData.get('mode') || 'ats',
      jobDescription: formData.get('jobDescription') || '',
      profileId: formData.get('profileId') || undefined,
    });

    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { file, mode, jobDescription, profileId } = parsed.data;

    // Which career track this run belongs to. Resolved before the AI call so an
    // analysis is never left unfiled after the expensive part has already run.
    const scopedProfileId = await resolveProfileId(session.user.id, profileId);

    // Whether this request will actually invoke a model. Rule-based ATS scoring
    // is free and uncapped; only the AI layer is metered, so a user out of AI
    // quota still gets their local score rather than an outright refusal.
    const usesAI = mode === 'job_match' ? jobDescription.trim().length > 0 : true;

    let aiAllowed = true;
    if (usesAI) {
      const quota = await checkQuota(session.user.id, 'aiAnalyses', entitlements);
      aiAllowed = quota.allowed;

      if (!aiAllowed) {
        // A job match without the model isn't a degraded job match, it's an ATS
        // score wearing the wrong label — there would be no match score, no
        // skill gaps, no eligibility check. Refuse outright rather than hand
        // back something that reads like a match and isn't one.
        if (mode === 'job_match') {
          throw new APIError(
            `You've used all ${quota.limit} AI analyses in your plan this month. Your allowance resets at the start of next month.`,
            429
          );
        }
        // An ATS check degrades honestly: the rule-based score is the bulk of
        // it, so serve that rather than nothing. `aiSkipped` tells the UI to say
        // so instead of quietly showing a thinner report.
        console.info(
          `[analyze] AI quota exhausted for user ${session.user.id} (${quota.used}/${quota.limit}); serving rule-based result.`
        );
      }
    }

    // 1. Decoupled PDF Extraction
    const { text, pageCount } = await extractTextFromPDF(file);

    if (!text || text.trim().length < 50) {
      throw new APIError('Could not extract text from PDF. The file may be image-based or corrupted.', 400);
    }

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

    const classification = await classifyCV({
      cvText: text,
      jobDescription: mode === 'job_match' && jobDescription.trim() ? jobDescription : undefined,
      profileTarget: trackProfile
        ? {
            occupation: trackProfile.targetOccupation,
            roleTitle: trackProfile.targetRoleTitle ?? trackProfile.label,
            industry: trackProfile.targetIndustry,
            seniority: trackProfile.targetSeniority,
          }
        : undefined,
      aiAllowed,
    });
    const occupationProfile = getOccupationProfile(classification.occupation);

    // 3. Local rule-based analysis, occupation-aware from the first pass.
    const result = analyzeCV(text, pageCount, { classification, profile: occupationProfile });
    result.aiDetectedIndustry = classification.sector;
    result.outOfDomain = classification.confidence < 0.5 || classification.source === 'fallback';

    // 4. AI semantic analysis as a hybrid layer
    result.mode = mode as 'ats' | 'job_match';

    try {
      if (!aiAllowed) {
        // Out of AI quota, ATS mode. The local scores above stand as the result.
        result.aiSkipped = 'quota';
      } else if (mode === 'job_match' && jobDescription.trim().length > 0) {
        const jobMatchFeedback = await getJobMatchFeedback(text, jobDescription, occupationProfile, classification);
        if (jobMatchFeedback) {
          // Counted on return rather than before the call, so a provider outage
          // doesn't bill the user for an analysis they never received.
          await recordUsage(session.user.id, 'aiAnalyses');
          result.jobMatchData = jobMatchFeedback;
          result.jobDescription = jobDescription;
          // In job-match mode the headline score IS the match score, so the saved
          // overallScore (history table, trend, averages) agrees with the report's
          // dial instead of showing the generic local ATS score.
          result.overallScore = jobMatchFeedback.matchScore;
        }
      } else {
        const aiFeedback = await getSemanticCVFeedback(text, result, occupationProfile, classification);

        if (aiFeedback) {
          await recordUsage(session.user.id, 'aiAnalyses');

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
        }
      }
    } catch (aiError) {
      console.warn('AI semantic processing failed, falling back to local analysis results:', aiError instanceof Error ? aiError.message : aiError);
    }

    const sourceBuffer = Buffer.from(await file.arrayBuffer());
    await persistAnalysis(
      session.user.id,
      scopedProfileId,
      entitlements,
      result,
      file.name || 'CV.pdf',
      sourceBuffer,
      file.type || 'application/pdf'
    );

    return NextResponse.json(result);
  });
}
