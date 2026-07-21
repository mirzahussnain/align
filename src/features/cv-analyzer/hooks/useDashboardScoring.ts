import { useMemo } from 'react';
import { CVAnalysisResult } from '@/shared/types/cv';
import { checkFileName } from '@/shared/utils/filename-check';

export function useDashboardScoring(
  result: CVAnalysisResult,
  data: {
    repeatedWords: { word: string, count: number }[];
    clichésList: { word: string, count: number }[];
    contactInfo: { email?: string; phone?: string; linkedin?: string };
    bulletConsistency: { endingWithoutPeriod: number };
    isEssentialSectionsPassed: boolean;
    isCompliancePassed: boolean;
    roleAligned: boolean;
    hasRiskFactor: boolean;
    targetRoleTitle: string;
  }
) {
  // Scoring v2 renamed three category ids; stored v1 rows rehydrate into this
  // same dashboard, so lookups accept the legacy id as a fallback.
  const findCategory = (...ids: string[]) =>
    result.categories.find(c => ids.includes(c.id));

  const getCategoryScorePercent = (id: string) => {
    const legacy: Record<string, string> = {
      evidenceCoverage: 'keywordDensity',
      sectionCompleteness: 'sectionOrder',
    };
    const cat = findCategory(id, legacy[id] ?? id);
    if (!cat) return 80;
    return Math.round((cat.score / cat.maxScore) * 100);
  };

  const getGroupScore = (groupId: string): number => {
    switch (groupId) {
      case 'overview':
        return result.overallScore;
      case 'content': {
        const parseRate = getCategoryScorePercent('atsReadability');
        const impact = getCategoryScorePercent('impactStatements');
        const summary = getCategoryScorePercent('professionalSummary');
        const keywords = getCategoryScorePercent('evidenceCoverage');
        return Math.round((parseRate + impact + summary + keywords) / 4);
      }
      case 'sections':
        return getCategoryScorePercent('sectionCompleteness');
      case 'ats-essentials': {
        // pageCount folded into formatting in scoring v2; derive size locally.
        const size = result.pageCount <= 2 ? 100 : 60;
        const design = getCategoryScorePercent('formatting');
        const parse = getCategoryScorePercent('atsReadability');
        return Math.round((size + design + parse) / 3);
      }
      case 'hr-red-flags': {
        // Derived from the three cards actually in this group (credibility,
        // interview risks, LinkedIn presence) rather than a number pulled off
        // the overall score, so the badge agrees with what's shown below it.
        const credibilityOk = data.clichésList.length <= 2;
        const riskOk = !data.hasRiskFactor;
        const linkedinOk = !!data.contactInfo.linkedin;
        const passed = [credibilityOk, riskOk, linkedinOk].filter(Boolean).length;
        return Math.round((passed / 3) * 100);
      }
      case 'discrimination':
        return Math.round((getCategoryScorePercent('compliance') + getCategoryScorePercent('credentials')) / 2);
      case 'seniority': {
        // Seniority comes from classification, not from grepping the CV for
        // "engineer" — a warehouse supervisor has seniority too.
        const known = result.classification
          ? result.classification.seniority !== 'unknown'
          : Boolean(data.targetRoleTitle);
        return known ? 90 : 70;
      }
      default:
        return 80;
    }
  };

  const totalIssues = useMemo(() => {
    const recsCount = result.recommendations.length;
    const formatCount = result.formatting.issues.length;
    const sizeCount = result.pageCount > 2 ? 1 : 0;
    const complianceCount = result.compliance.filter(c => !c.passed).length;
    return recsCount + formatCount + sizeCount + complianceCount;
  }, [result.recommendations, result.formatting, result.pageCount, result.compliance]);

  const getItemStatusAndBadge = (itemId: string): { isPassed: boolean; badgeText: string } => {
    switch (itemId) {
      case 'atsReadability': {
        const isPassed = !/[\u200b\u200c\u200d\ufeff]/.test(result.rawText);
        return { isPassed, badgeText: isPassed ? 'No issues' : '1 issue' };
      }
      case 'impactStatements': {
        const cat = findCategory('impactStatements');
        const isPassed = cat ? (cat.status === 'excellent' || cat.status === 'good') : true;
        const rewritesCount = result.recommendations.filter(
          r => r.kind === 'rewrite' || (!r.kind && r.title.startsWith('Rewrite bullet:'))
        ).length;
        return { isPassed, badgeText: isPassed ? 'No issues' : `${rewritesCount || 1} issues` };
      }
      case 'repetition': {
        const isPassed = data.repeatedWords.length <= 3;
        return { isPassed, badgeText: isPassed ? 'Good variety' : `${data.repeatedWords.length} repeats` };
      }
      case 'professionalSummary': {
        const cat = findCategory('professionalSummary');
        const isPassed = cat ? (cat.status === 'excellent' || cat.status === 'good') : true;
        return { isPassed, badgeText: isPassed ? 'No issues' : '1 issue' };
      }
      case 'keywordDensity': {
        const cat = findCategory('evidenceCoverage', 'keywordDensity');
        const isPassed = cat ? (cat.status === 'excellent' || cat.status === 'good') : true;
        const missingCount = result.keywords.missing.length;
        return { isPassed, badgeText: isPassed ? 'No issues' : `${missingCount} missing` };
      }
      case 'bulletsConsistency': {
        const isPassed = data.bulletConsistency.endingWithoutPeriod === 0;
        return { isPassed, badgeText: isPassed ? 'Consistent' : 'Mixed style' };
      }
      case 'essentialSections':
        return { isPassed: data.isEssentialSectionsPassed, badgeText: data.isEssentialSectionsPassed ? 'All present' : 'Missing sections' };
      case 'contactInfo': {
        const isPassed = !!data.contactInfo.email && !!data.contactInfo.phone;
        return { isPassed, badgeText: isPassed ? 'No issues' : 'Incomplete' };
      }
      case 'sectionOrder': {
        const isPassed = result.sectionOrder.isOptimal;
        return { isPassed, badgeText: isPassed ? 'No issues' : `${result.sectionOrder.suggestions.length} issues` };
      }
      case 'fileFormatSize': {
        const isPassed = result.pageCount <= 2;
        return { isPassed, badgeText: isPassed ? 'Optimal size' : 'Too long' };
      }
      case 'formatting': {
        const issuesCount = result.formatting.issues.length;
        const isPassed = issuesCount === 0;
        return { isPassed, badgeText: isPassed ? 'No issues' : `${issuesCount} issues` };
      }
      case 'emailAddress': {
        const isPassed = !!data.contactInfo.email;
        return { isPassed, badgeText: isPassed ? 'Found' : 'Missing' };
      }
      case 'headerLinks': {
        const isPassed = !!data.contactInfo.linkedin;
        return { isPassed, badgeText: isPassed ? 'Links found' : 'No links' };
      }
      case 'fileName': {
        const check = checkFileName(result.fileName);
        return { isPassed: check.isPassed, badgeText: check.scoreLabel };
      }
      case 'datesLinks': {
        const isPassed = !result.formatting.issues.some(i => i.message.toLowerCase().includes('date') || i.message.toLowerCase().includes('link'));
        return { isPassed, badgeText: isPassed ? 'Consistent' : 'Inconsistent' };
      }
      case 'credibility': {
        const isPassed = data.clichésList.length <= 2;
        return { isPassed, badgeText: isPassed ? 'Credible' : `${data.clichésList.length} clichés` };
      }
      case 'interviewRisks':
        return { isPassed: !data.hasRiskFactor, badgeText: !data.hasRiskFactor ? 'Low risk' : 'Review flags' };
      case 'linkedinMatch': {
        const isPassed = !!data.contactInfo.linkedin;
        return { isPassed, badgeText: isPassed ? 'Linked' : 'No link' };
      }
      case 'compliance':
        return { isPassed: data.isCompliancePassed, badgeText: data.isCompliancePassed ? 'Compliant' : 'Non-compliant' };
      case 'credentials': {
        const cat = findCategory('credentials');
        const isPassed = cat ? (cat.status === 'excellent' || cat.status === 'good') : true;
        const missingMandatory =
          result.credentials?.findings.filter(f => f.class === 'mandatory' && !f.found).length ?? 0;
        return {
          isPassed,
          badgeText: isPassed ? 'No issues' : missingMandatory > 0 ? 'Missing required' : 'Review',
        };
      }
      case 'relevance':
        return { isPassed: data.roleAligned, badgeText: data.roleAligned ? 'Aligned' : 'Review evidence' };
      case 'roleTarget': {
        const isPassed = !!data.targetRoleTitle;
        return { isPassed, badgeText: isPassed ? 'Target set' : 'Add role title' };
      }
      default:
        return { isPassed: true, badgeText: 'Passed' };
    }
  };

  return {
    getCategoryScorePercent,
    getGroupScore,
    totalIssues,
    getItemStatusAndBadge
  };
}
