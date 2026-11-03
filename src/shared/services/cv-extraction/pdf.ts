import 'server-only';

import { extractTextItems, getDocumentProxy } from 'unpdf';
import { CvPipelineError } from './errors';
import { readPdfFormFields, type PdfFormDocument } from './pdf-forms';
import {
  attachPdfAnnotations,
  detectColumns,
  groupPdfPageItems,
  type PdfAnnotation,
  type PdfTextItem,
} from './document/pdf-layout';
import type { NormalizedDocument, NormalizedDocumentBlock } from './document/types';
import type { ExtractedLink } from './links';

export const MAX_PDF_PAGES = 100;
export const PDF_PARSE_TIMEOUT_MS = 15_000;
export const PDF_MAX_IMAGE_SIZE = 16_777_216;

/** Legacy DOCX compatibility type; removed when that adapter migrates in Task 3. */
export interface RawExtraction {
  text: string;
  pageCount: number | null;
  links: ExtractedLink[];
}

type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

function timeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CvPipelineError('EXTRACTOR_FAILED')),
      PDF_PARSE_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function asTextItems(items: Awaited<ReturnType<typeof extractTextItems>>['items'][number]): PdfTextItem[] {
  return items.map((item) => ({
    text: item.str,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    fontSize: item.fontSize,
    fontFamily: item.fontFamily,
    direction: item.dir,
    hasEOL: item.hasEOL,
  }));
}

function annotationUrl(annotation: Record<string, unknown>): string | null {
  const value = annotation.url ?? annotation.unsafeUrl;
  return typeof value === 'string' && value.trim() ? value : null;
}

function annotationRect(annotation: Record<string, unknown>): PdfAnnotation['rect'] | null {
  const rect = annotation.rect;
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((value) => typeof value === 'number')) {
    return null;
  }
  return [rect[0], rect[1], rect[2], rect[3]];
}

async function readPageAnnotations(proxy: PdfProxy): Promise<PdfAnnotation[]> {
  const annotations: PdfAnnotation[] = [];
  for (let pageNumber = 1; pageNumber <= proxy.numPages; pageNumber += 1) {
    try {
      const page = await proxy.getPage(pageNumber);
      for (const raw of await page.getAnnotations({ intent: 'display' })) {
        const annotation = raw as Record<string, unknown>;
        const url = annotationUrl(annotation);
        const rect = annotationRect(annotation);
        if (!url || !rect) continue;
        annotations.push({ page: pageNumber, url, rect });
      }
    } catch (error) {
      console.warn(
        '[cv-extraction] PDF annotations unavailable:',
        error instanceof Error ? error.name : 'Unknown error'
      );
    }
  }
  return annotations;
}

async function extractFromProxy(proxy: PdfProxy): Promise<NormalizedDocument> {
  if (proxy.numPages > MAX_PDF_PAGES) throw new CvPipelineError('EXTRACTOR_FAILED');

  const extracted = await extractTextItems(proxy);
  const allText = extracted.items.flat().map((item) => item.str).join('\n');
  const [annotations, formValues] = await Promise.all([
    readPageAnnotations(proxy),
    readPdfFormFields(proxy as unknown as PdfFormDocument, allText),
  ]);

  const bodyBlocks = extracted.items.flatMap((pageItems, pageIndex) => {
    const page = pageIndex + 1;
    const grouped = detectColumns(groupPdfPageItems(asTextItems(pageItems), page));
    return attachPdfAnnotations(
      grouped,
      annotations.filter((annotation) => annotation.page === page)
    );
  });

  const formBlocks: NormalizedDocumentBlock[] = formValues.map((field, index) => ({
    id: `pdf-form-${index}`,
    order: index,
    text: field.text,
    kind: 'paragraph',
    ...(field.page !== undefined ? { page: field.page } : {}),
    ...(field.x !== undefined && field.y !== undefined
      ? { layout: { x: field.x, y: field.y } }
      : {}),
  }));

  const blocks = [...formBlocks, ...bodyBlocks].map((block, order) => ({ ...block, order }));
  return { sourceType: 'pdf', pageCount: proxy.numPages, blocks };
}

/** Extract a PDF once through unpdf into transient provider-neutral blocks. */
export async function extractPdfDocument(bytes: Buffer): Promise<NormalizedDocument> {
  let proxy: PdfProxy | undefined;
  try {
    return await timeout((async () => {
      proxy = await getDocumentProxy(new Uint8Array(bytes), {
        maxImageSize: PDF_MAX_IMAGE_SIZE,
      });
      return extractFromProxy(proxy);
    })());
  } catch (error) {
    if (error instanceof CvPipelineError) throw error;
    console.warn(
      '[cv-extraction] PDF extraction failed:',
      error instanceof Error ? error.name : 'Unknown error'
    );
    throw new CvPipelineError('CORRUPT_DOCUMENT');
  } finally {
    try {
      await proxy?.cleanup?.();
    } catch {
      // Cleanup is best-effort and must not replace the extraction result.
    }
  }
}
