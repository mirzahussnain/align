/**
 * Returns Tailwind class names for a score badge based on standard performance thresholds:
 * - >= 85: Emerald (Excellent)
 * - >= 70: Sky (Good / Ready)
 * - >= 50: Amber (Needs Improvement)
 * - < 50: Rose (Critical Gaps)
 */
export function scoreTone(score: number): string {
  if (score >= 85) return 'bg-emerald-100 text-emerald-700';
  if (score >= 70) return 'bg-sky-100 text-sky-700';
  if (score >= 50) return 'bg-amber-100 text-amber-700';
  return 'bg-rose-100 text-rose-700';
}
