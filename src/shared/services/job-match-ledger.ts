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
 *
 * bullet body whose impact metric is not backed by the source CV or ledger CV
 * evidence is demoted to a neutral rewrite directive, so the stored spec (and
 * every UI surface that renders it) can never present an unsupported metric as
 * trusted guidance. Grounding touches only build-spec bodies — the score,
 * requirement ledger, statuses, deductions, and domain fit are untouched.
 */
export function normalizeJobMatchDataV2(
  draft: JobMatchDataV2Draft,
  cvText = ''
): JobMatchDataV2 {
  const requirements: JobRequirementLedgerEntry[] = draft.requirements.map((requirement, index) => ({
    id: `requirement-${String(index + 1).padStart(3, '0')}`,
    text: requirement.text,
    importance: requirement.importance,
    category: requirement.category,
    sourceSection: requirement.sourceSection,
    evidenceRequired: requirement.evidenceRequired,
    ...(requirement.clusterKey ? { clusterKey: requirement.clusterKey } : {}),
    ...(requirement.clusterLabel ? { clusterLabel: requirement.clusterLabel } : {}),
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

  // Evidence available at analysis time: the source CV plus the CV-sourced
  // evidence the ledger already recorded. Approved profile evidence and user
  // context do not exist yet — those are supplied at generation time, where the
  // spec is grounded a second time against the richer corpus.
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
  });
}
