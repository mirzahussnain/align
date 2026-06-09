import type { FormattingAnalysis, FormattingIssue } from '@/shared/types/cv';

export function analyzeFormatting(text: string, pageCount: number): FormattingAnalysis {
  const issues: FormattingIssue[] = [];

  // Check for zero-width characters
  if (/[\u200b\u200c\u200d\ufeff]/.test(text)) {
    issues.push({
      type: 'critical',
      message: 'Zero-width invisible characters detected',
      fix: 'Remove all zero-width spaces (\\u200b) from your document — they break ATS keyword matching',
    });
  }

  // Check for excessive special characters
  const specialChars = text.match(/[^\w\s.,;:!?@#$%&*()\-+=\[\]{}|\\/<>'"]/g);
  if (specialChars && specialChars.length > 10) {
    issues.push({
      type: 'warning',
      message: `${specialChars.length} unusual special characters detected`,
      fix: 'Remove decorative characters that ATS systems may not parse correctly',
    });
  }

  // Check for tables (indicated by lots of tab characters)
  const tabCount = (text.match(/\t/g) || []).length;
  if (tabCount > 20) {
    issues.push({
      type: 'warning',
      message: 'Possible table formatting detected (many tab characters)',
      fix: 'Replace tables with simple bullet-point lists — most ATS systems cannot parse tables',
    });
  }

  // Check word count
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 200) {
    issues.push({
      type: 'warning',
      message: `CV has only ${wordCount} words — too thin`,
      fix: 'UK CVs should have 400-800 words for optimal ATS scoring',
    });
  } else if (wordCount > 1000) {
    issues.push({
      type: 'info',
      message: `CV has ${wordCount} words — on the longer side`,
      fix: 'Consider trimming to under 800 words for a more focused CV',
    });
  }

  // Check page count
  if (pageCount > 2) {
    issues.push({
      type: 'critical',
      message: `CV is ${pageCount} pages — too long for UK market`,
      fix: 'UK CVs should be 1-2 pages maximum. Trim older or less relevant content',
    });
  }

  const estimatedReadTime = `${Math.ceil(wordCount / 200)} min`;

  return {
    fontConsistency: true, // Can only check via PDF metadata, not text
    fontCount: 0,
    hasImages: false,
    hasSpecialCharacters: (specialChars?.length || 0) > 5,
    pageCount,
    estimatedReadTime,
    issues,
  };
}
