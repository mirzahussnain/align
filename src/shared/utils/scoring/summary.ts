import { SECTION_HEADINGS_MAP } from '@/shared/constants/scoring-config';

export function analyzeProfessionalSummary(text: string): number {
  const lines = text.split('\n').map(l => l.trim());
  let summaryStart = -1;
  let summaryEnd = -1;

  // Find summary section
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (SECTION_HEADINGS_MAP['professional-summary'].some(h => lower.includes(h))) {
      summaryStart = i + 1;
      break;
    }
  }

  if (summaryStart === -1) return 3; // No summary found

  // Find next section heading
  for (let i = summaryStart; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    const isHeading = Object.values(SECTION_HEADINGS_MAP)
      .flat()
      .some(h => lower.includes(h) && lower.length < 60);
    if (isHeading || lines[i] === lines[i].toUpperCase() && lines[i].length > 3) {
      summaryEnd = i;
      break;
    }
  }

  if (summaryEnd === -1) summaryEnd = Math.min(summaryStart + 5, lines.length);

  const summaryText = lines.slice(summaryStart, summaryEnd).join(' ').trim();
  const wordCount = summaryText.split(/\s+/).length;

  let score = 5;

  // Length check (30-60 words ideal)
  if (wordCount >= 30 && wordCount <= 60) score += 2;
  else if (wordCount < 15) score -= 2;

  // Check for role-specific targeting
  const roleKeywords = ['seeking', 'looking for', 'targeting', 'contribute to', 'passionate about'];
  if (roleKeywords.some(k => summaryText.toLowerCase().includes(k))) score += 1;

  // Check for quantified claims
  if (/\d+/.test(summaryText)) score += 1;

  // Check for buzzword overuse
  const buzzwords = ['passionate', 'team player', 'hard-working', 'dynamic', 'synergy', 'results-driven'];
  const buzzCount = buzzwords.filter(b => summaryText.toLowerCase().includes(b)).length;
  if (buzzCount >= 2) score -= 1;

  return Math.min(10, Math.max(1, score));
}
