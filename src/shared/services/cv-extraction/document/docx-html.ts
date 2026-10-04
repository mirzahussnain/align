import { HTMLElement, NodeType, parse } from 'node-html-parser';
import { normaliseUrl } from '../links';
import type { NormalizedDocumentBlock } from './types';

function cleanText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function textWithout(element: HTMLElement, selectors: string): string {
  const clone = element.clone() as HTMLElement;
  for (const ignored of clone.querySelectorAll(selectors)) ignored.remove();
  return cleanText(clone.textContent);
}

function linkDetailsOf(element: HTMLElement): { url: string; visibleText?: string }[] | undefined {
  const links = element
    .querySelectorAll('a')
    .flatMap((anchor) => {
      const url = normaliseUrl(anchor.getAttribute('href') ?? '');
      if (!url) return [];
      const visibleText = cleanText(anchor.textContent);
      return [{ url, ...(visibleText ? { visibleText } : {}) }];
    });
  return links.length ? links : undefined;
}

function wholeBlockStyle(element: HTMLElement, selectors: string): boolean | undefined {
  const text = cleanText(element.textContent);
  if (!text) return undefined;
  return element.querySelectorAll(selectors).some((candidate) => cleanText(candidate.textContent) === text)
    || element.matches(selectors)
    || undefined;
}

/** Convert Mammoth's generated fragment into atomic provider-neutral blocks. */
export function blocksFromMammothHtml(html: string): NormalizedDocumentBlock[] {
  const root = parse(html, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: { script: false, style: false, noscript: false, pre: true },
  });
  const blocks: NormalizedDocumentBlock[] = [];

  const add = (
    element: HTMLElement,
    kind: NormalizedDocumentBlock['kind'],
    metadata: Partial<NormalizedDocumentBlock> = {},
    text = textWithout(element, 'script,style,img,ul,ol,table')
  ): NormalizedDocumentBlock | undefined => {
    if (!text) return undefined;
    const linkDetails = linkDetailsOf(element);
    const block: NormalizedDocumentBlock = {
      id: `docx-body-${blocks.length}`,
      order: blocks.length,
      text,
      kind,
      ...metadata,
      style: {
        ...(metadata.style ?? {}),
        ...(wholeBlockStyle(element, 'strong,b') ? { bold: true } : {}),
        ...(wholeBlockStyle(element, 'em,i') ? { italic: true } : {}),
      },
      ...(linkDetails ? {
        links: [...new Set(linkDetails.map((link) => link.url))],
        linkDetails,
      } : {}),
    };
    if (Object.keys(block.style ?? {}).length === 0) delete block.style;
    blocks.push(block);
    return block;
  };

  const walkList = (list: HTMLElement, level: number, parentId?: string) => {
    const ordered = list.tagName.toLowerCase() === 'ol';
    for (const item of list.children.filter((child) => child.tagName.toLowerCase() === 'li')) {
      const block = add(item, 'bullet', {
        ...(parentId ? { parentId } : {}),
        list: { level, ordered },
      });
      for (const nested of item.children.filter((child) => ['ul', 'ol'].includes(child.tagName.toLowerCase()))) {
        walkList(nested, level + 1, block?.id ?? parentId);
      }
    }
  };

  const walk = (element: HTMLElement) => {
    const tag = element.tagName?.toLowerCase() ?? '';
    if (tag === 'script' || tag === 'style' || tag === 'img') return;
    if (/^h[1-6]$/.test(tag)) {
      add(element, 'heading', { style: { headingLevel: Number(tag.slice(1)) } });
      return;
    }
    if (tag === 'p') {
      add(element, 'paragraph');
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      walkList(element, 0);
      return;
    }
    if (tag === 'table') {
      const table = root.querySelectorAll('table').indexOf(element);
      element.querySelectorAll('tr').forEach((row, rowIndex) => {
        row.children
          .filter((cell) => ['td', 'th'].includes(cell.tagName.toLowerCase()))
          .forEach((cell, column) => {
            add(cell, 'table-cell', { table: { table, row: rowIndex, column } }, cleanText(cell.textContent));
          });
      });
      return;
    }
    for (const child of element.childNodes) {
      if (child.nodeType === NodeType.ELEMENT_NODE) walk(child as HTMLElement);
    }
  };

  walk(root);
  return blocks;
}
