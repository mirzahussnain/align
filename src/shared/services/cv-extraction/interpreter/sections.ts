import { matchSectionHeading } from '../sections';
import type { NormalizedDocument } from '../document/types';
import type { InterpretedSection } from './types';

function isUnknownSectionHeading(kind: string, headingLevel: number | undefined): boolean {
  return kind === 'heading' && headingLevel !== undefined && headingLevel <= 3;
}

/** Split blocks into stable section instances without merging repeats. */
export function sectionDocument(document: NormalizedDocument): InterpretedSection[] {
  const sections: InterpretedSection[] = [{ instanceId: 'head-0', id: 'head', blocks: [] }];
  let current = sections[0];

  for (const block of [...document.blocks].sort((left, right) => left.order - right.order)) {
    const id = matchSectionHeading(block.text);
    if (id) {
      current = {
        instanceId: `${id}-${sections.filter((section) => section.id === id).length}`,
        id,
        heading: block.text,
        headingBlockId: block.id,
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    if (current.id !== 'head' && isUnknownSectionHeading(block.kind, block.style?.headingLevel)) {
      current = {
        instanceId: `unknown-${sections.filter((section) => section.id === 'unknown').length}`,
        id: 'unknown',
        heading: block.text,
        headingBlockId: block.id,
        blocks: [],
      };
      sections.push(current);
      continue;
    }
    current.blocks.push(block);
  }

  return sections;
}
