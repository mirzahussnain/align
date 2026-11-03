import type { NormalizedDocumentBlock } from '../document/types';
import type { InterpretedSection, LocalBlockGroup } from './types';

function streamOf(block: NormalizedDocumentBlock): string {
  if (block.table) return `table:${block.table.table}:row:${block.table.row}`;
  return `page:${block.page ?? 0}:column:${block.layout?.column ?? 'main'}`;
}

function isPeerBoundary(block: NormalizedDocumentBlock): boolean {
  return block.kind === 'heading' || Boolean(block.style?.headingLevel);
}

/** Build local groups whose active state cannot cross section, stream, row, or peer boundaries. */
export function groupSectionBlocks(section: InterpretedSection): LocalBlockGroup[] {
  const groups: LocalBlockGroup[] = [];
  const activeByStream = new Map<string, LocalBlockGroup>();

  for (const block of section.blocks) {
    const stream = streamOf(block);
    let active = activeByStream.get(stream);
    if (!active || isPeerBoundary(block)) {
      active = {
        id: `${section.instanceId}-group-${groups.length}`,
        sectionInstanceId: section.instanceId,
        stream,
        blocks: [],
      };
      groups.push(active);
      activeByStream.set(stream, active);
    }
    active.blocks.push(block);
  }

  return groups;
}
