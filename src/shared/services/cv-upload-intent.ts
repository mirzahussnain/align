import { randomUUID } from 'node:crypto';
import {
  CvUploadIntentStatus,
  StoredCvStatus,
  type Prisma,
} from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { getUserPlan, EntitlementRequiredError } from '@/shared/entitlements/server';
import { getPlanEntitlement, type CapabilityDecision } from '@/shared/entitlements/registry';
import { entitlementsFor, sourceExpiryFrom } from '@/shared/lib/entitlements';
import {
  CV_FORMAT_CANONICAL_MIME,
  MAX_CV_UPLOAD_BYTES,
  validateUploadBytes,
  type CvSourceFormat,
} from '@/shared/services/cv-extraction';
import { CvPipelineError } from '@/shared/services/cv-extraction/errors';
import {
  checksumOf,
  safeDisplayFilename,
  toStoredCvSummary,
  type UploadOutcome,
} from '@/shared/services/stored-cv';

const CAPABILITY = 'stored_source_cvs' as const;
const PENDING_TTL_MS = 5 * 60_000;
const VALIDATING_TTL_MS = 10 * 60_000;
const STORAGE_PROVIDER = 's3';
const LIVE_STATUSES = [CvUploadIntentStatus.PENDING, CvUploadIntentStatus.VALIDATING] as const;

function metadataFormat(filename: string, mimeType: string, sizeBytes: number): CvSourceFormat {
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) throw new CvPipelineError('FILE_EMPTY');
  if (sizeBytes > MAX_CV_UPLOAD_BYTES) throw new CvPipelineError('FILE_TOO_LARGE', 413);
  const lower = filename.toLowerCase();
  const format = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.docx') ? 'docx' : null;
  if (!format || CV_FORMAT_CANONICAL_MIME[format] !== mimeType) {
    throw new CvPipelineError('UNSUPPORTED_FORMAT');
  }
  return format;
}

async function lockStoredCvSlots(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    userId,
    CAPABILITY
  );
}

export async function countReservedStoredCvSlots(
  userId: string,
  client: Pick<Prisma.TransactionClient, 'cvUploadIntent'> = prisma,
  now = new Date()
) {
  return client.cvUploadIntent.count({
    where: {
      userId,
      status: { in: [...LIVE_STATUSES] },
      expiresAt: { gt: now },
    },
  });
}

function capacityDecision(plan: 'FREE' | 'PRO', limit: number, used: number): CapabilityDecision {
  const remaining = Math.max(0, limit - used);
  return {
    capability: CAPABILITY,
    plan,
    mode: 'resource_limit',
    allowed: remaining > 0,
    limit,
    used,
    remaining,
    reason: remaining > 0 ? 'allowed' : 'resource_limit_reached',
    ...(remaining === 0 && plan === 'FREE' ? { upgradeTarget: 'PRO' as const } : {}),
  };
}

export async function createCvUploadIntent(args: {
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const format = metadataFormat(args.filename, args.mimeType, args.sizeBytes);
  const objectKey = `users/${args.userId}/stored-cv/intents/${randomUUID()}.${format}`;
  const expiresAt = new Date(now.getTime() + PENDING_TTL_MS);

  const intent = await prisma.$transaction(async (tx) => {
    await lockStoredCvSlots(tx, args.userId);
    const plan = await getUserPlan(args.userId);
    const entitlement = getPlanEntitlement(plan, CAPABILITY);
    const [stored, reserved] = await Promise.all([
      tx.storedCv.count({ where: { userId: args.userId, deletedAt: null } }),
      countReservedStoredCvSlots(args.userId, tx, now),
    ]);
    if (entitlement.mode === 'resource_limit') {
      const decision = capacityDecision(plan, entitlement.limit, stored + reserved);
      if (!decision.allowed) throw new EntitlementRequiredError(decision);
    }
    return tx.cvUploadIntent.create({
      data: {
        userId: args.userId,
        objectKey,
        originalFilename: safeDisplayFilename(args.filename),
        expectedMimeType: CV_FORMAT_CANONICAL_MIME[format],
        expectedSizeBytes: args.sizeBytes,
        status: CvUploadIntentStatus.PENDING,
        expiresAt,
      },
    });
  });

  try {
    const uploadUrl = await storage.createUploadUrl({
      key: intent.objectKey,
      contentType: intent.expectedMimeType,
      contentLength: intent.expectedSizeBytes,
    });
    return { intentId: intent.id, uploadUrl, objectKey: intent.objectKey, expiresAt };
  } catch {
    await prisma.cvUploadIntent.updateMany({
      where: { id: intent.id, userId: args.userId, status: CvUploadIntentStatus.PENDING },
      data: { status: CvUploadIntentStatus.FAILED, failureCode: 'STORAGE_FAILED', expiresAt: now },
    });
    throw new CvPipelineError('STORAGE_FAILED', 502);
  }
}

async function claimIntent(userId: string, intentId: string, now: Date) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.cvUploadIntent.updateMany({
      where: { id: intentId, userId, status: CvUploadIntentStatus.PENDING, expiresAt: { gt: now } },
      data: {
        status: CvUploadIntentStatus.VALIDATING,
        expiresAt: new Date(now.getTime() + VALIDATING_TTL_MS),
      },
    });
    if (claimed.count === 1) {
      return tx.cvUploadIntent.findFirst({ where: { id: intentId, userId } });
    }
    const existing = await tx.cvUploadIntent.findFirst({ where: { id: intentId, userId } });
    if (!existing) throw new CvPipelineError('NOT_FOUND', 404);
    if (
      existing.status === CvUploadIntentStatus.EXPIRED ||
      (existing.status === CvUploadIntentStatus.PENDING && existing.expiresAt <= now)
    ) {
      throw new CvPipelineError('UPLOAD_INTENT_EXPIRED', 410);
    }
    throw new CvPipelineError('UPLOAD_ALREADY_FINALIZED', 409);
  });
}

async function failIntent(
  userId: string,
  intent: { id: string; objectKey: string },
  error: CvPipelineError,
  now: Date
): Promise<never> {
  await prisma.cvUploadIntent.updateMany({
    where: { id: intent.id, userId, status: CvUploadIntentStatus.VALIDATING },
    data: { status: CvUploadIntentStatus.FAILED, failureCode: error.code, expiresAt: now },
  });
  await storage.delete('uploads', intent.objectKey);
  throw error;
}

export async function finalizeCvUpload(args: {
  userId: string;
  intentId: string;
  now?: Date;
}): Promise<UploadOutcome> {
  const now = args.now ?? new Date();
  const intent = await claimIntent(args.userId, args.intentId, now);
  if (!intent) throw new CvPipelineError('NOT_FOUND', 404);

  let bytes: Buffer;
  try {
    const object = await storage.stat(intent.objectKey);
    if (object.sizeBytes !== intent.expectedSizeBytes) {
      return failIntent(args.userId, intent, new CvPipelineError('UPLOAD_SIZE_MISMATCH'), now);
    }
    if (object.contentType !== intent.expectedMimeType) {
      return failIntent(args.userId, intent, new CvPipelineError('UNSUPPORTED_FORMAT'), now);
    }
    bytes = await storage.download('uploads', intent.objectKey);
  } catch (error) {
    if (error instanceof CvPipelineError) throw error;
    return failIntent(args.userId, intent, new CvPipelineError('UPLOAD_INCOMPLETE', 409), now);
  }

  let validated;
  try {
    validated = validateUploadBytes(intent.originalFilename, bytes);
    if (validated.sizeBytes !== intent.expectedSizeBytes) {
      return failIntent(args.userId, intent, new CvPipelineError('UPLOAD_SIZE_MISMATCH'), now);
    }
  } catch (error) {
    return failIntent(
      args.userId,
      intent,
      error instanceof CvPipelineError ? error : new CvPipelineError('CORRUPT_DOCUMENT'),
      now
    );
  }

  const checksum = checksumOf(validated.bytes);
  let duplicateKey: string | null = null;
  const outcome = await prisma.$transaction(async (tx) => {
    await lockStoredCvSlots(tx, args.userId);
    const active = await tx.cvUploadIntent.findFirst({
      where: {
        id: intent.id,
        userId: args.userId,
        status: CvUploadIntentStatus.VALIDATING,
        expiresAt: { gt: now },
      },
    });
    if (!active) throw new CvPipelineError('UPLOAD_INTENT_EXPIRED', 410);

    const existing = await tx.storedCv.findUnique({
      where: { userId_checksum: { userId: args.userId, checksum } },
    });
    if (existing && !existing.deletedAt) {
      duplicateKey = intent.objectKey;
      await tx.cvUploadIntent.updateMany({
        where: { id: intent.id, userId: args.userId, status: CvUploadIntentStatus.VALIDATING },
        data: {
          status: CvUploadIntentStatus.COMPLETED,
          storedCvId: existing.id,
          completedAt: now,
          expiresAt: now,
        },
      });
      return { kind: 'duplicate' as const, storedCv: toStoredCvSummary(existing) };
    }

    const plan = await getUserPlan(args.userId);
    const id = randomUUID();
    const stored = await tx.storedCv.upsert({
      where: { userId_checksum: { userId: args.userId, checksum } },
      create: {
        id,
        userId: args.userId,
        storageProvider: STORAGE_PROVIDER,
        storageKey: intent.objectKey,
        originalFilename: intent.originalFilename,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        checksum,
        sourceFormat: validated.format,
        status: StoredCvStatus.STORED,
        retentionEndsAt: sourceExpiryFrom(entitlementsFor(plan)),
      },
      update: {
        storageKey: intent.objectKey,
        originalFilename: intent.originalFilename,
        mimeType: validated.mimeType,
        sizeBytes: validated.sizeBytes,
        sourceFormat: validated.format,
        status: StoredCvStatus.STORED,
        retentionEndsAt: sourceExpiryFrom(entitlementsFor(plan)),
        objectDeletedAt: null,
        deletedAt: null,
      },
    });
    await tx.cvUploadIntent.updateMany({
      where: { id: intent.id, userId: args.userId, status: CvUploadIntentStatus.VALIDATING },
      data: {
        status: CvUploadIntentStatus.COMPLETED,
        storedCvId: stored.id,
        completedAt: now,
        expiresAt: now,
      },
    });
    return { kind: 'created' as const, storedCv: toStoredCvSummary(stored) };
  });

  if (duplicateKey) await storage.delete('uploads', duplicateKey);
  return outcome;
}

export async function cleanupCvUploadIntents(now = new Date(), limit = 100) {
  const intents = await prisma.cvUploadIntent.findMany({
    where: {
      OR: [
        { status: { in: [...LIVE_STATUSES] }, expiresAt: { lte: now } },
        { status: CvUploadIntentStatus.FAILED },
      ],
    },
    orderBy: { expiresAt: 'asc' },
    take: limit,
  });
  for (const intent of intents) {
    await storage.delete('uploads', intent.objectKey);
    if (LIVE_STATUSES.includes(intent.status as (typeof LIVE_STATUSES)[number])) {
      await prisma.cvUploadIntent.updateMany({
        where: { id: intent.id, status: { in: [...LIVE_STATUSES] }, expiresAt: { lte: now } },
        data: { status: CvUploadIntentStatus.EXPIRED, failureCode: 'UPLOAD_INTENT_EXPIRED' },
      });
    }
  }
  return { processed: intents.length };
}
