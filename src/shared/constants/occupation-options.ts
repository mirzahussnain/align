// Select options for the structured target-role fields. Derived from the
// occupation registry so the UI can never offer an occupation the engine
// doesn't have an evaluation profile for.

import { OCCUPATION_PROFILES, OCCUPATION_IDS } from '@/shared/occupations/registry';
import type { OccupationId, Seniority } from '@/shared/types/classification';

export const OCCUPATION_OPTIONS: { value: OccupationId; label: string }[] = OCCUPATION_IDS.map(
  id => ({
    value: id,
    label: id === 'generic' ? 'Other / General' : OCCUPATION_PROFILES[id].label,
  })
);

export const SENIORITY_OPTIONS: { value: Exclude<Seniority, 'unknown'>; label: string }[] = [
  { value: 'entry', label: 'Entry level / Graduate' },
  { value: 'mid', label: 'Mid level' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead / Management' },
];

export function isSeniorityValue(value: string): boolean {
  return SENIORITY_OPTIONS.some(o => o.value === value);
}
