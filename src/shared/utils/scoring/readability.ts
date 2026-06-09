export function analyzeATSReadability(text: string): number {
  let score = 10;

  // Check for unicode issues
  if (/[\u200b\u200c\u200d\ufeff]/.test(text)) score -= 3;

  // Check for excessive formatting artifacts
  const artifactCount = (text.match(/[■●►▪▸◆★✓✗✘☐☑]/g) || []).length;
  if (artifactCount > 5) score -= 2;

  // Check for header/footer repetition (same short text appearing multiple times)
  const shortLines = text.split('\n').filter(l => l.trim().length > 0 && l.trim().length < 30);
  const lineFrequency: Record<string, number> = {};
  for (const line of shortLines) {
    const normalized = line.trim().toLowerCase();
    lineFrequency[normalized] = (lineFrequency[normalized] || 0) + 1;
  }
  const repeatedLines = Object.values(lineFrequency).filter(v => v > 2).length;
  if (repeatedLines > 0) score -= 1;

  return Math.max(1, score);
}
