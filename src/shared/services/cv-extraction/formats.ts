import { CvPipelineError } from './errors';

/**
 * Container formats the CV pipeline accepts at launch.
 *
 * Deliberately short. Every format here has a real, tested extractor behind it;
 * `.doc` (the pre-2007 binary format), `.rtf`, `.txt`, `.odt` and images are
 * rejected rather than half-supported, because a format that silently extracts
 * nothing is worse than one the user is told to convert.
 */
export const SUPPORTED_CV_FORMATS = ['pdf', 'docx'] as const;
export type CvSourceFormat = (typeof SUPPORTED_CV_FORMATS)[number];

/** Maximum accepted upload, matching the existing analyse route's limit. */
export const MAX_CV_UPLOAD_BYTES = 10 * 1024 * 1024;

export const CV_FORMAT_MIME_TYPES: Record<CvSourceFormat, readonly string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** Canonical content type stored on the row and sent to object storage. */
export const CV_FORMAT_CANONICAL_MIME: Record<CvSourceFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const CV_FORMAT_EXTENSIONS: Record<CvSourceFormat, string> = {
  pdf: '.pdf',
  docx: '.docx',
};

function extensionFormat(filename: string): CvSourceFormat | null {
  const lower = filename.toLowerCase();
  for (const format of SUPPORTED_CV_FORMATS) {
    if (lower.endsWith(CV_FORMAT_EXTENSIONS[format])) return format;
  }
  return null;
}

const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
// An empty or "spanned" archive still starts with PK but is not a document.
const ZIP_EMPTY_MAGIC = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

/**
 * What the BYTES say this file is, ignoring its name and its declared MIME type.
 *
 * This is the check that matters. A browser's `File.type` comes from the OS file
 * association and an attacker sets both name and type freely, so neither can be
 * trusted to decide what a parser is handed. A `.docx` is an OOXML ZIP, so the
 * ZIP magic is confirmed and then the archive is probed for the WordprocessingML
 * part — a renamed `.xlsx` or a plain `.zip` passes the magic check but has no
 * `word/document.xml` and is rejected here rather than inside the extractor.
 */
export function detectFormatFromBytes(bytes: Buffer): CvSourceFormat | null {
  if (bytes.length >= PDF_MAGIC.length && bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'pdf';
  }
  if (bytes.length >= 4) {
    const head = bytes.subarray(0, 4);
    if (head.equals(ZIP_MAGIC) && looksLikeWordprocessingML(bytes)) return 'docx';
    if (head.equals(ZIP_EMPTY_MAGIC)) return null;
  }
  return null;
}

/**
 * Does this ZIP contain a WordprocessingML main document part?
 *
 * Scans for the stored filename rather than fully parsing the archive: entry
 * names appear in clear text in both the local headers and the central
 * directory regardless of the compression used for their contents, so a
 * substring search is sufficient to tell a Word document from a spreadsheet or
 * an arbitrary zip. The real parse is mammoth's job; this only decides whether
 * handing it the file is reasonable at all.
 */
function looksLikeWordprocessingML(bytes: Buffer): boolean {
  return bytes.includes(Buffer.from('word/document.xml', 'ascii'));
}

export interface ValidatedUpload {
  format: CvSourceFormat;
  /** The canonical MIME type for the detected format, never the client's. */
  mimeType: string;
  bytes: Buffer;
  sizeBytes: number;
}

/**
 * Validate an uploaded file before a single byte reaches storage.
 *
 * Order matters: size first (cheapest, and bounds everything after it), then the
 * signature, and only then the agreement between the signature and the file's
 * name. The extension is checked LAST and only to catch a mislabelled upload —
 * the detected format always wins, so a genuine PDF named `cv.docx` is rejected
 * as a mismatch instead of being silently sent to the wrong parser.
 */
export function validateUploadBytes(filename: string, bytes: Buffer): ValidatedUpload {
  if (bytes.length === 0) throw new CvPipelineError('FILE_EMPTY');
  if (bytes.length > MAX_CV_UPLOAD_BYTES) throw new CvPipelineError('FILE_TOO_LARGE', 413);

  const detected = detectFormatFromBytes(bytes);
  const claimed = extensionFormat(filename);

  if (!detected) {
    // A recognised extension whose bytes are not that format is a mismatch; an
    // unrecognised extension is simply an unsupported format. The distinction is
    // what lets the UI say "convert this to PDF" vs "this file looks damaged".
    throw new CvPipelineError(claimed ? 'SIGNATURE_MISMATCH' : 'UNSUPPORTED_FORMAT');
  }
  if (claimed && claimed !== detected) throw new CvPipelineError('SIGNATURE_MISMATCH');

  return {
    format: detected,
    mimeType: CV_FORMAT_CANONICAL_MIME[detected],
    bytes,
    sizeBytes: bytes.length,
  };
}
