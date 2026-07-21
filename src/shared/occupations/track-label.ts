// Suggests a career-profile display name from what onboarding already
// collects, so a new profile never has to sit at the literal string "Default"
// forever. Never overrides a name the user has typed themselves — callers
// only apply this while the label field is still untouched.

import { getOccupationProfile, isKnownOccupation } from './registry';
import { isKnownIndustry } from '@/shared/constants/sector-keywords';
import { SECTOR_LABELS } from '@/shared/constants/sector-labels';

export interface TrackLabelInput {
  occupation?: string | null;
  targetRoleTitle?: string | null;
  industry?: string | null;
}

/**
 * Evaluation-type labels now read as disciplines ("Software Engineering",
 * "Frontline Operations") rather than job titles, so a career profile can be
 * named straight from the rule pack's own label.
 *
 * This previously needed a parallel TRACK_NAMES map, purely because the labels
 * read as job titles and "Warehouse Operative" is a poor name for a career
 * direction. That map had to be extended in lockstep with the registry for no
 * analytical gain, so it is gone.
 */
export function suggestCareerTrackLabel({ occupation, targetRoleTitle, industry }: TrackLabelInput): string {
  const sectorLabel = isKnownIndustry(industry) ? SECTOR_LABELS[industry] : null;

  if (isKnownOccupation(occupation) && occupation !== 'generic') {
    const trackName = getOccupationProfile(occupation).label;
    return sectorLabel ? `${trackName} · ${sectorLabel}` : trackName;
  }
  if (targetRoleTitle?.trim()) return targetRoleTitle.trim();
  if (sectorLabel) return sectorLabel;
  return 'My Career Profile';
}
