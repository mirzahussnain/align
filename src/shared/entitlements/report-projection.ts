import type { CVAnalysisResult } from '@/shared/types/cv';
import type { JobMatchDataV2 } from '@/shared/types/ai';
import { REPORT_ACCESS_LIMITS, type CapabilityDecision } from './registry';

export interface ReportProjectionDecisions {
  report: CapabilityDecision;
  requirementLedger?: CapabilityDecision;
  rewriteStrategy?: CapabilityDecision;
  eligibility?: CapabilityDecision;
}

function isFull(decision: CapabilityDecision | undefined): boolean {
  return decision?.mode === 'enabled' || decision?.accessLevel === 'full';
}

function projectJobMatch(data: JobMatchDataV2, decisions: ReportProjectionDecisions): JobMatchDataV2 {
  if (isFull(decisions.report)) return data;
  const requirements = isFull(decisions.requirementLedger)
    ? data.requirements
    : data.requirements.slice(0, REPORT_ACCESS_LIMITS.previewRequirements);
  const exposeStrategy = isFull(decisions.rewriteStrategy);
  const exposeEligibility = isFull(decisions.eligibility);
  return {
    ...data,
    requirements: requirements
      .filter((requirement) => exposeEligibility || requirement.category !== 'eligibility')
      .map((requirement) => ({
        ...requirement,
        evidence: requirement.evidence.slice(0, REPORT_ACCESS_LIMITS.previewEvidencePerRequirement),
      })),
    tailoredRewrites: exposeStrategy ? data.tailoredRewrites : [],
    cv_build_spec: exposeStrategy
      ? data.cv_build_spec
      : {
          ...data.cv_build_spec,
          template_rationale: '',
          section_order: [],
          lead_project: '',
          summary_angle: '',
          skills_to_surface: [],
          skills_to_deprioritise: [],
          bullets_to_rewrite: [],
          cover_letter_angle: '',
        },
  };
}

/** Keep the canonical object complete and project only the API presentation. */
export function projectAnalysisReport(
  result: CVAnalysisResult,
  decisions: ReportProjectionDecisions
): CVAnalysisResult {
  if (isFull(decisions.report)) return result;
  const projected: CVAnalysisResult = {
    ...result,
    categories: (result.categories ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryCategories),
    keywords: {
      present: (result.keywords?.present ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryKeywords),
      missing: (result.keywords?.missing ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryKeywords),
      categoryBreakdown: (result.keywords?.categoryBreakdown ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryComplianceItems),
    },
    compliance: (result.compliance ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryComplianceItems),
    recommendations: (result.recommendations ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryRecommendations),
    formatting: {
      ...result.formatting,
      issues: (result.formatting?.issues ?? []).slice(0, REPORT_ACCESS_LIMITS.summaryComplianceItems),
    },
  };
  if (result.jobMatchData) projected.jobMatchData = projectJobMatch(result.jobMatchData, decisions);
  return projected;
}
