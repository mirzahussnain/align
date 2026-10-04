import { normaliseUrl, type ExtractedLink } from '../links';
import { normaliseExtractedText } from '../text';
import type { NormalizedDocument } from './types';

export interface DocumentProjection {
  text: string;
  lineByBlockId: Map<string, number>;
  links: ExtractedLink[];
}

function normalizeBlockText(text: string): string {
  return normaliseExtractedText(text.normalize('NFKC')).replace(/\s+/g, ' ').trim();
}

/** Project transient document blocks into the stable compatibility text surface. */
export function projectNormalizedDocument(document: NormalizedDocument): DocumentProjection {
  const lines: string[] = [];
  const lineByBlockId = new Map<string, number>();
  const links: ExtractedLink[] = [];

  for (const block of [...document.blocks].sort((left, right) => left.order - right.order)) {
    const text = normalizeBlockText(block.text);
    if (!text) continue;

    const line = lines.length;
    lines.push(text);
    lineByBlockId.set(block.id, line);

    for (const rawUrl of block.links ?? []) {
      const url = normaliseUrl(rawUrl);
      if (!url) continue;
      links.push({
        url,
        ...(block.page !== undefined ? { page: block.page } : {}),
        line,
        visibleText: text,
        surroundingText: text,
      });
    }
  }

  return { text: lines.join('\n'), lineByBlockId, links };
}
