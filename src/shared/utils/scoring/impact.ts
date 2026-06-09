import { IMPACT_PATTERNS } from '@/shared/constants/scoring-config';

export function analyzeImpactStatements(text: string): number {
  const lines = text.split('\n');
  let impactCount = 0;

  for (const line of lines) {
    if (IMPACT_PATTERNS.some(p => p.test(line))) {
      impactCount++;
    }
  }

  // Score based on number of quantified achievements
  if (impactCount >= 8) return 10;
  if (impactCount >= 6) return 8;
  if (impactCount >= 4) return 7;
  if (impactCount >= 2) return 5;
  return 3;
}
