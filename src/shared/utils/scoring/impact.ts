import type { OccupationProfile } from '@/shared/occupations/types';

/**
 * Count lines that evidence impact USING THE OCCUPATION'S OWN PATTERNS.
 * A warehouse CV proves impact through targets met, accuracy, and safety
 * records; percentages are one form of evidence, never a requirement.
 */
export function analyzeImpactStatements(text: string, profile: OccupationProfile): number {
  const lines = text.split('\n');
  let impactCount = 0;

  for (const line of lines) {
    if (profile.impactPatterns.some(p => p.test(line))) {
      impactCount++;
    }
  }

  if (impactCount >= 8) return 10;
  if (impactCount >= 6) return 8;
  if (impactCount >= 4) return 7;
  if (impactCount >= 2) return 5;
  return 3;
}
