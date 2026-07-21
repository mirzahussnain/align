import type {
  DomainFitV2,
  JobMatchDataV2,
  JobRequirementLedgerEntry,
  RequirementStatus,
} from '@/shared/types/ai';

export type RequirementDisplayRow = JobRequirementLedgerEntry;

/** Complete canonical requirement inventory for the job-match UI. */
export function getAlignmentRequirements(data: JobMatchDataV2): RequirementDisplayRow[] {
  return data.requirements;
}

/** Requirements extracted from an explicit person specification. */
export function getPersonSpecificationRequirements(data: JobMatchDataV2): RequirementDisplayRow[] {
  return data.requirements.filter(
    (requirement) => requirement.sourceSection === 'person_specification'
  );
}

export interface RequirementSummary {
  essentialMatched: number;
  essentialTotal: number;
  desirableMatched: number;
  desirableTotal: number;
  primaryGap: string | null;
  domainStatus: 'aligned' | 'partial' | 'mismatch';
}

const GAP_ORDER: RequirementStatus[] = ['contradicted', 'not_met', 'partial', 'unclear'];

export function getRequirementSummary(data: JobMatchDataV2): RequirementSummary {
  const essential = data.requirements.filter((requirement) => requirement.importance === 'mandatory');
  const desirable = data.requirements.filter((requirement) => requirement.importance === 'desirable');
  const findHighestPriorityGap = (requirements: JobRequirementLedgerEntry[]) =>
    GAP_ORDER.map((status) => requirements.find((requirement) => requirement.status === status)).find(Boolean);
  // Importance outranks severity: an Essential gap should always be surfaced
  // before a Desirable one, even when the latter is contradicted.
  const primaryGap = findHighestPriorityGap(essential) ?? findHighestPriorityGap(desirable);

  return {
    essentialMatched: essential.filter((requirement) => requirement.status === 'met').length,
    essentialTotal: essential.length,
    desirableMatched: desirable.filter((requirement) => requirement.status === 'met').length,
    desirableTotal: desirable.length,
    primaryGap: primaryGap?.text ?? null,
    domainStatus: data.domainFit.status,
  };
}

export interface ScoringDisplayRow {
  id: string;
  item: string;
  classification: string;
  deduction: number;
  reason: string;
}

export function getScoringRows(data: JobMatchDataV2): ScoringDisplayRow[] {
  const requirementRows = data.requirements
    .filter((requirement) => requirement.deduction.points > 0)
    .map((requirement) => ({
      id: requirement.id,
      item: requirement.text,
      classification: requirement.status,
      deduction: requirement.deduction.points,
      reason: requirement.deduction.reason,
    }));
  return data.domainFit.deduction.points > 0
    ? [
        ...requirementRows,
        {
          id: 'domain-fit',
          item: 'Domain fit',
          classification: data.domainFit.status,
          deduction: data.domainFit.deduction.points,
          reason: data.domainFit.deduction.reason,
        },
      ]
    : requirementRows;
}

export function getDomainFitDisplay(data: JobMatchDataV2): DomainFitV2 {
  return data.domainFit;
}

export function getEligibilityRequirements(data: JobMatchDataV2): RequirementDisplayRow[] {
  return data.requirements.filter(
    (requirement) => requirement.category === 'eligibility' || requirement.category === 'availability'
  );
}

export function getMandatoryRequirementGaps(data: JobMatchDataV2): {
  missing: string[];
  partial: string[];
} {
  const mandatory = data.requirements.filter(
    (requirement) => requirement.importance === 'mandatory'
  );
  return {
    missing: mandatory
      .filter((requirement) => ['not_met', 'contradicted', 'unclear'].includes(requirement.status))
      .map((requirement) => requirement.text),
    partial: mandatory
      .filter((requirement) => requirement.status === 'partial')
      .map((requirement) => requirement.text),
  };
}
