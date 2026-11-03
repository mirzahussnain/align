import type { UnifiedCandidateEvidence } from './types';

export interface PlanSelectionProjection {
  includedEvidenceIds: string[];
  optionalEvidenceIds: string[];
  omittedEvidence: { evidenceId: string; reasonCode: string; rationale: string }[];
}

export interface PreservationIssue {
  evidenceId: string;
  code: 'REQUIRED_EVIDENCE_OMITTED' | 'STRONG_EVIDENCE_OMITTED_WITHOUT_REASON';
}

export function validatePlanEvidenceSelection(evidence: UnifiedCandidateEvidence, plan: PlanSelectionProjection): PreservationIssue[] {
  const selected = new Set([...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]);
  const omitted = new Set(plan.omittedEvidence.map((item) => item.evidenceId));
  const issues: PreservationIssue[] = [];
  for (const item of Object.values(evidence.evidenceById)) {
    if (item.preservationTier === 0 && !selected.has(item.id)) issues.push({ evidenceId: item.id, code: 'REQUIRED_EVIDENCE_OMITTED' });
    if (item.preservationTier === 1 && !selected.has(item.id) && !omitted.has(item.id)) issues.push({ evidenceId: item.id, code: 'STRONG_EVIDENCE_OMITTED_WITHOUT_REASON' });
  }
  return issues;
}
