import { JobMatchDataV2Schema } from '@/shared/schemas/ai-output';
import type {
  JobMatchDataV2,
  JobMatchDataV2Draft,
  JobRequirementLedgerEntry,
} from '@/shared/types/ai';

/**
 * Turn validated model output into the canonical stored ledger.
 *
 * Model-provided ids and final scores are never copied. IDs are assigned from
 * the validated inventory order and the score is derived from non-negative,
 * integer deductions enforced by the Zod boundary.
 */
export function normalizeJobMatchDataV2(draft: JobMatchDataV2Draft): JobMatchDataV2 {
  const requirements: JobRequirementLedgerEntry[] = draft.requirements.map((requirement, index) => ({
    id: `requirement-${String(index + 1).padStart(3, '0')}`,
    text: requirement.text,
    importance: requirement.importance,
    category: requirement.category,
    sourceSection: requirement.sourceSection,
    evidenceRequired: requirement.evidenceRequired,
    status: requirement.status,
    evidence: requirement.evidence.map((evidence) => ({
      source: evidence.source,
      ...(evidence.sourceRef ? { sourceRef: evidence.sourceRef } : {}),
      text: evidence.text,
      ...(evidence.location ? { location: evidence.location } : {}),
      ...(evidence.approved !== undefined ? { approved: evidence.approved } : {}),
    })),
    confidence: requirement.confidence,
    deduction: {
      points: requirement.deduction.points,
      reason: requirement.deduction.reason,
      rubric: requirement.deduction.rubric,
    },
  }));

  const requirementDeductions = requirements.reduce(
    (sum, requirement) => sum + requirement.deduction.points,
    0
  );
  const matchScore = Math.max(
    0,
    Math.min(100, 100 - requirementDeductions - draft.domainFit.deduction.points)
  );

  return JobMatchDataV2Schema.parse({
    schemaVersion: 2,
    jobTitle: draft.jobTitle,
    jobCompany: draft.jobCompany,
    requirements,
    domainFit: draft.domainFit,
    matchScore,
    matchFeedback: draft.matchFeedback,
    experienceGap: draft.experienceGap,
    tailoredRewrites: draft.tailoredRewrites,
    cv_build_spec: draft.cv_build_spec,
  });
}
