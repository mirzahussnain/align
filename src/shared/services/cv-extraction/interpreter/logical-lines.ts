import type { NormalizedDocumentBlock } from '../document/types';

const BULLET_MARKER = /^\s*[•▪◦●]\s*/u;

export function cleanListItemText(value: string): string {
  return value.normalize('NFKC').replace(BULLET_MARKER, '').trim().replace(/\s+/gu, ' ');
}

function startsListItem(block: NormalizedDocumentBlock): boolean {
  return block.kind === 'bullet' || Boolean(block.list) || BULLET_MARKER.test(block.text);
}

function sameStream(left: NormalizedDocumentBlock, right: NormalizedDocumentBlock): boolean {
  return left.page === right.page && left.layout?.column === right.layout?.column;
}

function isAdjacentIndentedContinuation(
  first: NormalizedDocumentBlock,
  previous: NormalizedDocumentBlock,
  candidate: NormalizedDocumentBlock
): boolean {
  if (candidate.kind !== 'paragraph' || candidate.list || candidate.style?.headingLevel || candidate.style?.bold) return false;
  if (!sameStream(previous, candidate)) return false;
  const firstX = first.layout?.x;
  const candidateX = candidate.layout?.x;
  const previousY = previous.layout?.y;
  const candidateY = candidate.layout?.y;
  const previousHeight = previous.layout?.height;
  const candidateHeight = candidate.layout?.height;
  if ([firstX, candidateX, previousY, candidateY, previousHeight, candidateHeight].every((value) => value === undefined)) {
    return startsListItem(previous) && !/[.!?)]$/u.test(cleanListItemText(first.text));
  }
  if ([firstX, candidateX, previousY, candidateY, previousHeight, candidateHeight].some((value) => value === undefined)) return false;
  const lineHeight = Math.max(previousHeight!, candidateHeight!);
  const baselineDistance = Math.abs(previousY! - candidateY!);
  return candidateX! >= firstX! + 2 && baselineDistance <= lineHeight * 1.8;
}

function appendWrappedText(left: string, right: string): string {
  const continuation = cleanListItemText(right);
  if (!continuation) return left;
  return `${left}${/[-/]$/u.test(left) ? '' : ' '}${continuation}`;
}

/** Collapse PDF visual wraps into atomic list blocks without crossing streams or explicit list starts. */
export function coalesceWrappedListBlocks(blocks: NormalizedDocumentBlock[]): NormalizedDocumentBlock[] {
  const result: NormalizedDocumentBlock[] = [];
  let activeIndex: number | undefined;
  let activeFirst: NormalizedDocumentBlock | undefined;
  let previousPhysical: NormalizedDocumentBlock | undefined;

  for (const block of blocks) {
    if (startsListItem(block)) {
      result.push({ ...block, text: cleanListItemText(block.text), kind: 'bullet' });
      activeIndex = result.length - 1;
      activeFirst = block;
      previousPhysical = block;
      continue;
    }
    if (
      activeIndex !== undefined && activeFirst && previousPhysical &&
      isAdjacentIndentedContinuation(activeFirst, previousPhysical, block)
    ) {
      result[activeIndex] = { ...result[activeIndex], text: appendWrappedText(result[activeIndex].text, block.text) };
      previousPhysical = block;
      continue;
    }
    result.push(block);
    activeIndex = undefined;
    activeFirst = undefined;
    previousPhysical = undefined;
  }
  return result;
}
