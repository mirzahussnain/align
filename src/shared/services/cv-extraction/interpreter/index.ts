import { projectNormalizedDocument } from '../document/projection';
import type { NormalizedDocument } from '../document/types';
import { parseSectionedCvStructure } from '../structured';
import type { CvExtractionPayload } from '../types';
import type { SectionedCv } from '../sections';
import { groupSectionBlocks } from './grouping';
import { readExperienceSections } from './experience';
import { sectionDocument } from './sections';
import type { CvInterpretationIssue } from './types';

export interface CvInterpretationResult {
  payload: CvExtractionPayload;
  issues: CvInterpretationIssue[];
}

/** Interpret one transient normalized document and project to the existing DTO. */
export function interpretCvDocument(document: NormalizedDocument): CvInterpretationResult {
  const sections = sectionDocument(document);
  // Materialize local groups at this boundary so no reader can establish state
  // across a section instance or layout stream. Entity-specific readers replace
  // their compatibility counterparts task-by-task in Tasks 5–7.
  sections.forEach((section) => groupSectionBlocks(section));
  const projection = projectNormalizedDocument(document);
  const compatibilityText = document.blocks.every((block) => block.id.startsWith('compat-'))
    ? document.blocks
        .filter((block) => block.text)
        .sort((left, right) => left.order - right.order)
        .map((block) => block.text)
        .join('\n')
    : projection.text;
  const knownSections = sections.filter((section) => section.id !== 'head' && section.id !== 'unknown');
  const sectioned: SectionedCv = {
    head: sections[0].blocks.flatMap((block) => {
      const index = projection.lineByBlockId.get(block.id);
      return index === undefined ? [] : [{ index, text: block.text }];
    }),
    sections: knownSections.flatMap((section) => {
      const headingLine = section.headingBlockId
        ? projection.lineByBlockId.get(section.headingBlockId)
        : undefined;
      if (headingLine === undefined || !section.heading || section.id === 'head' || section.id === 'unknown') {
        return [];
      }
      return [{
        id: section.id,
        heading: section.heading,
        headingLine,
        lines: section.blocks.flatMap((block) => {
          const index = projection.lineByBlockId.get(block.id);
          return index === undefined ? [] : [{ index, text: block.text }];
        }),
      }];
    }),
  };
  const payload = parseSectionedCvStructure(compatibilityText, sectioned, projection.links);
  const experience = readExperienceSections(sections);
  const unknownEvidence = sections
    .filter((section) => section.id === 'unknown' && section.heading && section.blocks.length)
    .flatMap((section) => {
      const first = section.blocks[0];
      const line = projection.lineByBlockId.get(first.id);
      const description = section.blocks.map((block) => block.text).join(' ').slice(0, 400).trim();
      if (line === undefined || !description) return [];
      return [{
        title: section.heading!,
        description,
        excerpt: description.slice(0, 400),
        sourceLocation: { line, section: section.heading },
      }];
    });
  return {
    payload: {
      ...payload,
      experience: experience.entries,
      ...(unknownEvidence.length
        ? { otherEvidence: [...payload.otherEvidence, ...unknownEvidence] }
        : {}),
    },
    issues: experience.issues,
  };
}

export { sectionDocument } from './sections';
export { groupSectionBlocks } from './grouping';
export { readExperienceSections } from './experience';
export type {
  CvInterpretationIssue,
  CvInterpretationIssueCode,
  InterpretedSection,
  InterpretedSectionId,
  LocalBlockGroup,
} from './types';
