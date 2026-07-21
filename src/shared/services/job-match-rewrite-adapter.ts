import type {
  JobMatchDataV2,
  JobRequirementLedgerEntry,
  LegacyCvRewriteJobMatchInput,
} from '@/shared/types/ai';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';

/**
 * Temporary server-side projection for cv-rewriter.ts. The rewriter still
 * consumes the former mandatory/desirable arrays; no caller may persist or
 * render this shape.
 */
export function toLegacyCvRewriteInput(
  data: JobMatchDataV2,
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[] = []
): LegacyCvRewriteJobMatchInput & {
  approvedProfileEvidence: ApprovedProfileEvidenceOverlay[];
} {
  const formatEvidence = (requirement: JobRequirementLedgerEntry) => {
    const evidence = requirement.evidence.map((item) => item.text).filter(Boolean).join('; ');
    return evidence ? `${requirement.text} -> ${evidence}` : requirement.text;
  };
  const mandatory = data.requirements.filter(
    (requirement) => requirement.importance === 'mandatory'
  );
  const desirable = data.requirements.filter(
    (requirement) => requirement.importance === 'desirable'
  );
  const eligibility = data.requirements.filter(
    (requirement) =>
      (requirement.category === 'eligibility' || requirement.category === 'availability') &&
      requirement.status !== 'met'
  );

  return {
    mandatorySkills: {
      present: mandatory.filter((requirement) => requirement.status === 'met').map(formatEvidence),
      partial: mandatory.filter((requirement) => requirement.status === 'partial').map(formatEvidence),
      missing: mandatory
        .filter((requirement) => ['not_met', 'contradicted', 'unclear'].includes(requirement.status))
        .map((requirement) => requirement.text),
    },
    desirableSkills: {
      present: desirable.filter((requirement) => requirement.status === 'met').map(formatEvidence),
      missing: desirable
        .filter((requirement) => requirement.status !== 'met')
        .map((requirement) => requirement.text),
    },
    domainFit: {
      roleDomain: data.domainFit.roleDomain,
      candidateDomain: data.domainFit.candidateDomain,
      mismatch: data.domainFit.status === 'mismatch',
      overlapAreas: data.domainFit.overlapAreas,
      detail: data.domainFit.detail,
    },
    eligibilityFlags: eligibility.map((requirement) => ({
      flag: requirement.text,
      detail: requirement.deduction.reason,
      datesInvolved: requirement.evidence.map((item) => item.location).filter(Boolean).join(', '),
    })),
    experienceGap: data.experienceGap,
    cv_build_spec: data.cv_build_spec,
    approvedProfileEvidence,
  };
}
