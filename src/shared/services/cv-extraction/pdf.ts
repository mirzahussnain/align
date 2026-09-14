import { CvPipelineError } from './errors';
import { normaliseExtractedText } from './text';
import { mergeLinks, normaliseUrl, splitMarkdownLinks, type ExtractedLink } from './links';
import { readPdfFormFields } from './pdf-forms';

/**
 * Minimal typing for pdf-parse's class API — the package's own types don't cover
 * the worker-based entry point used here. Mirrors src/shared/utils/pdf-parser.ts,
 * which remains the analyse route's path and is deliberately left untouched.
 */
interface PDFParseModule {
  PDFParse: new (options: { data: Buffer }) => {
    load(): Promise<void>;
    getText(params?: { parseHyperlinks?: boolean }): Promise<{ pages: { text: string }[]; total: number }>;
    getInfo(params?: { parsePageInfo?: boolean }): Promise<{
      info?: { IsAcroFormPresent?: boolean };
      pages?: { pageNumber: number; links?: { text: string; url: string }[] }[];
    }>;
    destroy(): Promise<void>;
  };
}

export interface RawExtraction {
  text: string;
  pageCount: number | null;
  /** Hyperlink targets recovered from the document, see ./links.ts. */
  links: ExtractedLink[];
}

/**
 * Read the text of a PDF, and the addresses behind its links.
 *
 * Verified coverage: the text layer of ordinary text-based PDFs page by page,
 * plus `/Link` annotation targets — the ones a reader clicks, whose visible label
 * is often just "LinkedIn" or "Repo" and whose address appears nowhere in the
 * text layer. Both link passes run because they fail differently:
 *
 *   - `getText({ parseHyperlinks: true })` places a link on a LINE, by matching
 *     the annotation rectangle against text-item positions. That position is what
 *     lets a repository URL attach to the project it sits beside. It misses a
 *     link whose rectangle does not line up with a single text item;
 *   - `getInfo({ parsePageInfo: true })` reads the annotations directly and
 *     misses nothing, but knows only the page.
 *
 * Neither is a superset of the other — on the CV that prompted this work the
 * positional pass found four of five links and dropped the LinkedIn one — so the
 * results are merged, positioned copies winning.
 *
 * Values typed into AcroForm fields are read too, but only for a document that
 * declares a form — see ./pdf-forms.ts.
 *
 * NOT covered, and not claimed anywhere in the UI: scanned/image-only PDFs, for
 * which no OCR is performed and which surface as EMPTY_TEXT. Encrypted or
 * damaged files fail as CORRUPT_DOCUMENT.
 */
export async function extractPdf(bytes: Buffer): Promise<RawExtraction> {
  let parser: InstanceType<PDFParseModule['PDFParse']> | undefined;
  try {
    await import('pdf-parse/worker');
    const { PDFParse } = (await import('pdf-parse')) as unknown as PDFParseModule;
    parser = new PDFParse({ data: bytes });
    await parser.load();
    const data = await parser.getText({ parseHyperlinks: true });
    if (!data?.pages?.length) throw new CvPipelineError('CORRUPT_DOCUMENT');

    // Normalise FIRST, then strip the link markup line by line. Normalisation
    // collapses blank runs and so renumbers lines; stripping `[label](url)` down
    // to `label` never adds or removes one. Doing it in this order is what makes
    // the recorded line index point at the same line in the stored text.
    const normalised = normaliseExtractedText(data.pages.map((page) => page.text).join('\n'));
    const lines: string[] = [];
    const positioned: ExtractedLink[] = [];
    normalised.split('\n').forEach((line, index) => {
      const { text, links } = splitMarkdownLinks(line);
      lines.push(text);
      for (const link of links) {
        positioned.push({ ...link, line: index, surroundingText: text.trim() || undefined });
      }
    });

    const { links: annotationLinks, hasAcroForm } = await readDocumentInfo(parser);

    // Filled-in form fields go ABOVE the text layer, and only for a document
    // that actually has an AcroForm. A fillable CV keeps its contact details in
    // fields near the top, so the head block is where they belong and where
    // identity reading looks. Prepending renumbers every line, so the links
    // already placed against the text layer are shifted by the same amount —
    // otherwise a project's repository link would drift onto another entry.
    const fieldLines = hasAcroForm ? await readPdfFormFields(bytes, lines.join('\n')) : [];
    const shifted = fieldLines.length
      ? positioned.map((link) =>
          link.line === undefined ? link : { ...link, line: link.line + fieldLines.length }
        )
      : positioned;

    return {
      text: [...fieldLines, ...lines].join('\n'),
      pageCount: data.total ?? data.pages.length,
      links: mergeLinks(shifted, annotationLinks),
    };
  } catch (error) {
    if (error instanceof CvPipelineError) throw error;
    // The library's own message is never surfaced: it names internal offsets and
    // varies between versions. It is logged without any document content.
    console.warn('[cv-extraction] PDF extraction failed:', error instanceof Error ? error.message : error);
    throw new CvPipelineError('CORRUPT_DOCUMENT');
  } finally {
    // Frees the worker even when parsing threw; a leaked one keeps the process
    // alive between requests.
    await parser?.destroy().catch(() => undefined);
  }
}

/**
 * One document-level pass: every `/Link` annotation, page-tagged but not
 * line-tagged, and whether the document has a form at all.
 *
 * The AcroForm flag comes free from a pass that is being made anyway, and it is
 * what keeps form-field reading off the common path: an ordinary CV declares no
 * form and is never opened a second time.
 *
 * Failing here is not failing the extraction. The text is the CV; the links are
 * an enrichment, and a document whose annotation dictionary defeats the library
 * must still import its experience, education and skills.
 */
async function readDocumentInfo(
  parser: InstanceType<PDFParseModule['PDFParse']>
): Promise<{ links: ExtractedLink[]; hasAcroForm: boolean }> {
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const links: ExtractedLink[] = [];
    for (const page of info.pages ?? []) {
      for (const link of page.links ?? []) {
        const url = normaliseUrl(link.url);
        if (!url) continue;
        links.push({
          url,
          ...(link.text?.trim() ? { visibleText: link.text.trim() } : {}),
          page: page.pageNumber,
        });
      }
    }
    return { links, hasAcroForm: Boolean(info.info?.IsAcroFormPresent) };
  } catch (error) {
    console.warn(
      '[cv-extraction] PDF document info unavailable:',
      error instanceof Error ? error.message : error
    );
    return { links: [], hasAcroForm: false };
  }
}
