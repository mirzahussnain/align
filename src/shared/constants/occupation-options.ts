// Select options for the structured target-role fields. Derived from the
// occupation registry so the UI can never offer an evaluation type the engine
// doesn't have a rule pack for.

import { OCCUPATION_PROFILES, OCCUPATION_IDS, isKnownOccupation } from '@/shared/occupations/registry';
import type { OccupationId, Seniority } from '@/shared/types/classification';

export interface OccupationOption {
  value: OccupationId;
  label: string;
}

/**
 * Evaluation types a user may NOT pick for themselves.
 *
 * Regulated occupations are reachable only through evidence the candidate
 * actually presents (a PIN on the CV) or through a job description that names
 * the role — never through self-selection. The reason is asymmetric harm:
 * selecting the nurse profile pins classification at 0.9 confidence and
 * bypasses the evidence tier entirely, so a pharmacy assistant or care worker
 * picking the closest-looking option inherits a MANDATORY NMC credential rule,
 * a floored credentials score, and a critical "add NMC registration"
 * recommendation for a registration they cannot legally hold.
 *
 * The profile itself is untouched and still applies whenever the classifier
 * genuinely detects a nurse — this list governs the picker, not the engine.
 */
const NOT_SELF_SELECTABLE: ReadonlySet<OccupationId> = new Set<OccupationId>(['registered_nurse']);

const labelFor = (id: OccupationId): string =>
  id === 'generic' ? 'General / Other' : OCCUPATION_PROFILES[id].label;

/** The evaluation types offered in the picker. */
export const OCCUPATION_OPTIONS: OccupationOption[] = OCCUPATION_IDS.filter(
  id => !NOT_SELF_SELECTABLE.has(id)
).map(id => ({ value: id, label: labelFor(id) }));

/**
 * The picker's options with the profile's stored value guaranteed present.
 *
 * A profile saved before an evaluation type stopped being self-selectable must
 * still render its own setting. Without this the select falls back to the empty
 * placeholder and the next save silently writes `null`, discarding a stored
 * value and changing how that track scores — data loss disguised as a UI
 * default.
 */
export function occupationOptionsFor(current: string | null | undefined): OccupationOption[] {
  if (!isKnownOccupation(current)) return OCCUPATION_OPTIONS;
  if (OCCUPATION_OPTIONS.some(o => o.value === current)) return OCCUPATION_OPTIONS;
  return [...OCCUPATION_OPTIONS, { value: current, label: labelFor(current) }];
}

export const SENIORITY_OPTIONS: { value: Exclude<Seniority, 'unknown'>; label: string }[] = [
  { value: 'entry', label: 'Entry level / Graduate' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead / Management' },
];

export function isSeniorityValue(value: string): boolean {
  return SENIORITY_OPTIONS.some(o => o.value === value);
}
