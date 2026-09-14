import { randomUUID } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';
import { storage, keyFor } from '@/shared/lib/storage';
import { entitlementsFor, sourceExpiryFrom } from '@/shared/lib/entitlements';
import type { PlanId } from '@/shared/entitlements/registry';
import { ANALYSIS_LIMITS, ANALYSIS_VERSIONS } from '@/shared/config/analysis-domain';
import { APIError } from '@/shared/utils/api-error';
import { checksumOf, loadOwnedStoredCv, extractStoredCvRecord } from './stored-cv';
import { extractStoredCv, validateUploadBytes, CvPipelineError } from './cv-extraction';

export interface CvRevisionInput {
  id: string;
  text: string;
  pageCount: number;
  filename: string;
  mimeType: string;
  checksum: string;
  byteSize: number;
}

function assertTextBounds(text: string): void {
  if (text.trim().length < 50) {
    throw new APIError('Could not extract enough text from this CV.', 400);
  }
  if (text.length > ANALYSIS_LIMITS.maxCvCharacters) {
    throw new APIError('The extracted CV text is too long to analyse safely.', 413);
  }
}

export async function resolveCvRevision(args: {
  userId: string;
  plan: PlanId;
  file?: File;
  storedCvId?: string;
}): Promise<CvRevisionInput> {
  if (Boolean(args.file) === Boolean(args.storedCvId)) {
    throw new APIError('Choose exactly one CV source.', 400);
  }

  if (args.storedCvId) {
    try {
      const stored = await loadOwnedStoredCv(args.userId, args.storedCvId);
      if (stored.objectDeletedAt) throw new CvPipelineError('SOURCE_UNAVAILABLE', 410);
      const extraction = await extractStoredCvRecord({ userId: args.userId, storedCvId: stored.id });
      const text = extraction.extractedText ?? '';
      assertTextBounds(text);

      const existing = await prisma.cvRevision.findFirst({
        where: { userId: args.userId, extractionId: extraction.id },
        orderBy: { createdAt: 'desc' },
      });
      const revision = existing ?? await prisma.cvRevision.create({
        data: {
          userId: args.userId,
          storedCvId: stored.id,
          extractionId: extraction.id,
          filename: stored.originalFilename,
          mimeType: stored.mimeType,
          byteSize: stored.sizeBytes,
          checksum: stored.checksum,
          extractedText: text,
          pageCount: extraction.pageCount,
          parserVersion: extraction.parserVersion,
          sourceObjectKey: stored.storageKey,
          sourceObjectExpiresAt: stored.retentionEndsAt,
        },
      });
      return {
        id: revision.id,
        text: revision.extractedText,
        pageCount: revision.pageCount ?? 1,
        filename: revision.filename,
        mimeType: revision.mimeType,
        checksum: revision.checksum,
        byteSize: revision.byteSize,
      };
    } catch (error) {
      if (error instanceof APIError) throw error;
      if (error instanceof CvPipelineError) throw new APIError(error.message, error.status);
      throw error;
    }
  }

  const file = args.file!;
  if (file.size > ANALYSIS_LIMITS.maxDirectMultipartCvBytes) throw new APIError('File too large.', 413);
  const bytes = Buffer.from(await file.arrayBuffer());
  const validated = validateUploadBytes(file.name, bytes);
  const extraction = await extractStoredCv(validated.bytes);
  assertTextBounds(extraction.text);
  const id = randomUUID();
  const filename = file.name || 'CV.pdf';
  const expiresAt = sourceExpiryFrom(entitlementsFor(args.plan));
  const objectKey = keyFor.upload(args.userId, id, filename);

  const revision = await prisma.cvRevision.create({
    data: {
      id,
      userId: args.userId,
      filename,
      mimeType: validated.mimeType,
      byteSize: validated.sizeBytes,
      checksum: checksumOf(validated.bytes),
      extractedText: extraction.text,
      pageCount: extraction.pageCount,
      parserVersion: extraction.parserVersion || ANALYSIS_VERSIONS.cvParser,
      sourceObjectExpiresAt: expiresAt,
    },
  });

  try {
    await storage.upload({ bucket: 'uploads', key: objectKey, body: bytes, contentType: validated.mimeType });
    await prisma.cvRevision.update({ where: { id }, data: { sourceObjectKey: objectKey } });
  } catch (error) {
    await prisma.cvRevision.delete({ where: { id } }).catch(() => undefined);
    console.warn('[cv-revision] Source archive failed:', error instanceof Error ? error.message : error);
    throw new APIError('We could not safely archive that CV.', 502);
  }

  return {
    id: revision.id,
    text: revision.extractedText,
    pageCount: revision.pageCount ?? 1,
    filename: revision.filename,
    mimeType: revision.mimeType,
    checksum: revision.checksum,
    byteSize: revision.byteSize,
  };
}

export async function cvRevisionDownloadUrl(userId: string, cvRevisionId: string): Promise<string> {
  const revision = await prisma.cvRevision.findFirst({ where: { id: cvRevisionId, userId } });
  if (!revision) throw new APIError('CV revision not found.', 404);
  if (!revision.sourceObjectKey || revision.sourceObjectDeletedAt) {
    throw new APIError('Source CV is no longer available for download.', 410);
  }
  return storage.createSignedUrl('uploads', revision.sourceObjectKey, 300);
}
