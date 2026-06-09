import { Recommendation } from '@/shared/types/cv';
import { FormattedCVLine } from '@/features/cv-analyzer/types/cv-preview';

export function extractOriginalSummary(rawText: string): string {
  const lines = rawText.split('\n').map(l => l.trim());
  const summaryHeadings = ['summary', 'profile', 'professional summary', 'professional profile', 'about me', 'career goal', 'career objective'];
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (summaryHeadings.some(h => l.includes(h) && l.length < 40)) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return '';

  let endIdx = -1;
  const otherHeadings = ['experience', 'professional experience', 'education', 'skills', 'projects', 'languages', 'certifications', 'employment', 'history', 'work history'];
  for (let i = startIdx; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (otherHeadings.some(h => l.includes(h) && l.length < 45) || (lines[i] === lines[i].toUpperCase() && lines[i].length > 3 && lines[i].length < 30)) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) endIdx = Math.min(startIdx + 6, lines.length);
  return lines.slice(startIdx, endIdx).join(' ').trim();
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findRewriteForLine(line: string, aiRewrites: Recommendation[]): { index: number; rewrite: Recommendation } | null {
  if (!aiRewrites.length) return null;
  const trimmedLine = line.trim().toLowerCase();
  if (trimmedLine.length < 15) return null;

  for (let idx = 0; idx < aiRewrites.length; idx++) {
    const original = aiRewrites[idx].title.replace('Rewrite bullet: ', '').replace(/["]/g, '').trim().toLowerCase();
    if (original.length > 10 && (trimmedLine.includes(original) || original.includes(trimmedLine))) {
      return { index: idx, rewrite: aiRewrites[idx] };
    }
  }
  return null;
}

export function getFormattedCVLines(
  rawText: string,
  presentKeywords: string[],
  aiRewrites: Recommendation[],
  originalSummary: string
): FormattedCVLine[] {
  const lines = rawText.split('\n');
  const keywordsCopy = [...presentKeywords].sort((a, b) => b.length - a.length); // match longer first

  const escapedKeywords = keywordsCopy.map(escapeRegExp);
  const keywordRegex = escapedKeywords.length
    ? new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi')
    : null;

  const headingsList = [
    'summary',
    'profile',
    'professional summary',
    'professional profile',
    'experience',
    'professional experience',
    'work history',
    'employment history',
    'education',
    'skills',
    'core skills',
    'technical skills',
    'projects',
    'key projects',
    'languages',
    'certifications',
    'achievements',
    'interests'
  ];

  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: 'empty', content: '' };

    const isHeading =
      headingsList.some(h => trimmed.toLowerCase() === h || trimmed.toLowerCase() === h + ':') ||
      (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 35);

    if (isHeading) {
      return { type: 'heading', content: trimmed };
    }

    // Highlights (Annotated Mode)
    const isSummaryLine = !!(
      originalSummary &&
      originalSummary.toLowerCase().includes(trimmed.toLowerCase()) &&
      trimmed.length > 20
    );

    const rewriteMatch = findRewriteForLine(line, aiRewrites);

    let htmlContent = trimmed
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    if (keywordRegex) {
      htmlContent = htmlContent.replace(keywordRegex, (match) => {
        return `<span class="bg-purple-100/70 text-purple-700 font-bold px-1 py-0.5 rounded text-[11px] border-b border-purple-200">${match}</span>`;
      });
    }

    return {
      type: 'text',
      content: trimmed,
      htmlContent,
      isSummaryLine,
      rewriteMatch,
      originalLine: line
    };
  });
}

export interface ParsedContactInfo {
  email: string;
  linkedin: string;
  phone: string;
}

export function extractContactInfo(rawText: string): ParsedContactInfo {
  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const linkedinMatch = rawText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
  
  // Look for UK-style phone numbers or general phone formats
  // Matches e.g. +44 7700 900077, 07700900077, +44(0)7700 900077, etc.
  const phoneMatch = rawText.match(/(?:\+44\s?\(?0?\)?\s?\d{4}|\b0\d{4})\s?\d{3}\s?\d{3}\b|(?:\+?1\s?-?)?\(?\d{3}\)?\s?-?\d{3}\s?-?\d{4}\b|\+?\d[\d\s-]{9,14}\d/);

  return {
    email: emailMatch ? emailMatch[0] : '',
    linkedin: linkedinMatch ? linkedinMatch[0] : '',
    phone: phoneMatch ? phoneMatch[0].trim() : ''
  };
}

export interface ClichéMatch {
  word: string;
  count: number;
}

export function checkBuzzwords(rawText: string): ClichéMatch[] {
  const clichés = ['passionate', 'motivated', 'team player', 'hard-working', 'dynamic', 'synergy', 'results-driven', 'go-getter', 'detail-oriented', 'self-starter'];
  const matches: ClichéMatch[] = [];
  const normalized = rawText.toLowerCase();

  for (const word of clichés) {
    const regex = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
    const count = (normalized.match(regex) || []).length;
    if (count > 0) {
      matches.push({ word, count });
    }
  }

  return matches;
}

export interface BulletConsistencyResult {
  total: number;
  endingWithPeriod: number;
  endingWithoutPeriod: number;
}

export function checkBulletConsistency(rawText: string): BulletConsistencyResult {
  const lines = rawText.split('\n').map(l => l.trim());
  let total = 0;
  let endingWithPeriod = 0;
  let endingWithoutPeriod = 0;

  // Typical bullet point symbols: -, *, •, ▪, ▪, o, etc.
  const bulletRegex = /^[-\*•▪▪◦o]\s+/;

  for (const line of lines) {
    if (bulletRegex.test(line)) {
      total++;
      if (line.endsWith('.')) {
        endingWithPeriod++;
      } else {
        endingWithoutPeriod++;
      }
    }
  }

  return { total, endingWithPeriod, endingWithoutPeriod };
}

export interface WordRepetitionMatch {
  word: string;
  count: number;
}

export function checkVocabularyRepetition(rawText: string): WordRepetitionMatch[] {
  const stopWords = new Set([
    'the', 'and', 'a', 'to', 'of', 'in', 'i', 'is', 'that', 'it', 'on', 'you', 'this', 'for', 'with', 'was', 'as', 'at', 'by', 'an', 'be', 'are', 'from', 'or', 'with', 'using', 'used', 'worked', 'developed', 'building', 'built', 'created', 'various', 'managed', 'project', 'projects', 'system', 'systems', 'application', 'applications', 'software', 'experience', 'skills', 'data', 'design', 'designed'
  ]);

  const words = rawText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
  const freq: Record<string, number> = {};

  for (const w of words) {
    if (!stopWords.has(w)) {
      freq[w] = (freq[w] || 0) + 1;
    }
  }

  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .filter(item => item.count >= 4)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8); // Top 8 repeated words
}

export function extractTargetRole(rawText: string): string {
  const lines = rawText.split('\n').map(l => l.trim());
  const titleRegex = /\b(?:senior|junior|lead|associate|principal|graduate)?\s*(?:full\s*stack|frontend|backend|software|web|ai|ml|cloud|devops|systems|data|qa)\s*(?:engineer|developer|architect|analyst|specialist|consultant)\b/i;

  for (let i = 0; i < Math.min(25, lines.length); i++) {
    const match = lines[i].match(titleRegex);
    if (match && lines[i].length < 60) {
      return match[0].split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }
  }

  return '';
}


