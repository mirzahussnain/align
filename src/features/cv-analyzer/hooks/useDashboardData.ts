import { useMemo } from 'react';
import { CVAnalysisResult } from '@/shared/types/cv';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import {
  extractOriginalSummary,
  getFormattedCVLines,
  extractContactInfo,
  checkBuzzwords,
  checkBulletConsistency,
  checkVocabularyRepetition,
  extractTargetRole
} from '@/shared/utils/cv-parser';

export function useDashboardData(result: CVAnalysisResult) {
  // Typed `kind` selection with title-prefix fallback for results stored
  // before recommendations carried kinds.
  const aiRewrites = useMemo(() => {
    return result.recommendations.filter(
      r => r.kind === 'rewrite' || (!r.kind && r.title.startsWith('Rewrite bullet:'))
    );
  }, [result.recommendations]);

  const aiFeedback = useMemo(() => {
    return result.recommendations.find(
      r => r.kind === 'alignment' || (!r.kind && r.title === 'UK Tech Market Alignment Feedback')
    );
  }, [result.recommendations]);

  const originalSummary = useMemo(() => {
    return extractOriginalSummary(result.rawText);
  }, [result.rawText]);

  const formattedCVLines = useMemo(() => {
    const presentKeywords = result.keywords.present.map(kw => kw.keyword);
    return getFormattedCVLines(result.rawText, presentKeywords, aiRewrites, originalSummary);
  }, [result.rawText, result.keywords.present, aiRewrites, originalSummary]);

  const contactInfo = useMemo(() => extractContactInfo(result.rawText), [result.rawText]);
  const bulletConsistency = useMemo(() => checkBulletConsistency(result.rawText), [result.rawText]);
  const repeatedWords = useMemo(() => checkVocabularyRepetition(result.rawText), [result.rawText]);

  const clichésList = useMemo(() => {
    if (result.aiClichés && result.aiClichés.length > 0) {
      return result.aiClichés.map(word => ({ word, count: 1 }));
    }
    return checkBuzzwords(result.rawText);
  }, [result.aiClichés, result.rawText]);

  const targetRoleTitle = useMemo(() => {
    return result.aiTargetRole || extractTargetRole(result.rawText);
  }, [result.aiTargetRole, result.rawText]);

  const isCompliancePassed = useMemo(() => {
    return result.compliance.filter(c => !c.passed).length === 0;
  }, [result.compliance]);

  /** The occupation this result was evaluated as — legacy rows read as generic. */
  const occupationLabel = useMemo(() => {
    const occupation = result.classification?.occupation;
    return isKnownOccupation(occupation) ? getOccupationProfile(occupation).label : 'General';
  }, [result.classification]);

  /**
   * Role relevance: coverage of the classified occupation's evidence, not
   * tech-specific testing keywords. Legacy stored rows carry the old
   * `keywordDensity` category id.
   */
  const roleAligned = useMemo(() => {
    const coverage = result.categories.find(
      c => c.id === 'evidenceCoverage' || c.id === 'keywordDensity'
    );
    const coverageOk = coverage ? coverage.status === 'excellent' || coverage.status === 'good' : true;
    const missingMandatory =
      result.credentials?.findings.some(f => f.class === 'mandatory' && !f.found) ?? false;
    return coverageOk && !missingMandatory;
  }, [result.categories, result.credentials]);

  const hasRiskFactor = useMemo(() => {
    if (result.aiRiskFlags && result.aiRiskFlags.length > 0) {
      return true;
    }
    return /self-employed|contract|freelance|gap/i.test(result.rawText);
  }, [result.aiRiskFlags, result.rawText]);

  const risksList = useMemo(() => {
    if (result.aiRiskFlags && result.aiRiskFlags.length > 0) {
      return result.aiRiskFlags;
    }
    const derived = [];
    if (/self-employed|contract|freelance/i.test(result.rawText)) {
      derived.push("Potential self-employed, freelance, or contract tenures detected in CV text.");
    }
    if (/gap/i.test(result.rawText)) {
      derived.push("Potential career gap indicators detected in CV text.");
    }
    return derived;
  }, [result.aiRiskFlags, result.rawText]);

  const isEssentialSectionsPassed = useMemo(() => {
    const hasSummary = result.rawText.toLowerCase().includes('summary') || result.rawText.toLowerCase().includes('profile');
    const hasExperience = result.rawText.toLowerCase().includes('experience') || result.rawText.toLowerCase().includes('work');
    const hasSkills = result.rawText.toLowerCase().includes('skills') || result.rawText.toLowerCase().includes('expertise');
    const hasEducation = result.rawText.toLowerCase().includes('education') || result.rawText.toLowerCase().includes('degree');
    return hasSummary && hasExperience && hasSkills && hasEducation;
  }, [result.rawText]);

  return {
    aiRewrites,
    aiFeedback,
    originalSummary,
    formattedCVLines,
    contactInfo,
    bulletConsistency,
    repeatedWords,
    clichésList,
    targetRoleTitle,
    isCompliancePassed,
    occupationLabel,
    roleAligned,
    hasRiskFactor,
    risksList,
    isEssentialSectionsPassed,
  };
}
