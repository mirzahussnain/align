import 'server-only';
import {
  definePDFJSModule,
  getDocumentProxy,
  renderPageAsImage,
} from 'unpdf';

export const MAX_PREVIEW_PDF_PAGES = 10;
export const PDF_PREVIEW_PARSE_TIMEOUT_MS = 15_000;
export const PDF_PREVIEW_RENDER_TIMEOUT_MS = 20_000;
export const PDF_PREVIEW_WIDTH = 1_200;
const PDF_MAX_IMAGE_SIZE = 16_777_216;

export type PageValidationFailureCode =
  | 'PAGE_VALIDATION_UNAVAILABLE'
  | 'PAGE_LIMIT_EXCEEDED';

export interface ObservedPageCount {
  profile: string;
  pageCount: number;
}

export class PageValidationError extends Error {
  constructor(
    readonly code: PageValidationFailureCode,
    readonly observed: ObservedPageCount[] = [],
  ) {
    super(
      code === 'PAGE_LIMIT_EXCEEDED'
        ? 'Approved CV content exceeds the two-page limit'
        : 'Rendered PDF page validation is unavailable',
    );
    this.name = 'PageValidationError';
  }
}

type PdfProxy = Awaited<ReturnType<typeof getDocumentProxy>>;

let pdfJsSetup: Promise<void> | undefined;

function ensurePdfJs() {
  pdfJsSetup ??= definePDFJSModule(
    () => import('pdfjs-dist/legacy/build/pdf.mjs'),
  );
  return pdfJsSetup;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new PageValidationError('PAGE_VALIDATION_UNAVAILABLE')),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function assertPdfBytes(pdf: Buffer) {
  if (pdf.length < 5 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
  }
}

function assertSafePageCount(pageCount: number) {
  if (
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > MAX_PREVIEW_PDF_PAGES
  ) {
    throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
  }
}

async function openPdf(pdf: Buffer): Promise<PdfProxy> {
  assertPdfBytes(pdf);
  await ensurePdfJs();
  return withTimeout(
    getDocumentProxy(Uint8Array.from(pdf), {
      maxImageSize: PDF_MAX_IMAGE_SIZE,
      useSystemFonts: true,
    }),
    PDF_PREVIEW_PARSE_TIMEOUT_MS,
  );
}

async function cleanup(proxy: PdfProxy | undefined) {
  try {
    await proxy?.cleanup?.();
  } catch {
    // Best-effort cleanup must not replace the validation result.
  }
}

function unavailable(error: unknown): never {
  if (error instanceof PageValidationError) throw error;
  throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
}

export async function inspectPdf(pdf: Buffer): Promise<{ pageCount: number }> {
  let proxy: PdfProxy | undefined;
  try {
    proxy = await openPdf(pdf);
    assertSafePageCount(proxy.numPages);
    return { pageCount: proxy.numPages };
  } catch (error) {
    return unavailable(error);
  } finally {
    await cleanup(proxy);
  }
}

export async function renderPdfPages(
  pdf: Buffer,
  pageCount: 1 | 2,
): Promise<Buffer[]> {
  let proxy: PdfProxy | undefined;
  try {
    if (pageCount !== 1 && pageCount !== 2) {
      throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
    }
    proxy = await openPdf(pdf);
    assertSafePageCount(proxy.numPages);
    if (proxy.numPages !== pageCount) {
      throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
    }
    const pages: Buffer[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const image = await withTimeout(
        renderPageAsImage(proxy, pageNumber, {
          canvasImport: () => import('@napi-rs/canvas'),
          width: PDF_PREVIEW_WIDTH,
        }),
        PDF_PREVIEW_RENDER_TIMEOUT_MS,
      );
      const png = Buffer.from(image);
      if (
        png.length < 24 ||
        !png.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      ) {
        throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
      }
      const width = png.readUInt32BE(16);
      const height = png.readUInt32BE(20);
      if (width > PDF_PREVIEW_WIDTH || height > 1_704) {
        throw new PageValidationError('PAGE_VALIDATION_UNAVAILABLE');
      }
      pages.push(png);
    }
    return pages;
  } catch (error) {
    return unavailable(error);
  } finally {
    await cleanup(proxy);
  }
}
