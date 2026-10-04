import { afterEach, describe, expect, it, vi } from 'vitest';
import { CvPipelineError } from '../errors';
import { extractPdfDocument } from '../pdf';
import {
  attachPdfAnnotations,
  detectColumns,
  groupPdfPageItems,
  type PdfTextItem,
} from '../document/pdf-layout';
import { emptyPdf, minimalPdf, pdfWithUnplacedLink, twoColumnPdf } from './fixtures';

const unpdfControl = vi.hoisted(() => ({
  getDocumentProxy: undefined as undefined | ((...args: unknown[]) => unknown),
  extractTextItems: undefined as undefined | ((...args: unknown[]) => unknown),
}));

vi.mock('unpdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('unpdf')>();
  return {
    ...actual,
    getDocumentProxy: (...args: unknown[]) =>
      unpdfControl.getDocumentProxy
        ? unpdfControl.getDocumentProxy(...args)
        : actual.getDocumentProxy(...(args as Parameters<typeof actual.getDocumentProxy>)),
    extractTextItems: (...args: unknown[]) =>
      unpdfControl.extractTextItems
        ? unpdfControl.extractTextItems(...args)
        : actual.extractTextItems(...(args as Parameters<typeof actual.extractTextItems>)),
  };
});

afterEach(() => {
  unpdfControl.getDocumentProxy = undefined;
  unpdfControl.extractTextItems = undefined;
  vi.useRealTimers();
});

async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof CvPipelineError ? error.code : 'WRONG_ERROR_TYPE';
  }
}

describe('PDF normalized adapter', () => {
  it('retains page geometry, font, direction, exact order, links, and compound tokens', async () => {
    const document = await extractPdfDocument(
      minimalPdf([
        'PROFILE',
        { text: 'API/Integration Testing', url: 'https://example.com/profile' },
        'CI/CD and OAuth/OIDC',
      ])
    );

    expect(document.sourceType).toBe('pdf');
    expect(document.pageCount).toBe(1);
    expect(document.blocks.map((block) => block.text)).toEqual([
      'PROFILE',
      'API/Integration Testing',
      'CI/CD and OAuth/OIDC',
    ]);
    expect(document.blocks[0]).toMatchObject({
      page: 1,
      layout: { x: 72, y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) },
      style: { fontSize: 12 },
    });
    expect(document.blocks[0].layout?.y).toBeGreaterThan(document.blocks[1].layout?.y ?? 0);
    expect(document.blocks[0]).toHaveProperty('direction', 'ltr');
    expect(document.blocks[1].links).toEqual(['https://example.com/profile']);
  });

  it('keeps stable left and right streams despite interleaved content-stream order', async () => {
    const document = await extractPdfDocument(twoColumnPdf());

    expect(document.blocks.map((block) => block.text)).toEqual([
      'Left one',
      'Left two',
      'Left three',
      'Left four',
      'Right one',
      'Right two',
      'Right three',
      'Right four',
    ]);
    expect(document.blocks.map((block) => block.layout?.column)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it('preserves a page link that cannot be placed on a text rectangle', async () => {
    const document = await extractPdfDocument(pdfWithUnplacedLink());

    expect(document.blocks).toContainEqual(
      expect.objectContaining({
        kind: 'link',
        page: 1,
        links: ['https://example.com/unplaced'],
        layout: expect.objectContaining({ x: 500, y: 40 }),
      })
    );
  });

  it('returns no blocks for a valid raster-only page', async () => {
    await expect(extractPdfDocument(emptyPdf())).resolves.toMatchObject({
      sourceType: 'pdf',
      pageCount: 1,
      blocks: [],
    });
  });

  it('maps damaged input to CORRUPT_DOCUMENT', async () => {
    const damaged = Buffer.from('%PDF-1.4\nnot really a pdf');
    expect(await errorCode(() => extractPdfDocument(damaged))).toBe('CORRUPT_DOCUMENT');
  });

  it('rejects a document over the page limit and cleans up the proxy', async () => {
    const cleanup = vi.fn();
    unpdfControl.getDocumentProxy = vi.fn().mockResolvedValue({ numPages: 101, cleanup });

    expect(await errorCode(() => extractPdfDocument(Buffer.from('%PDF-fake')))).toBe('EXTRACTOR_FAILED');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('maps a parse timeout to EXTRACTOR_FAILED', async () => {
    vi.useFakeTimers();
    unpdfControl.getDocumentProxy = vi.fn(() => new Promise(() => undefined));

    const extraction = extractPdfDocument(Buffer.from('%PDF-fake'));
    const rejection = expect(extraction).rejects.toMatchObject({ code: 'EXTRACTOR_FAILED' });
    await vi.advanceTimersByTimeAsync(15_000);

    await rejection;
  });
});

describe('PDF page layout', () => {
  it('uses end-of-line as a hard boundary and otherwise joins only adjacent same-line items', () => {
    const items: PdfTextItem[] = [
      { text: 'API/Integration', x: 72, y: 700, width: 95, height: 12, fontSize: 12, direction: 'ltr' },
      { text: ' Testing', x: 168, y: 700.5, width: 42, height: 12, fontSize: 12, direction: 'ltr', hasEOL: true },
      { text: 'CI/CD', x: 72, y: 680, width: 35, height: 12, fontSize: 12, direction: 'ltr' },
    ];

    expect(groupPdfPageItems(items, 1)).toEqual([
      expect.objectContaining({
        id: 'pdf-p1-b0',
        text: 'API/Integration Testing',
        page: 1,
        direction: 'ltr',
        layout: { x: 72, y: 700, width: 138, height: 12.5 },
        style: { fontSize: 12 },
      }),
      expect.objectContaining({ id: 'pdf-p1-b1', text: 'CI/CD' }),
    ]);
  });

  it('declines a right-aligned date tail as a second column', () => {
    const blocks = Array.from({ length: 5 }, (_, index) => ({
      id: `pdf-p1-b${index}`,
      order: index,
      text: `Role ${index}`,
      kind: 'paragraph' as const,
      page: 1,
      layout: { x: 72, y: 700 - index * 20, width: 260, height: 12 },
    })).flatMap((block, index) => [
      block,
      {
        id: `pdf-p1-date-${index}`,
        order: 10 + index,
        text: `${2020 + index} - ${2021 + index}`,
        kind: 'paragraph' as const,
        page: 1,
        layout: { x: 430, y: block.layout.y, width: 80, height: 12 },
      },
    ]);

    expect(detectColumns(blocks).every((block) => block.layout?.column === undefined)).toBe(true);
  });

  it('attaches annotations only by same-page rectangle overlap', () => {
    const blocks = groupPdfPageItems(
      [{ text: 'Portfolio', x: 72, y: 700, width: 60, height: 12, fontSize: 12, direction: 'ltr' }],
      1
    );

    const attached = attachPdfAnnotations(blocks, [
      { page: 1, url: 'https://example.com', rect: [70, 698, 140, 714] },
      { page: 2, url: 'https://wrong-page.example.com', rect: [70, 698, 140, 714] },
    ]);

    expect(attached[0].links).toEqual(['https://example.com']);
    expect(attached).toContainEqual(
      expect.objectContaining({ kind: 'link', page: 2, links: ['https://wrong-page.example.com'] })
    );
  });
});
