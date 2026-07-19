import { NextRequest, NextResponse } from 'next/server';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import { analyzeKeywords } from '@/shared/utils/scoring/keywords';
import { getIndustryDictionary, isKnownIndustry } from '@/shared/constants/industry-keywords';
import { extractTextFromPDF } from '@/shared/utils/pdf-parser';
import { getSemanticCVFeedback, getJobMatchFeedback } from '@/shared/services/ai-analyser';
import { SCORING_WEIGHTS } from '@/shared/constants/scoring-config';
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

    // 2. Local rule-based analysis
    const result = analyzeCV(text, pageCount);

    // 3. AI semantic analysis as a hybrid layer
    result.mode = mode as 'ats' | 'job_match';

    try {
      if (!aiAllowed) {
        // Out of AI quota, ATS mode. The local scores above stand as the result.
        result.aiSkipped = 'quota';
      } else if (mode === 'job_match' && jobDescription.trim().length > 0) {
        const jobMatchFeedback = await getJobMatchFeedback(text, jobDescription);
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
        const aiFeedback = await getSemanticCVFeedback(text, result);

        if (aiFeedback) {
          await recordUsage(session.user.id, 'aiAnalyses');

          // The local pass ran before anything knew what field this CV belongs
          // to, so it scored against the default tech dictionary. Now that the
          // AI has classified the CV, run the keyword pass again against the
          // right dictionary and let it replace that guess.
          const detectedIndustry = isKnownIndustry(aiFeedback.detectedIndustry)
            ? aiFeedback.detectedIndustry
            : 'general';
          result.keywords = analyzeKeywords(text, { industry: detectedIndustry });
          result.aiDetectedIndustry = detectedIndustry;

          const summaryCat = result.categories.find(c => c.id === 'professionalSummary');
          if (summaryCat) {
            summaryCat.score = aiFeedback.summaryScore;
            summaryCat.details = aiFeedback.summaryFeedback;
            summaryCat.status = getStatus(aiFeedback.summaryScore, summaryCat.maxScore);
          }

          const impactCat = result.categories.find(c => c.id === 'impactStatements');
          if (impactCat) {
            impactCat.score = aiFeedback.impactScore;
            impactCat.details = aiFeedback.impactFeedback;
            impactCat.status = getStatus(aiFeedback.impactScore, impactCat.maxScore);
          }

          for (const rewrite of aiFeedback.rewrites) {
            result.recommendations.push({
              priority: 'high',
              title: `Rewrite bullet: "${rewrite.original.slice(0, 45)}..."`,
              description: `Suggested rewrite: "${rewrite.suggested}"\n\nRationale: ${rewrite.rationale}`,
              timeEstimate: '10 min',
            });
          }

          if (aiFeedback.isTechRole) {
            result.recommendations.push({
              priority: 'medium',
              title: 'UK Tech Market Alignment Feedback',
              description: aiFeedback.ukTechAlignment,
              timeEstimate: '5 min',
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

          // Recompute Keyword Coverage against the industry dictionary the AI
          // selected, plus whatever extra keywords it surfaced from the CV itself.
          const keywordDensityCat = result.categories.find(c => c.id === 'keywordDensity');
          if (keywordDensityCat) {
            const { present, missing } = result.keywords;
            const total = present.length + missing.length;
            const industryLabel = getIndustryDictionary(detectedIndustry)?.label ?? 'this role';

            if (total === 0) {
              // No dictionary produced terms for this CV, so there is no
              // denominator to divide by — dividing here is what previously
              // yielded NaN and poisoned the overall score. Fall back to scoring
              // purely off the keywords the AI itself found.
              keywordDensityCat.score = Math.min(10, Math.round((present.length / 8) * 10));
            } else {
              keywordDensityCat.score = Math.round((present.length / total) * 10);
            }

            keywordDensityCat.status = getStatus(keywordDensityCat.score, keywordDensityCat.maxScore);
            const percentage = Math.round((keywordDensityCat.score / keywordDensityCat.maxScore) * 100);
            keywordDensityCat.details =
              total === 0
                ? `${percentage}% coverage of role-relevant keywords detected by AI for this CV's domain`
                : `${percentage}% of key UK ${industryLabel} keywords present`;
          }

          // Map extended AI fields
          result.aiTargetRole = aiFeedback.detectedRole;
          result.aiHasTesting = aiFeedback.hasTesting;
          result.aiIsTechRole = aiFeedback.isTechRole;
          result.aiRiskFlags = aiFeedback.riskFlags;
          result.aiClichés = aiFeedback.clichés;

          // Clean up false positives for non-tech roles
          if (!aiFeedback.isTechRole) {
            result.recommendations = result.recommendations.filter(
              r => !r.title.toLowerCase().includes('testing') && !r.title.toLowerCase().includes('cloud')
            );
          }

          const overallScore = Math.round(
            result.categories.reduce((sum, cat) => {
              const weight = SCORING_WEIGHTS[cat.id as keyof typeof SCORING_WEIGHTS] || 0.1;
              return sum + (cat.score / cat.maxScore) * weight * 100;
            }, 0)
          );
          result.overallScore = overallScore;
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

function getStatus(score: number, maxScore: number): 'excellent' | 'good' | 'needs-improvement' | 'critical' {
  const percentage = (score / maxScore) * 100;
  if (percentage >= 85) return 'excellent';
  if (percentage >= 70) return 'good';
  if (percentage >= 50) return 'needs-improvement';
  return 'critical';
}
