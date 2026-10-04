import 'server-only';

import { CvPipelineError } from './errors';
import { normaliseUrl } from './links';
import { blocksFromMammothHtml } from './document/docx-html';
import type { NormalizedDocument, NormalizedDocumentBlock } from './document/types';
import { readDocxSupplementalContent } from './docx-parts';

function comparable(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function attachFieldCodeLinks(
  bodyBlocks: NormalizedDocumentBlock[],
  fields: { url: string; visibleText?: string; paragraphText: string }[]
): { bodyBlocks: NormalizedDocumentBlock[]; unplacedLinks: NormalizedDocumentBlock[] } {
  const enriched = bodyBlocks.map((block) => ({
    ...block,
    ...(block.links ? { links: [...block.links] } : {}),
    ...(block.linkDetails ? { linkDetails: [...block.linkDetails] } : {}),
  }));
  const unplacedLinks: NormalizedDocumentBlock[] = [];

  for (const field of fields) {
    const url = normaliseUrl(field.url);
    if (!url) continue;
    const paragraph = comparable(field.paragraphText);
    const matches = enriched.filter((block) => comparable(block.text) === paragraph);
    if (paragraph && matches.length === 1) {
      matches[0].links = [...new Set([...(matches[0].links ?? []), url])];
      matches[0].linkDetails = [
        ...(matches[0].linkDetails ?? []),
        { url, ...(field.visibleText ? { visibleText: field.visibleText } : {}) },
      ];
      continue;
    }
    unplacedLinks.push({
      id: `docx-field-link-${unplacedLinks.length}`,
      order: 0,
      text: comparable(field.visibleText ?? '') || url,
      kind: 'link',
      links: [url],
      linkDetails: [{ url, ...(field.visibleText ? { visibleText: field.visibleText } : {}) }],
    });
  }

  return { bodyBlocks: enriched, unplacedLinks };
}

/** Extract a DOCX once through Mammoth HTML plus narrowly scoped OOXML supplements. */
export async function extractDocxDocument(bytes: Buffer): Promise<NormalizedDocument> {
  try {
    const mammoth = await import('mammoth');
    const [{ value: html, messages }, supplemental] = await Promise.all([
      mammoth.convertToHtml({ buffer: bytes }, { externalFileAccess: false }),
      readDocxSupplementalContent(bytes),
    ]);

    for (const message of messages ?? []) {
      console.warn('[cv-extraction] DOCX conversion warning:', message.type);
    }

    const attached = attachFieldCodeLinks(blocksFromMammothHtml(html ?? ''), supplemental.fieldLinks);
    const blocks = [
      ...supplemental.leadingBlocks,
      ...attached.bodyBlocks,
      ...attached.unplacedLinks,
      ...supplemental.trailingBlocks,
    ].map((block, order) => ({ ...block, order }));

    return { sourceType: 'docx', pageCount: null, blocks };
  } catch (error) {
    if (error instanceof CvPipelineError) throw error;
    console.warn(
      '[cv-extraction] DOCX extraction failed:',
      error instanceof Error ? error.name : 'Unknown error'
    );
    throw new CvPipelineError('CORRUPT_DOCUMENT');
  }
}
