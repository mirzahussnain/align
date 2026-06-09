import { useMemo } from 'react';
import { CVAnalysisResult } from '@/shared/types/cv';
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
  const aiRewrites = useMemo(() => {
    return result.recommendations.filter(r => r.title.startsWith('Rewrite bullet:'));
  }, [result.recommendations]);

  const aiFeedback = useMemo(() => {
    return result.recommendations.find(r => r.title === 'UK Tech Market Alignment Feedback');
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

  const hasTestingKeywords = useMemo(() => {
    if (result.aiHasTesting !== undefined) {
      return result.aiHasTesting;
    }
    return /jest|cypress|playwright|vitest|mocha|testing|tdd|bdd/i.test(result.rawText);
  }, [result.aiHasTesting, result.rawText]);

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
    hasTestingKeywords,
    hasRiskFactor,
    risksList,
    isEssentialSectionsPassed,
  };
}
