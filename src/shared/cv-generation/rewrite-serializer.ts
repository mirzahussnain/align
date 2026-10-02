import type { ApprovedCvPlan, UnifiedCandidateEvidence } from './types';

export function serializeApprovedEvidenceForRewrite(evidence: UnifiedCandidateEvidence, plan: ApprovedCvPlan): string {
  const selected = [...plan.includedEvidenceIds, ...plan.optionalEvidenceIds];
  const payload = selected.map((id) => {
    const item = evidence.evidenceById[id];
    if (!item) throw new Error(`Approved plan references unknown evidence: ${id}`);
    return { evidenceId: id, kind: item.kind, field: item.field, text: item.canonicalText, requirementIds: item.requirementIds };
  });
  return JSON.stringify({
    task: 'Return rewrite patches only. Keep facts, metrics, dates, employers, qualifications and eligibility unchanged. Do not add evidence or omit an item merely because it does not need rewriting.',
    atsStrategy: plan.atsStrategy,
    targetStrategy: plan.targetStrategy,
    approvedEvidence: payload,
  });
}
