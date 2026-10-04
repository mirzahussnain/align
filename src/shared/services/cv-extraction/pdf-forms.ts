/** A field object as the PDF.js proxy exposed by unpdf reports it. */
interface PdfFieldObject {
  value?: unknown;
  type?: string;
  hidden?: boolean;
  page?: number;
  rect?: number[];
}

export interface PdfFormDocument {
  getFieldObjects(): Promise<Record<string, PdfFieldObject[]> | null>;
}

export interface PdfFormValue {
  text: string;
  page?: number;
  x?: number;
  y?: number;
}

/**
 * Read form values from the same unpdf proxy used for text extraction.
 * Values already present in the text layer are omitted so flattened forms do
 * not duplicate contact details.
 */
export async function readPdfFormFields(
  document: PdfFormDocument,
  extractedText: string
): Promise<PdfFormValue[]> {
  try {
    const fields = await document.getFieldObjects();
    if (!fields) return [];

    const entries: { page: number; y: number; x: number; text: string }[] = [];
    const seen = new Set<string>();
    const haystack = extractedText.toLocaleLowerCase();

    for (const group of Object.values(fields)) {
      for (const field of group ?? []) {
        if (field.hidden) continue;
        if (field.type && field.type !== 'text' && field.type !== 'combobox') continue;
        const value = typeof field.value === 'string' ? field.value.trim() : '';
        if (!value || value.length > 400 || haystack.includes(value.toLocaleLowerCase())) continue;
        if (seen.has(value)) continue;
        seen.add(value);

        const rect = field.rect ?? [];
        entries.push({
          page: field.page ?? 0,
          y: -(rect[3] ?? rect[1] ?? 0),
          x: rect[0] ?? 0,
          text: value,
        });
      }
    }

    entries.sort((left, right) => left.page - right.page || left.y - right.y || left.x - right.x);
    return entries.map((entry) => ({
      text: entry.text,
      page: entry.page + 1,
      x: entry.x,
      y: -entry.y,
    }));
  } catch (error) {
    console.warn(
      '[cv-extraction] PDF form fields unavailable:',
      error instanceof Error ? error.name : 'Unknown error'
    );
    return [];
  }
}
