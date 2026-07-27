import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { StoredCvStatus, CvExtractionStatus } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';
import { assertStoredSourceCvLimit } from '@/shared/entitlements/server';
import { entitlementsFor, sourceExpiryFrom } from '@/shared/lib/entitlements';
import type { PlanId } from '@/shared/entitlements/registry';
import {
  CvPipelineError,
  extractStoredCv,
  validateUploadBytes,
  parseStoredExtractionPayload,
  CV_PARSER_VERSION,
  type CvExtractionPayload,
} from './cv-extraction';

/**
 * Stored source CVs: the original file a user uploads, kept once and imported
 * into as many Career Profiles as they like.
 *
 * Everything here is server-authoritative. The storage key, the provider, the
 * checksum, the MIME type and the retention date are all derived here and never
 * accepted from a request — a client that could choose its own storage key could
 * read or overwrite another user's object.
 */

const STORAGE_PROVIDER = 's3';
/** The private bucket already used for archived analysis uploads. */
const STORAGE_BUCKET = 'uploads' as const;

/** sha256 of the bytes, lowercase hex. The identity used for deduplication. */
export function checksumOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * The object key for a stored CV.
 *
 * Built entirely from server-side values: the owner's id, a fresh random id and
 * a fixed extension. The user's filename is deliberately NOT part of the key —
 * it is display metadata, and keeping it out means no amount of `../`, control
 * characters or unicode trickery in a filename can influence where the object
 * lands. Namespaced under the owner so everything for one user is listable and
 * deletable by prefix.
 */
export function storedCvKey(userId: string, storedCvId: string, format: string): string {
  return `users/${userId}/stored-cv/${storedCvId}.${format}`;
}

export interface StoredCvSummary {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sourceFormat: string;
  status: StoredCvStatus;
  checksum: string;
  createdAt: Date;
  retentionEndsAt: Date | null;
  /** False once the binary has been swept or deleted; the row survives. */
  objectAvailable: boolean;
}

function toSummary(row: {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sourceFormat: string;
  status: StoredCvStatus;
  checksum: string;
  createdAt: Date;
  retentionEndsAt: Date | null;
  objectDeletedAt: Date | null;
}): StoredCvSummary {
  return {
    id: row.id,
    originalFilename: row.originalFilename,
    sizeBytes: row.sizeBytes,
    sourceFormat: row.sourceFormat,
    status: row.status,
    checksum: row.checksum,
    createdAt: row.createdAt,
    retentionEndsAt: row.retentionEndsAt,
    objectAvailable: row.objectDeletedAt === null,
  };
}

export type UploadOutcome =
  | { kind: 'created'; storedCv: StoredCvSummary }
  | { kind: 'duplicate'; storedCv: StoredCvSummary };

/**
 * Validate, store and record an uploaded CV.
 *
 * Order is deliberate and is the whole point of this function:
 *
 *   1. validate the bytes  — cheap, and rejects before anything is held;
 *   2. checksum + dedupe   — an identical file already uploaded returns the
 *                            existing row instead of a second copy;
 *   3. reserve the slot    — the resource limit is asserted INSIDE the row
 *                            transaction under an advisory lock, so two
 *                            concurrent uploads cannot both take the last one;
 *   4. upload the object   — only once a slot is definitely held, so a user at
 *                            their limit never starts a partial upload;
 *   5. mark it STORED.
 *
 * If step 4 fails the row is rolled forward to FAILED and soft-deleted rather
 * than left claiming a slot for an object that does not exist.
 */
export async function storeUploadedCv(args: {
  userId: string;
  plan: PlanId;
  filename: string;
  bytes: Buffer;
}): Promise<UploadOutcome> {
  const validated = validateUploadBytes(args.filename, args.bytes);
  const checksum = checksumOf(validated.bytes);

  // Deduplicate before consuming a slot. Filename is display metadata only, so
  // the same CV re-uploaded under a new name resolves to the same row.
  const existing = await prisma.storedCv.findUnique({
    where: { userId_checksum: { userId: args.userId, checksum } },
  });
  if (existing && !existing.deletedAt) {
    return { kind: 'duplicate', storedCv: toSummary(existing) };
  }

  const retentionEndsAt = sourceExpiryFrom(entitlementsFor(args.plan));
  const id = randomUUID();
  const storageKey = storedCvKey(args.userId, id, validated.format);

  // A previously soft-deleted upload of the same bytes is revived rather than
  // inserted alongside — (userId, checksum) is unique, and the user is doing
  // exactly what they did before.
  const created = await prisma.$transaction(async (tx) => {
    await assertStoredSourceCvLimit(args.userId, tx);
    return tx.storedCv.upsert({
      where: { userId_checksum: { userId: args.userId, checksum } },
      create: {
        id,
        userId: args.userId,
        storageProvider: STORAGE_PROVIDER,
        storageKey,
        originalFilename: safeDisplayFilename(args.filename),
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        checksum,
        sourceFormat: validated.format,
        status: StoredCvStatus.UPLOADING,
        retentionEndsAt,
      },
      update: {
        storageKey,
        originalFilename: safeDisplayFilename(args.filename),
        status: StoredCvStatus.UPLOADING,
        retentionEndsAt,
        objectDeletedAt: null,
        deletedAt: null,
      },
    });
  });

  try {
    await storage.upload({
      bucket: STORAGE_BUCKET,
      key: created.storageKey,
      body: validated.bytes,
      contentType: validated.mimeType,
    });
  } catch (error) {
    // Never leave a row claiming a slot for an object that is not there.
    console.warn('[stored-cv] Upload failed:', error instanceof Error ? error.message : error);
    await prisma.storedCv
      .update({ where: { id: created.id }, data: { status: StoredCvStatus.FAILED, deletedAt: new Date() } })
      .catch(() => undefined);
    throw new CvPipelineError('STORAGE_FAILED', 502);
  }

  const stored = await prisma.storedCv.update({
    where: { id: created.id },
    data: { status: StoredCvStatus.STORED },
  });
  return { kind: 'created', storedCv: toSummary(stored) };
}

/**
 * A filename safe to store and render back. Path separators and control
 * characters go — the key never contains it, but it is shown in the UI and
 * written to logs, and neither should be steerable by an upload.
 */
const PATH_SEPARATORS = new Set(['/', String.fromCharCode(0x5c)]);

function safeDisplayFilename(filename: string): string {
  const cleaned = [...(filename || '')]
    // Control characters are dropped by code point, so no invisible byte has to
    // appear in this source in order to express the range.
    .filter((character) => (character.codePointAt(0) ?? 0) >= 0x20)
    .map((character) => (PATH_SEPARATORS.has(character) ? '_' : character))
    .join('')
    .slice(0, 200)
    .trim();
  return cleaned || 'CV';
}

/** One stored CV, only if this user owns it and it is not soft-deleted. */
export async function loadOwnedStoredCv(userId: string, storedCvId: string) {
  const row = await prisma.storedCv.findFirst({ where: { id: storedCvId, userId, deletedAt: null } });
  if (!row) throw new CvPipelineError('NOT_FOUND', 404);
  return row;
}

/** Every stored CV a user still holds, newest first. */
export async function listStoredCvs(userId: string): Promise<StoredCvSummary[]> {
  const rows = await prisma.storedCv.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(toSummary);
}

/**
 * Run extraction for a stored CV and persist the result as a NEW extraction row.
 *
 * Never overwrites an earlier attempt: candidates already confirmed cite an
 * extraction's parser version and excerpts as durable provenance, so a retry
 * takes the next attempt number instead. Reusing an existing READY extraction
 * for the same parser version is the fast path — extraction is deterministic, so
 * re-reading the same bytes with the same parser cannot produce anything new.
 */
export async function extractStoredCvRecord(args: {
  userId: string;
  storedCvId: string;
  force?: boolean;
}) {
  const storedCv = await loadOwnedStoredCv(args.userId, args.storedCvId);

  if (!args.force) {
    const ready = await prisma.cvExtraction.findFirst({
      where: { storedCvId: storedCv.id, parserVersion: CV_PARSER_VERSION, status: CvExtractionStatus.READY },
      orderBy: { attempt: 'desc' },
    });
    if (ready) return ready;
  }

  if (storedCv.objectDeletedAt) throw new CvPipelineError('SOURCE_UNAVAILABLE', 410);

  const attempt =
    ((
      await prisma.cvExtraction.aggregate({
        where: { storedCvId: storedCv.id, parserVersion: CV_PARSER_VERSION },
        _max: { attempt: true },
      })
    )._max.attempt ?? 0) + 1;

  const extraction = await prisma.cvExtraction.create({
    data: {
      storedCvId: storedCv.id,
      parserVersion: CV_PARSER_VERSION,
      attempt,
      sourceFormat: storedCv.sourceFormat,
      status: CvExtractionStatus.PROCESSING,
    },
  });
  await prisma.storedCv.update({ where: { id: storedCv.id }, data: { status: StoredCvStatus.EXTRACTING } });

  try {
    const bytes = await storage.download(STORAGE_BUCKET, storedCv.storageKey);
    const result = await extractStoredCv(bytes);
    const [updated] = await prisma.$transaction([
      prisma.cvExtraction.update({
        where: { id: extraction.id },
        data: {
          status: CvExtractionStatus.READY,
          extractedText: result.text,
          structuredData: result.structured as unknown as Prisma.InputJsonValue,
          pageCount: result.pageCount,
        },
      }),
      prisma.storedCv.update({ where: { id: storedCv.id }, data: { status: StoredCvStatus.READY } }),
    ]);
    return updated;
  } catch (error) {
    // The stored CV itself is fine — only reading it failed. The row keeps its
    // stable code so a retry or a manual fallback can be offered honestly, and
    // no CV content is written to the log.
    const code = error instanceof CvPipelineError ? error.code : 'EXTRACTOR_FAILED';
    console.warn(`[stored-cv] Extraction failed (${code}) for stored CV ${storedCv.id}.`);
    await prisma.$transaction([
      prisma.cvExtraction.update({
        where: { id: extraction.id },
        data: { status: CvExtractionStatus.FAILED, errorCode: code },
      }),
      prisma.storedCv.update({ where: { id: storedCv.id }, data: { status: StoredCvStatus.FAILED } }),
    ]);
    throw error instanceof CvPipelineError ? error : new CvPipelineError('EXTRACTOR_FAILED', 502);
  }
}

/** The validated structured payload of a READY extraction the user owns. */
export async function loadOwnedExtraction(
  userId: string,
  extractionId: string
): Promise<{ extraction: { id: string; storedCvId: string; parserVersion: string; extractedText: string }; structured: CvExtractionPayload }> {
  const row = await prisma.cvExtraction.findFirst({
    where: { id: extractionId, storedCv: { userId, deletedAt: null } },
  });
  if (!row) throw new CvPipelineError('NOT_FOUND', 404);
  if (row.status !== CvExtractionStatus.READY) throw new CvPipelineError('EXTRACTION_NOT_READY', 409);

  const structured = parseStoredExtractionPayload(row.structuredData);
  if (!structured) throw new CvPipelineError('INVALID_PARSER_OUTPUT', 422);

  return {
    extraction: {
      id: row.id,
      storedCvId: row.storedCvId,
      parserVersion: row.parserVersion,
      extractedText: row.extractedText ?? '',
    },
    structured,
  };
}

/**
 * Soft-delete a stored CV and remove its binary, freeing a resource slot.
 *
 * The row, its extractions and every confirmed import candidate stay: those are
 * the provenance for canonical profile records the user still holds, and
 * deleting them would leave confirmed experience and qualifications with no
 * traceable source. Only the file itself goes.
 */
export async function deleteStoredCv(userId: string, storedCvId: string): Promise<void> {
  const storedCv = await loadOwnedStoredCv(userId, storedCvId);
  if (!storedCv.objectDeletedAt) await storage.delete(STORAGE_BUCKET, storedCv.storageKey);
  await prisma.storedCv.update({
    where: { id: storedCv.id },
    data: { status: StoredCvStatus.DELETED, objectDeletedAt: new Date(), deletedAt: new Date() },
  });
}

/**
 * Remove the binaries of stored CVs whose retention window has passed.
 *
 * Mirrors `sweepExpiredSources` for archived analysis uploads: the object goes,
 * the record stays and is marked EXPIRED so the UI can say "the original file is
 * no longer available" instead of pretending it is still downloadable. Confirmed
 * profile records and their excerpts are untouched.
 *
 * NOTE: like the existing analysis sweep, this runs inline (after an upload) and
 * there is no scheduled job. That remains outstanding work, not a claim.
 */
export async function sweepExpiredStoredCvs(userId?: string, limit = 50): Promise<number> {
  try {
    const expired = await prisma.storedCv.findMany({
      where: {
        ...(userId ? { userId } : {}),
        retentionEndsAt: { lt: new Date() },
        objectDeletedAt: null,
        deletedAt: null,
      },
      take: limit,
      select: { id: true, storageKey: true },
    });
    if (expired.length === 0) return 0;

    await Promise.all(expired.map((row) => storage.delete(STORAGE_BUCKET, row.storageKey)));
    await prisma.storedCv.updateMany({
      where: { id: { in: expired.map((row) => row.id) } },
      data: { status: StoredCvStatus.EXPIRED, objectDeletedAt: new Date() },
    });
    console.info(`[stored-cv] Swept ${expired.length} expired stored CV object(s).`);
    return expired.length;
  } catch (error) {
    console.warn('[stored-cv] Sweep failed:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/** A short-lived signed URL for the owner to download their own stored CV. */
export async function storedCvDownloadUrl(userId: string, storedCvId: string): Promise<string> {
  const storedCv = await loadOwnedStoredCv(userId, storedCvId);
  if (storedCv.objectDeletedAt) throw new CvPipelineError('SOURCE_UNAVAILABLE', 410);
  // Deliberately short: the object is private, and a link that outlives the
  // page it was rendered on is a link that can be forwarded.
  return storage.createSignedUrl(STORAGE_BUCKET, storedCv.storageKey, 300);
}
