/**
 * Values typed into a PDF's form fields.
 *
 * A fillable PDF keeps what the user typed in an AcroForm field object, not in
 * the page's text layer, so a CV or application form built that way extracts as
 * its blank labels with every answer missing. The reader sees "Email:
 * rosa.mehta@example.com"; the text layer says "Email:".
 *
 * This runs ONLY when the document declares an AcroForm — a flag pdf-parse
 * already reports from the pass it makes anyway — so an ordinary CV, which is
 * almost all of them, pays nothing for it. When it does run it opens the
 * document a second time through pdfjs-dist, because pdf-parse exposes link
 * annotations and nothing else.
 */

/** A field object as pdf.js reports it. Only the parts used here are typed. */
interface PdfFieldObject {
  name?: string;
  value?: unknown;
  type?: string;
  hidden?: boolean;
  page?: number;
  /** [x0, y0, x1, y1] in PDF units, y measured up from the bottom. */
  rect?: number[];
}

/**
 * The lines a document's filled-in form fields contribute, in reading order.
 *
 * Ordered by page, then down the page, then across it, so the result reads the
 * way the form does rather than in whatever order the field dictionary happens
 * to list. Values already present in the extracted text are dropped: a form that
 * has been flattened shows its answers in BOTH places, and importing them twice
 * would propose every contact detail two times over.
 *
 * The field's NAME is deliberately not written out beside its value. The page
 * already prints the label — that is the whole point of a form — so repeating it
 * adds nothing, and "full name: Rosa Mehta" stops the name heuristic recognising
 * a name at all. What is missing from the text layer is the answer, so the
 * answer is what gets added.
 */
export async function readPdfFormFields(bytes: Buffer, extractedText: string): Promise<string[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // This is a server-side read of a user-uploaded file: no scripting, and no
      // fetching anything the document asks for.
      isEvalSupported: false,

    }).promise;

    try {
      const fields = (await document.getFieldObjects()) as Record<string, PdfFieldObject[]> | null;
      if (!fields) return [];

      const entries: { page: number; y: number; x: number; line: string }[] = [];
      const seen = new Set<string>();
      const haystack = extractedText.toLowerCase();

      for (const group of Object.values(fields)) {
        for (const field of group ?? []) {
          if (field.hidden) continue;
          // Only text-like answers. A checkbox reports "Off"/"Yes", which is not
          // a fact about the person that this pipeline can use.
          if (field.type && field.type !== 'text' && field.type !== 'combobox') continue;
          const value = typeof field.value === 'string' ? field.value.trim() : '';
          if (!value || value.length > 400) continue;
          if (haystack.includes(value.toLowerCase())) continue;

          if (seen.has(value)) continue;
          seen.add(value);

          const rect = field.rect ?? [];
          entries.push({
            page: field.page ?? 0,
            // Down the page: pdf.js reports y upward, so a larger y is higher.
            y: -(rect[3] ?? rect[1] ?? 0),
            x: rect[0] ?? 0,
            line: value,
          });
        }
      }

      entries.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
      return entries.map((entry) => entry.line);
    } finally {
      await document.destroy();
    }
  } catch (error) {
    // An enrichment, never a reason to fail an import: the text layer is the CV.
    console.warn(
      '[cv-extraction] PDF form fields unavailable:',
      error instanceof Error ? error.message : error
    );
    return [];
  }
}
