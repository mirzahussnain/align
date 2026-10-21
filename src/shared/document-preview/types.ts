export type PreviewStatus = 'PENDING' | 'RENDERING' | 'READY' | 'FAILED';

export type PreviewFailureCode =
  | 'THUMBNAIL_RENDER_FAILED'
  | 'PREVIEW_STORAGE_FAILED'
  | 'PREVIEW_LEASE_EXPIRED';

export interface PreviewRecord {
  id: string;
  generatedCvId: string;
  userId: string;
  documentHash: string;
  rendererVersion: string;
  status: PreviewStatus;
  failureCode: PreviewFailureCode | null;
  pageCount: number | null;
  pdfKey: string | null;
  pageImageKeys: string[];
  pdfSize: number | null;
  pageImageSizes: number[];
  attemptCount: number;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
