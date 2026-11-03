import { normaliseUrl } from '../links';
import type { NormalizedDocumentBlock } from './types';

export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily?: string;
  direction: string;
  hasEOL?: boolean;
}

export interface PdfAnnotation {
  page: number;
  url: string;
  rect: [number, number, number, number];
  visibleText?: string;
}

interface LineGroup {
  items: PdfTextItem[];
  closed: boolean;
}

function centerY(item: PdfTextItem): number {
  return item.y + item.height / 2;
}

function canJoin(group: LineGroup, item: PdfTextItem): boolean {
  if (group.closed) return false;
  const previous = group.items.at(-1)!;
  const maxFontSize = Math.max(previous.fontSize, item.fontSize);
  const verticalTolerance = Math.max(2, 0.35 * maxFontSize);
  if (Math.abs(centerY(previous) - centerY(item)) > verticalTolerance) return false;

  const gap = item.x - (previous.x + previous.width);
  if (gap < -verticalTolerance) return false;
  return gap <= Math.max(36, 3 * maxFontSize);
}

function joinItemText(items: PdfTextItem[]): string {
  let result = '';
  let previous: PdfTextItem | undefined;
  for (const item of items) {
    const text = item.text.normalize('NFKC');
    if (!text.trim()) continue;
    const gap = previous ? item.x - (previous.x + previous.width) : Number.POSITIVE_INFINITY;
    const touching = previous !== undefined && gap <= Math.max(0.5, 0.08 * Math.max(previous.fontSize, item.fontSize));
    const continuesToken = touching || /^[-,.;:!?)]/u.test(text) || /[-/]$/u.test(result);
    const needsSpace = result.length > 0 && !continuesToken && !/\s$/u.test(result) && !/^\s/u.test(text);
    result += `${needsSpace ? ' ' : ''}${text}`;
    previous = item;
  }
  return result.replace(/\s+/g, ' ').trim();
}

/** Group provider text items into conservative, page-local atomic lines. */
export function groupPdfPageItems(items: PdfTextItem[], page: number): NormalizedDocumentBlock[] {
  const groups: LineGroup[] = [];

  for (const item of items) {
    if (!item.text.trim()) continue;
    const current = groups.at(-1);
    if (!current || !canJoin(current, item)) {
      groups.push({ items: [item], closed: Boolean(item.hasEOL) });
      continue;
    }
    current.items.push(item);
    if (item.hasEOL) current.closed = true;
  }

  return groups.flatMap((group, index) => {
    const text = joinItemText(group.items);
    if (!text) return [];
    const left = Math.min(...group.items.map((item) => item.x));
    const bottom = Math.min(...group.items.map((item) => item.y));
    const right = Math.max(...group.items.map((item) => item.x + item.width));
    const top = Math.max(...group.items.map((item) => item.y + item.height));
    const fontSize = Math.max(...group.items.map((item) => item.fontSize));
    const fontFamilies = [...new Set(group.items.map((item) => item.fontFamily).filter(Boolean))];
    const directions = [...new Set(group.items.map((item) => item.direction).filter(Boolean))];

    return [{
      id: `pdf-p${page}-b${index}`,
      order: index,
      text,
      kind: /^\s*[•▪◦●]/u.test(text) ? 'bullet' : 'paragraph',
      page,
      ...(directions.length === 1 ? { direction: directions[0] } : {}),
      layout: { x: left, y: bottom, width: right - left, height: top - bottom },
      style: {
        fontSize,
        ...(fontFamilies.length === 1 ? { fontFamily: fontFamilies[0] } : {}),
      },
    } satisfies NormalizedDocumentBlock];
  });
}

function isDateTail(blocks: NormalizedDocumentBlock[]): boolean {
  return blocks.every((block) =>
    /^(?:[A-Za-z]{3,9}\s+)?\d{4}\s*(?:[-–—]|to)\s*(?:(?:[A-Za-z]{3,9}\s+)?\d{4}|present|current)$/i.test(
      block.text.trim()
    )
  );
}

function verticalSpan(blocks: NormalizedDocumentBlock[]): { bottom: number; top: number } {
  return {
    bottom: Math.min(...blocks.map((block) => block.layout!.y!)),
    top: Math.max(...blocks.map((block) => block.layout!.y! + block.layout!.height!)),
  };
}

function readingOrder(left: NormalizedDocumentBlock, right: NormalizedDocumentBlock): number {
  const leftColumn = left.layout?.column;
  const rightColumn = right.layout?.column;
  if (leftColumn !== rightColumn) {
    if (leftColumn === undefined) return -1;
    if (rightColumn === undefined) return 1;
    return leftColumn - rightColumn;
  }
  const leftBottom = left.layout?.y;
  const rightBottom = right.layout?.y;
  const leftHeight = left.layout?.height;
  const rightHeight = right.layout?.height;
  if (
    leftBottom !== undefined && rightBottom !== undefined &&
    leftHeight !== undefined && rightHeight !== undefined
  ) {
    const overlap = Math.max(
      0,
      Math.min(leftBottom + leftHeight, rightBottom + rightHeight) - Math.max(leftBottom, rightBottom)
    );
    if (overlap >= Math.min(leftHeight, rightHeight) / 2) {
      return (left.layout?.x ?? 0) - (right.layout?.x ?? 0) || left.order - right.order;
    }
  }
  return (right.layout?.y ?? 0) - (left.layout?.y ?? 0) ||
    (left.layout?.x ?? 0) - (right.layout?.x ?? 0) ||
    left.order - right.order;
}

/** Mark only strongly recurring, non-overlapping two-column bands. */
export function detectColumns(blocks: NormalizedDocumentBlock[]): NormalizedDocumentBlock[] {
  const positioned = blocks.filter((block) =>
    block.layout?.x !== undefined && block.layout.y !== undefined &&
    block.layout.width !== undefined && block.layout.height !== undefined
  );
  if (positioned.length < 8) {
    return [...blocks].sort(readingOrder);
  }

  const starts = [...new Set(positioned.map((block) => block.layout!.x!))].sort((a, b) => a - b);
  const candidates = starts.slice(1).map((start) => {
    const left = positioned.filter((block) => block.layout!.x! < start);
    const right = positioned.filter((block) => block.layout!.x! >= start);
    const leftEdge = Math.max(...left.map((block) => block.layout!.x! + block.layout!.width!));
    const gutter = start - leftEdge;
    return { start, left, right, gutter };
  }).filter(({ left, right, gutter }) => left.length >= 4 && right.length >= 4 && gutter >= 36);

  const candidate = candidates.sort((left, right) => right.gutter - left.gutter)[0];
  if (!candidate || isDateTail(candidate.right)) return [...blocks].sort(readingOrder);

  const leftSpan = verticalSpan(candidate.left);
  const rightSpan = verticalSpan(candidate.right);
  const shared = Math.max(0, Math.min(leftSpan.top, rightSpan.top) - Math.max(leftSpan.bottom, rightSpan.bottom));
  const shorterSpan = Math.min(leftSpan.top - leftSpan.bottom, rightSpan.top - rightSpan.bottom);
  if (shorterSpan <= 0 || shared / shorterSpan < 0.7) return [...blocks].sort(readingOrder);

  const leftEdge = candidate.start - candidate.gutter;
  const marked = blocks.map((block) => {
    const x = block.layout?.x;
    const width = block.layout?.width;
    if (x === undefined || width === undefined) return block;
    if (x + width <= leftEdge) return { ...block, layout: { ...block.layout, column: 0 } };
    if (x >= candidate.start) return { ...block, layout: { ...block.layout, column: 1 } };
    return block;
  });
  return marked.sort(readingOrder);
}

function overlapArea(block: NormalizedDocumentBlock, rect: PdfAnnotation['rect']): number {
  const { x, y, width, height } = block.layout ?? {};
  if (x === undefined || y === undefined || width === undefined || height === undefined) return 0;
  const overlapWidth = Math.max(0, Math.min(x + width, rect[2]) - Math.max(x, rect[0]));
  const overlapHeight = Math.max(0, Math.min(y + height, rect[3]) - Math.max(y, rect[1]));
  return overlapWidth * overlapHeight;
}

/** Attach links geometrically, preserving anything unplaced as its own block. */
export function attachPdfAnnotations(
  blocks: NormalizedDocumentBlock[],
  annotations: PdfAnnotation[]
): NormalizedDocumentBlock[] {
  const enriched = blocks.map((block) => ({ ...block, ...(block.links ? { links: [...block.links] } : {}) }));
  const unplaced: NormalizedDocumentBlock[] = [];

  for (const annotation of annotations) {
    const url = normaliseUrl(annotation.url);
    if (!url) continue;
    const overlaps = enriched
      .map((block, index) => ({ index, area: block.page === annotation.page ? overlapArea(block, annotation.rect) : 0 }))
      .filter(({ area }) => area > 0)
      .sort((left, right) => right.area - left.area);

    if (overlaps.length > 0 && (overlaps.length === 1 || overlaps[0].area > overlaps[1].area)) {
      const block = enriched[overlaps[0].index];
      block.links = [...new Set([...(block.links ?? []), url])];
      continue;
    }

    const [x0, y0, x1, y1] = annotation.rect;
    unplaced.push({
      id: `pdf-p${annotation.page}-link-${unplaced.length}`,
      order: enriched.length + unplaced.length,
      text: annotation.visibleText?.trim() || url,
      kind: 'link',
      page: annotation.page,
      layout: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
      links: [url],
    });
  }

  return [...enriched, ...unplaced];
}
