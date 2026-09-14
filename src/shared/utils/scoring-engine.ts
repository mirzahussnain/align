// ATS Scoring Engine — occupation-aware rule-based CV analysis (scoring v2).
//
// Classification happens BEFORE this runs; every dimension that has an
// occupation-shaped opinion (impact, sections, credentials, keywords) takes
// its rules from the supplied profile instead of assuming tech.

import { SCORING_WEIGHTS, statusFor } from '@/shared/constants/scoring-config';
import { SCORING_VERSION, DICTIONARY_VERSION } from '@/shared/constants/versions';
import { genericProfile } from '@/shared/occupations/profiles/generic';
import type { OccupationProfile } from '@/shared/occupations/types';
import type { Classification } from '@/shared/types/classification';
import type { CVAnalysisResult, CategoryScore, KeywordAnalysis } from '@/shared/types/cv';

import { analyzeKeywords } from './scoring/keywords';
import { analyzeSectionLayout } from './scoring/section-layout';
import { analyzeFormatting } from './scoring/formatting';
import { analyzeCompliance } from './scoring/compliance';
import { analyzeImpactStatements } from './scoring/impact';
import { analyzeCredentials } from './scoring/credentials';
import { analyzeProfessionalSummary } from './scoring/summary';
import { analyzeATSReadability } from './scoring/readability';
import { generateRecommendations } from './scoring/recommendations';

export interface AnalyzeContext {
  classification: Classification;
  profile: OccupationProfile;
}

/** Neutral context for callers that haven't classified (degraded paths, tests). */
export function fallbackContext(): AnalyzeContext {
  return {
    profile: genericProfile,
    classification: {
      occupation: 'generic',
      sector: 'general',
      roleArchetype: 'generic',
      applicationWorkflow: 'cv_led',
      primaryArtifact: 'cv',
      secondaryArtifacts: [],
      seniority: 'unknown',
      regulated: false,
      confidence: 0.3,
      source: 'fallback',
      reasonCodes: ['FALLBACK'],
    },
  };
}

export function analyzeCV(text: string, pageCount: number, ctx: AnalyzeContext = fallbackContext()): CVAnalysisResult {
  const { classification, profile } = ctx;

  const keywords = analyzeKeywords(text, { industry: classification.sector });
  const sectionLayout = analyzeSectionLayout(text, profile, classification);
  const formatting = analyzeFormatting(text, pageCount);
  const compliance = analyzeCompliance(text);
  const credentials = analyzeCredentials(text, profile, classification);
  const impactScore = analyzeImpactStatements(text, profile);
  const summaryScore = analyzeProfessionalSummary(text);

  // Page count folds into formatting: issues are the base signal, an
  // over-length document is one more deduction rather than its own dimension.
  const criticalIssues = formatting.issues.filter(i => i.type === 'critical').length;
  const warningIssues = formatting.issues.filter(i => i.type === 'warning').length;
  const formattingScore = Math.max(3, 10 - criticalIssues * 3 - warningIssues);

  const categories: CategoryScore[] = [
    buildCategoryScore('formatting', 'Formatting & Parsability', formattingScore, 10),
    buildCategoryScore('compliance', 'UK Compliance', compliance.filter(c => c.passed).length, compliance.length),
    buildCategoryScore('atsReadability', 'ATS Readability', analyzeATSReadability(text), 10),
    buildCategoryScore('sectionCompleteness', 'Section Completeness', sectionLayout.score, 10),
    buildCategoryScore('evidenceCoverage', 'Evidence Coverage', evidenceCoverageScore(keywords), 10),
    buildCategoryScore(
      'credentials',
      'Credentials & Licences',
      credentials.score,
      10,
      credentials.notMaterial ? 'No role-critical credentials are expected for this occupation' : undefined
    ),
    buildCategoryScore('impactStatements', 'Impact Statements', impactScore, 10),
    buildCategoryScore('professionalSummary', 'Professional Summary', summaryScore, 10),
  ];

  const overallScore = computeOverallScore(categories);

  const recommendations = generateRecommendations(
    keywords,
    sectionLayout,
    formatting,
    compliance,
    credentials,
    profile
  );

  return {
    overallScore,
    categories,
    keywords,
    sectionOrder: sectionLayout,
    formatting,
    compliance,
    credentials,
    recommendations,
    rawText: text,
    pageCount,
    classification,
    scoringVersion: SCORING_VERSION,
    profileVersion: profile.version,
    dictionaryVersion: DICTIONARY_VERSION,
  };
}

/** Weighted overall from category scores — shared with the route's post-AI recompute. */
export function computeOverallScore(categories: CategoryScore[]): number {
  return Math.round(
    categories.reduce((sum, cat) => {
      const weight = SCORING_WEIGHTS[cat.id as keyof typeof SCORING_WEIGHTS] || 0;
      return sum + (cat.score / cat.maxScore) * weight * 100;
    }, 0)
  );
}

/**
 * Coverage as a 0-10 score. An empty analysis (no dictionary for the sector)
 * scores 0 rather than dividing by zero; the AI layer recomputes coverage for
 * that CV.
 */
export function evidenceCoverageScore(keywords: KeywordAnalysis): number {
  const total = keywords.present.length + keywords.missing.length;
  if (total === 0) return 0;
  return Math.round((keywords.present.length / total) * 10);
}

export function buildCategoryScore(
  id: string,
  label: string,
  score: number,
  maxScore: number,
  detailsOverride?: string
): CategoryScore {
  const status = statusFor(score, maxScore);
  const details = detailsOverride ?? getCategoryDetails(id, score, maxScore);
  return { id, label, score, maxScore, status, details };
}

function getCategoryDetails(id: string, score: number, maxScore: number): string {
  const percentage = Math.round((score / maxScore) * 100);

  const detailsMap: Record<string, string> = {
    formatting: score >= 8 ? 'Clean formatting detected' : 'Formatting issues found that may affect ATS parsing',
    compliance: score === maxScore ? 'Fully compliant with UK Equality Act 2010' : `${maxScore - score} compliance issue(s) found`,
    sectionCompleteness: score >= 8 ? 'CV structure fits this occupation' : 'CV structure could better fit this occupation',
    evidenceCoverage: `${percentage}% of the terms UK employers screen for are present`,
    credentials: score >= 8 ? 'Expected credentials are visible' : 'Expected credentials are missing or unclear',
    impactStatements: score >= 8 ? 'Strong evidence of impact throughout' : 'Add more specific, evidenced achievements',
    atsReadability: score >= 8 ? 'Highly readable by ATS systems' : 'ATS readability issues detected',
    professionalSummary: score >= 8 ? 'Professional summary is well-targeted' : 'Professional summary could be more specific to target role',
  };

  return detailsMap[id] || `Score: ${percentage}%`;
}
