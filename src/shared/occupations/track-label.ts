// Suggests a career-track display name from what onboarding already
// collects, so a new track never has to sit at the literal string "Default"
// forever. Never overrides a name the user has typed themselves — callers
// only apply this while the label field is still untouched.

import type { OccupationId } from '@/shared/types/classification';
import { isKnownOccupation } from './registry';
import { isKnownIndustry } from '@/shared/constants/sector-keywords';
import { SECTOR_LABELS } from '@/shared/constants/sector-labels';

/**
 * Track names read as a domain/discipline ("Software Engineering"), distinct
 * from the occupation profile's own `label`, which reads as a job title
 * ("Software Engineer") — the latter is what scores a CV, the former is what
 * a user picks a career track out of a list by.
 */
const TRACK_NAMES: Record<OccupationId, string> = {
  software_engineer: 'Software Engineering',
  warehouse_operative: 'Warehouse Operations',
  administrator: 'Administration',
  registered_nurse: 'Registered Nursing',
  generic: 'General',
};

export interface TrackLabelInput {
  occupation?: string | null;
  targetRoleTitle?: string | null;
  industry?: string | null;
}

export function suggestCareerTrackLabel({ occupation, targetRoleTitle, industry }: TrackLabelInput): string {
  const sectorLabel = isKnownIndustry(industry) ? SECTOR_LABELS[industry] : null;

  if (isKnownOccupation(occupation) && occupation !== 'generic') {
    const trackName = TRACK_NAMES[occupation];
    return sectorLabel ? `${trackName} · ${sectorLabel}` : trackName;
  }
  if (targetRoleTitle?.trim()) return targetRoleTitle.trim();
  if (sectorLabel) return sectorLabel;
  return 'My Career Track';
}
