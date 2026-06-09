// ATS Scoring Engine — Rule-based CV analysis facade

import { SCORING_WEIGHTS, SCORE_THRESHOLDS } from '@/shared/constants/scoring-config';
import type { CVAnalysisResult, CategoryScore } from '@/shared/types/cv';

import { analyzeKeywords } from './scoring/keywords';
import { analyzeSectionOrder } from './scoring/section-order';
import { analyzeFormatting } from './scoring/formatting';
import { analyzeCompliance } from './scoring/compliance';
import { analyzeImpactStatements } from './scoring/impact';
import { analyzeProfessionalSummary } from './scoring/summary';
import { analyzeATSReadability } from './scoring/readability';
import { generateRecommendations } from './scoring/recommendations';

export function analyzeCV(text: string, pageCount: number): CVAnalysisResult {
  const keywords = analyzeKeywords(text);
  const sectionOrder = analyzeSectionOrder(text);
  const formatting = analyzeFormatting(text, pageCount);
  const compliance = analyzeCompliance(text);
  const impactScore = analyzeImpactStatements(text);
  const summaryScore = analyzeProfessionalSummary(text);

  const categories: CategoryScore[] = [
    buildCategoryScore('formatting', 'Formatting & Parsability', formatting.issues.filter(i => i.type !== 'info').length === 0 ? 9 : Math.max(3, 10 - formatting.issues.filter(i => i.type === 'critical').length * 3 - formatting.issues.filter(i => i.type === 'warning').length), 10),
    buildCategoryScore('compliance', 'UK Compliance', compliance.filter(c => c.passed).length, compliance.length),
    buildCategoryScore('pageCount', 'Page Count', pageCount <= 2 ? (pageCount === 2 ? 9 : 10) : Math.max(3, 10 - (pageCount - 2) * 3), 10),
    buildCategoryScore('sectionOrder', 'Section Ordering', sectionOrder.isOptimal ? 10 : Math.max(3, 10 - sectionOrder.suggestions.length * 2), 10),
    buildCategoryScore('keywordDensity', 'Keyword Coverage', Math.round(keywords.present.length / (keywords.present.length + keywords.missing.length) * 10), 10),
    buildCategoryScore('impactStatements', 'Impact Statements', impactScore, 10),
    buildCategoryScore('atsReadability', 'ATS Readability', analyzeATSReadability(text), 10),
    buildCategoryScore('professionalSummary', 'Professional Summary', summaryScore, 10),
  ];

  const overallScore = Math.round(
    categories.reduce((sum, cat) => {
      const weight = SCORING_WEIGHTS[cat.id as keyof typeof SCORING_WEIGHTS] || 0.1;
      return sum + (cat.score / cat.maxScore) * weight * 100;
    }, 0)
  );

  const recommendations = generateRecommendations(categories, keywords, sectionOrder, formatting, compliance);

  return {
    overallScore,
    categories,
    keywords,
    sectionOrder,
    formatting,
    compliance,
    recommendations,
    rawText: text,
    pageCount,
  };
}

function buildCategoryScore(id: string, label: string, score: number, maxScore: number): CategoryScore {
  const percentage = (score / maxScore) * 100;
  let status: CategoryScore['status'];

  if (percentage >= SCORE_THRESHOLDS.excellent) status = 'excellent';
  else if (percentage >= SCORE_THRESHOLDS.good) status = 'good';
  else if (percentage >= SCORE_THRESHOLDS.needsImprovement) status = 'needs-improvement';
  else status = 'critical';

  const details = getCategoryDetails(id, score, maxScore);

  return { id, label, score, maxScore, status, details };
}

function getCategoryDetails(id: string, score: number, maxScore: number): string {
  const percentage = Math.round((score / maxScore) * 100);

  const detailsMap: Record<string, string> = {
    formatting: score >= 8 ? 'Clean formatting detected' : 'Formatting issues found that may affect ATS parsing',
    compliance: score === maxScore ? 'Fully compliant with UK Equality Act 2010' : `${maxScore - score} compliance issue(s) found`,
    pageCount: score >= 9 ? 'Optimal page count for UK market' : 'Page count could be improved',
    sectionOrder: score >= 8 ? 'Section ordering follows UK best practices' : 'Section ordering could be improved for UK recruiters',
    keywordDensity: `${percentage}% of key UK tech market keywords present`,
    impactStatements: score >= 8 ? 'Strong quantified achievements throughout' : 'Add more metrics and numbers to your achievements',
    atsReadability: score >= 8 ? 'Highly readable by ATS systems' : 'ATS readability issues detected',
    professionalSummary: score >= 8 ? 'Professional summary is well-targeted' : 'Professional summary could be more specific to target role',
  };

  return detailsMap[id] || `Score: ${percentage}%`;
}
