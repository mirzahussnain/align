import type { CandidateEvidenceItem, EvidenceFieldKind } from './types';

const MUTABLE_FIELD_KINDS = new Set<EvidenceFieldKind>([
  'RESPONSIBILITY',
  'ACHIEVEMENT',
  'EVIDENCE_LINE',
  'COURSEWORK',
  'CREDENTIAL_EVIDENCE',
  'CONTRIBUTION',
  'DESCRIPTION',
]);

export function isPatchableEvidence(item: CandidateEvidenceItem): boolean {
  if (item.field === 'summary' || item.kind === 'ACHIEVEMENT') return true;
  if (!item.canonicalData || typeof item.canonicalData !== 'object') return false;
  const fieldKind = (item.canonicalData as { fieldKind?: unknown }).fieldKind;
  return typeof fieldKind === 'string' && MUTABLE_FIELD_KINDS.has(fieldKind as EvidenceFieldKind);
}

export function selectedEvidenceIds(plan: { includedEvidenceIds: string[]; optionalEvidenceIds: string[] }): string[] {
  return [...plan.includedEvidenceIds, ...plan.optionalEvidenceIds];
}
