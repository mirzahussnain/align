export const UPLOAD_POLICY = {
  cv: {
    formats: ['pdf', 'docx'],
    maxBytes: 10 * 1024 * 1024,
    maxDirectMultipartBytes: 4 * 1024 * 1024,
    mimeTypes: {
      pdf: ['application/pdf'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    },
    canonicalMimeTypes: {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
    extensions: {
      pdf: '.pdf',
      docx: '.docx',
    },
  },
  avatar: {
    maxBytes: 5 * 1024 * 1024,
  },
} as const;
