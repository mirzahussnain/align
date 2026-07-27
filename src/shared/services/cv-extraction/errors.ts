/**
 * Stable project error codes for the stored-CV and extraction pipeline.
 *
 * These are the ONLY codes that cross the API boundary for this feature. Raw
 * provider, library, Prisma or object-storage messages are never returned to a
 * client: they leak internals, they change between versions, and a UI cannot
 * translate them. Every code here has a fixed user-facing sentence in
 * `CV_PIPELINE_ERROR_MESSAGES` so the same failure always reads the same way.
 */
export const CV_PIPELINE_ERROR_CODES = [
  // Upload / validation
  'UNSUPPORTED_FORMAT',
  'SIGNATURE_MISMATCH',
  'FILE_TOO_LARGE',
  'FILE_EMPTY',
  'STORAGE_FAILED',
  'STORED_CV_LIMIT_REACHED',
  'DUPLICATE_STORED_CV',
  // Extraction
  'CORRUPT_DOCUMENT',
  'EMPTY_TEXT',
  'EXTRACTOR_FAILED',
  'EXTRACTION_NOT_READY',
  // Import
  'INVALID_PARSER_OUTPUT',
  'SOURCE_UNAVAILABLE',
  'CANDIDATE_NOT_FOUND',
  'CANDIDATE_CONFLICT',
  'IMPORT_FAILED',
  // Onboarding state machine
  'INVALID_TRANSITION',
  'ONBOARDING_STATE_MISSING',
  // Ownership / lifecycle
  'NOT_FOUND',
  'FORBIDDEN',
] as const;

export type CvPipelineErrorCode = (typeof CV_PIPELINE_ERROR_CODES)[number];

const CV_PIPELINE_ERROR_MESSAGES: Record<CvPipelineErrorCode, string> = {
  UNSUPPORTED_FORMAT: 'That file type is not supported. Upload a PDF or a Word document (.docx).',
  SIGNATURE_MISMATCH: 'That file does not look like the format its name suggests. Upload a genuine PDF or .docx file.',
  FILE_TOO_LARGE: 'That file is too large. The maximum size is 10MB.',
  FILE_EMPTY: 'That file is empty.',
  STORAGE_FAILED: 'We could not store your CV securely. Please try again.',
  STORED_CV_LIMIT_REACHED: 'You have reached the number of stored CVs your plan allows.',
  DUPLICATE_STORED_CV: 'You have already uploaded this CV.',
  CORRUPT_DOCUMENT: 'We could not read that file. It may be damaged or password protected.',
  EMPTY_TEXT: 'We could not find any text in that CV. It may be a scanned image rather than a text document.',
  EXTRACTOR_FAILED: 'We could not read your CV. Please try again, or continue by entering your details manually.',
  EXTRACTION_NOT_READY: 'Your CV is still being read. Give it a moment and try again.',
  INVALID_PARSER_OUTPUT: 'We could not turn that CV into profile details. You can still enter them manually.',
  SOURCE_UNAVAILABLE: 'The original file for this import is no longer available.',
  CANDIDATE_NOT_FOUND: 'That imported detail is no longer available.',
  CANDIDATE_CONFLICT: 'Some details conflict with your Career Profile and need your decision.',
  IMPORT_FAILED: 'We could not save those details. Please try again.',
  INVALID_TRANSITION: 'That step is not available yet.',
  ONBOARDING_STATE_MISSING: 'We could not find your progress. Starting again from the beginning.',
  NOT_FOUND: 'Not found.',
  FORBIDDEN: 'You do not have access to that.',
};

/**
 * A failure inside the stored-CV / extraction / import pipeline, carrying a
 * stable code rather than a stringly-typed message. Routes translate it once at
 * the boundary; nothing below the boundary formats user-facing text.
 */
export class CvPipelineError extends Error {
  readonly code: CvPipelineErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: CvPipelineErrorCode, status = 400, details?: Record<string, unknown>) {
    super(CV_PIPELINE_ERROR_MESSAGES[code]);
    this.name = 'CvPipelineError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function cvPipelineMessage(code: CvPipelineErrorCode): string {
  return CV_PIPELINE_ERROR_MESSAGES[code];
}

export function isCvPipelineErrorCode(value: unknown): value is CvPipelineErrorCode {
  return typeof value === 'string' && (CV_PIPELINE_ERROR_CODES as readonly string[]).includes(value);
}
