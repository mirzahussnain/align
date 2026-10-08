import { findDateRange, type DateFragmentMatch } from '../dates';
import type { NormalizedDocumentBlock } from '../document/types';
import type { ExtractedExperience } from '../types';
import { groupSectionBlocks } from './grouping';
import type { CvInterpretationIssue, InterpretedSection, LocalBlockGroup } from './types';

const FACT_SEPARATOR = /\s*(?:\||·|•)\s*|\s+[–—-]\s+/u;
const ROLE_COMPANY_CONNECTOR = /\s+(?:at|@|with|for)\s+/i;

interface HeaderFacts {
  jobTitle: string;
  company?: string;
  location?: string;
  blocks: NormalizedDocumentBlock[];
}

function tidy(value: string): string {
  return value.trim().replace(/^[\s,;|·•–—-]+|[\s,;|·•–—-]+$/gu, '').replace(/\s+/gu, ' ');
}

function splitFacts(value: string): string[] {
  return value.split(FACT_SEPARATOR).map(tidy).filter(Boolean);
}

function withoutDate(text: string, date: DateFragmentMatch): string {
  return tidy(`${text.slice(0, date.startIndex)} ${text.slice(date.endIndex)}`);
}

function inlineHeader(block: NormalizedDocumentBlock, date: DateFragmentMatch): HeaderFacts | null {
  const remainder = withoutDate(block.text, date);
  if (!remainder) return null;

  const connector = remainder.split(ROLE_COMPANY_CONNECTOR).map(tidy).filter(Boolean);
  const facts = connector.length > 1 ? connector : splitFacts(remainder);
  if (!facts[0]) return null;
  return {
    jobTitle: facts[0],
    ...(facts[1] ? { company: facts[1] } : {}),
    ...(facts[2] ? { location: facts[2] } : {}),
    blocks: [block],
  };
}

function detachedHeader(
  candidates: NormalizedDocumentBlock[],
  group: LocalBlockGroup
): { header: HeaderFacts | null; consumed: number; ambiguous: NormalizedDocumentBlock[] } {
  const last = candidates.at(-1);
  if (!last) return { header: null, consumed: 0, ambiguous: [] };

  const connectorFacts = last.text.split(ROLE_COMPANY_CONNECTOR).map(tidy).filter(Boolean);
  const inlineFacts = connectorFacts.length > 1 ? connectorFacts : splitFacts(last.text);
  if (inlineFacts.length >= 2) {
    return {
      header: {
        jobTitle: inlineFacts[0],
        company: inlineFacts[1],
        ...(inlineFacts[2] ? { location: inlineFacts[2] } : {}),
        blocks: [last],
      },
      consumed: 1,
      ambiguous: [],
    };
  }

  const previous = candidates.at(-2);
  if (!previous) {
    return {
      header: { jobTitle: tidy(last.text), blocks: [last] },
      consumed: 1,
      ambiguous: [],
    };
  }

  if (last.table && previous.table && group.stream.startsWith('table:')) {
    return {
      header: { jobTitle: previous.text, company: last.text, blocks: [previous, last] },
      consumed: 2,
      ambiguous: [],
    };
  }

  if (previous.style?.bold && !last.style?.bold) {
    const employerFacts = splitFacts(previous.text);
    return {
      header: {
        jobTitle: tidy(last.text),
        company: employerFacts[0],
        ...(employerFacts[1] ? { location: employerFacts[1] } : {}),
        blocks: [previous, last],
      },
      consumed: 2,
      ambiguous: [],
    };
  }

  return { header: null, consumed: 0, ambiguous: [previous, last] };
}

function issue(
  code: CvInterpretationIssue['code'],
  blocks: NormalizedDocumentBlock[]
): CvInterpretationIssue {
  return {
    code,
    blockIds: blocks.map(({ id }) => id),
    messageKey: code === 'AMBIGUOUS_DATE_OWNERSHIP'
      ? 'cvImport.review.ambiguousDateOwnership'
      : 'cvImport.review.ambiguousExperienceHeader',
  };
}

function readGroup(
  group: LocalBlockGroup,
  section: InterpretedSection
): { entries: ExtractedExperience[]; issues: CvInterpretationIssue[] } {
  const entries: ExtractedExperience[] = [];
  const issues: CvInterpretationIssue[] = [];
  let pending: NormalizedDocumentBlock[] = [];
  let active: ExtractedExperience | undefined;

  const attachPending = (blocks: NormalizedDocumentBlock[]) => {
    if (!active) return;
    active.achievements.push(...blocks
      .map(({ text }) => tidy(text).slice(0, 2000))
      .filter(Boolean));
  };

  for (const block of group.blocks) {
    const date = findDateRange(block.text);
    if (!date) {
      pending.push(block);
      continue;
    }

    let header = inlineHeader(block, date);
    if (header) {
      attachPending(pending);
      pending = [];
    } else {
      const detached = detachedHeader(pending, group);
      header = detached.header;
      if (header) {
        attachPending(pending.slice(0, -detached.consumed));
        pending = [];
      } else if (detached.ambiguous.length) {
        issues.push(issue('AMBIGUOUS_EXPERIENCE_HEADER', detached.ambiguous));
        pending = [];
        continue;
      } else {
        attachPending(pending);
        pending = [];
        issues.push(issue('AMBIGUOUS_DATE_OWNERSHIP', [block]));
        continue;
      }
    }

    const excerpt = tidy([...header.blocks.map(({ text }) => text), block.text].join(' ')).slice(0, 400);
    active = {
      jobTitle: header.jobTitle.slice(0, 160),
      ...(header.company ? { company: header.company.slice(0, 160) } : {}),
      ...(header.location ? { location: header.location.slice(0, 160) } : {}),
      startDate: date.start,
      endDate: date.end,
      current: date.current,
      achievements: [],
      excerpt,
      sourceLocation: {
        line: header.blocks[0]?.order ?? block.order,
        ...(section.heading ? { section: section.heading } : {}),
      },
    };
    entries.push(active);
  }

  attachPending(pending);
  return { entries, issues };
}

/** Read employment facts without allowing ownership to escape a section-local layout group. */
export function readExperienceSections(
  sections: InterpretedSection[]
): { entries: ExtractedExperience[]; issues: CvInterpretationIssue[] } {
  const entries: ExtractedExperience[] = [];
  const issues: CvInterpretationIssue[] = [];

  for (const section of sections.filter(({ id }) => id === 'experience')) {
    for (const group of groupSectionBlocks(section)) {
      const result = readGroup(group, section);
      entries.push(...result.entries);
      issues.push(...result.issues);
    }
  }

  return { entries, issues };
}
