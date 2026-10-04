import { CvPipelineError } from './errors';
import { extractDocxDocument } from './docx';
import { extractPdfDocument } from './pdf';
import { detectFormatFromBytes, type CvSourceFormat } from './formats';
import { hasUsableText } from './text';
import { CV_PARSER_VERSION, parseCvStructure } from './structured';
import type { CvExtractionPayload } from './types';
import { projectNormalizedDocument } from './document/projection';
import type { NormalizedDocument } from './document/types';

export * from './errors';
export * from './formats';
export * from './types';
export { CV_PARSER_VERSION, parseCvStructure } from './structured';
export { normaliseExtractedText, sourceExcerpt, hasUsableText, MIN_EXTRACTED_TEXT_LENGTH } from './text';
export { sectionCv, matchSectionHeading, sectionIdAt } from './sections';
export {
  classifyLinkUrl,
  findUrlsInText,
  normaliseUrl,
  splitMarkdownLinks,
  mergeLinks,
  type ExtractedLink,
  type LinkKind,
} from './links';
export { parseCvDateRange, parseCvDateToken, findDateRange } from './dates';

export { projectNormalizedDocument, type DocumentProjection } from './document/projection';
export type {
  NormalizedDocument,
  NormalizedDocumentBlock,
  NormalizedDocumentKind,
} from './document/types';

type DocumentExtractor = (bytes: Buffer) => Promise<NormalizedDocument>;

const EXTRACTORS: Record<CvSourceFormat, DocumentExtractor> = {
  pdf: extractPdfDocument,
  docx: extractDocxDocument,
};

export interface CvExtractionResult {
  format: CvSourceFormat;
  parserVersion: string;
  text: string;
  pageCount: number | null;
  structured: CvExtractionPayload;
}

/**
 * Read a stored CV: text first, then structure.
 *
 * Format is decided from the BYTES, never from the caller's claim, so the row's
 * recorded `sourceFormat` cannot route a file to the wrong extractor even if it
 * was written incorrectly. The whole path is deterministic and unmetered — no
 * model is involved, which is what lets a user with no AI quota left still
 * import their CV.
 *
 * A document with no usable text fails as EMPTY_TEXT rather than producing an
 * empty structure: a scanned CV that silently imports nothing looks like a bug
 * to the user, whereas "this looks like a scan" tells them what to do next.
 */
export async function extractStoredCv(bytes: Buffer): Promise<CvExtractionResult> {
  const format = detectFormatFromBytes(bytes);
  if (!format) throw new CvPipelineError('UNSUPPORTED_FORMAT');

  const extracted = await EXTRACTORS[format](bytes);
  const raw = { ...projectNormalizedDocument(extracted), pageCount: extracted.pageCount };
  if (!hasUsableText(raw.text)) throw new CvPipelineError('EMPTY_TEXT');

  return {
    format,
    parserVersion: CV_PARSER_VERSION,
    text: raw.text,
    pageCount: raw.pageCount,
    structured: parseCvStructure(raw.text, raw.links),
  };
}
