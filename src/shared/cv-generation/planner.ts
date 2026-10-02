import { chooseSectionStrategy, type SectionStrategyTarget } from './section-strategy';
import { validatePlanEvidenceSelection } from './preservation';
import type { CvAtsStrategy, CvGenerationSourceMode, ProposedCvPlan, RequirementReconciliationSnapshot, UnifiedCandidateEvidence } from './types';

export interface ProposeCvPlanInput {
  evidence: UnifiedCandidateEvidence;
  reconciliation: RequirementReconciliationSnapshot;
  sourceMode: CvGenerationSourceMode;
  atsStrategy: CvAtsStrategy;
  target: SectionStrategyTarget;
}

export function proposeCvPlan(input: ProposeCvPlanInput): ProposedCvPlan {
  const items = Object.values(input.evidence.evidenceById);
  const includedEvidenceIds = items.filter((item) => item.preservationTier <= 1).map((item) => item.id);
  const optionalEvidenceIds = items.filter((item) => item.preservationTier === 2).map((item) => item.id);
  const omittedEvidence = items.filter((item) => item.preservationTier === 3).map((item) => ({ evidenceId: item.id, reasonCode: 'LOWER_VALUE' as const, rationale: 'Generic or duplicate material is removed before higher-value supported evidence.' }));
  const count = includedEvidenceIds.length + optionalEvidenceIds.length;
  const profileOnly = input.sourceMode === 'CAREER_PROFILE' && Object.keys(input.target).length === 0 && input.reconciliation.items.length === 0;
  const structure = chooseSectionStrategy(input.evidence, input.target, profileOnly);
  const plan: ProposedCvPlan = {
    schemaVersion: 1,
    sourceMode: input.sourceMode,
    atsStrategy: input.atsStrategy,
    targetStrategy: structure.strategy,
    sectionOrder: structure.order,
    density: count > 35 ? 'COMPACT' : count > 15 ? 'BALANCED' : 'SPACIOUS',
    targetLength: count > 35 ? 'TWO_PAGES' : count > 15 ? 'ONE_TO_TWO_PAGES' : 'ONE_PAGE',
    includedEvidenceIds,
    optionalEvidenceIds,
    omittedEvidence,
    professionalLinkIds: input.evidence.professionalLinks.filter((link) => link.type !== 'PROJECT_LIVE' && link.type !== 'PROJECT_REPOSITORY').map((link) => link.id),
    projectLinkIds: input.evidence.professionalLinks.filter((link) => link.type === 'PROJECT_LIVE' || link.type === 'PROJECT_REPOSITORY').map((link) => link.id),
    coveredRequirementIds: input.reconciliation.items.filter((item) => item.status === 'SUPPORTED').map((item) => item.requirementId),
    unresolvedRequirementIds: input.reconciliation.items.filter((item) => item.status === 'MISSING' || item.status === 'PARTIAL' || item.status === 'CONFLICTED' || item.status === 'CONFIRMED_MISSING').map((item) => item.requirementId),
  };
  const issues = validatePlanEvidenceSelection(input.evidence, plan);
  if (issues.length) throw new Error(`Planner preservation invariant failed: ${issues.map((issue) => `${issue.code}:${issue.evidenceId}`).join(', ')}`);
  return plan;
}
