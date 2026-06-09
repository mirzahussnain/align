import { NextRequest, NextResponse } from 'next/server';
import { analyzeCV } from '@/shared/utils/scoring-engine';
import { extractTextFromPDF } from '@/shared/utils/pdf-parser';
import { getSemanticCVFeedback, getJobMatchFeedback } from '@/shared/services/ai-analyser';
import { SCORING_WEIGHTS } from '@/shared/constants/scoring-config';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { AnalyzeRequestSchema } from './schema';

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const formData = await request.formData();
    
    const parsed = AnalyzeRequestSchema.safeParse({
      file: formData.get('file'),
      mode: formData.get('mode') || 'ats',
      jobDescription: formData.get('jobDescription') || '',
    });

    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const { file, mode, jobDescription } = parsed.data;

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
      if (mode === 'job_match' && jobDescription.trim().length > 0) {
        const jobMatchFeedback = await getJobMatchFeedback(text, jobDescription);
        if (jobMatchFeedback) {
          result.jobMatchData = jobMatchFeedback;
          result.jobDescription = jobDescription;
        }
      } else {
        const aiFeedback = await getSemanticCVFeedback(text, result);
        
        if (aiFeedback) {
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
