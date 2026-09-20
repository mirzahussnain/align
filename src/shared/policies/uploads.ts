const CV_FORMATS = ['pdf', 'docx'] as const;
type CvUploadFormat = (typeof CV_FORMATS)[number];

const CV_MIME_TYPES = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
} as const satisfies Record<CvUploadFormat, readonly [string, ...string[]]>;

const CV_CANONICAL_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const satisfies Record<CvUploadFormat, string>;

const CV_EXTENSIONS = {
  pdf: '.pdf',
  docx: '.docx',
} as const satisfies Record<CvUploadFormat, string>;

const CV_ACCEPTED_MIME_TYPES = CV_FORMATS.flatMap((format) => CV_MIME_TYPES[format]);
const CV_FILE_INPUT_ACCEPT = [
  ...CV_FORMATS.map((format) => CV_EXTENSIONS[format]),
  ...CV_ACCEPTED_MIME_TYPES,
].join(',');

export const UPLOAD_POLICY = {
  cv: {
    formats: CV_FORMATS,
    maxBytes: 10 * 1024 * 1024,
    maxDirectMultipartBytes: 4 * 1024 * 1024,
    mimeTypes: CV_MIME_TYPES,
    canonicalMimeTypes: CV_CANONICAL_MIME_TYPES,
    extensions: CV_EXTENSIONS,
    acceptedMimeTypes: CV_ACCEPTED_MIME_TYPES,
    fileInputAccept: CV_FILE_INPUT_ACCEPT,
  },
  avatar: {
    maxBytes: 5 * 1024 * 1024,
  },
} as const;
