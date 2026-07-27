// Keeps a user's stored artefacts inside their tier's caps.
//
// Two independent mechanisms, matching the two limits in entitlements.ts:
//
//   1. COUNT — after a new analysis or generated CV is saved, anything beyond
//      the tier's cap is pruned oldest-first. The user always keeps their most
//      recent N; they never hit a wall mid-flow being told to delete something.
//
//   2. RETENTION — archived source uploads carry a `sourceExpiresAt` stamped
//      from the tier's window. Expired stored objects are swept away while the
//      Analysis row, its scores and its history entry are kept forever. Users
//      lose the ability to re-download the original PDF, never their results.
//
// Everything here is best-effort: pruning failures are logged, never thrown,
// because they must not break the request the user is waiting on.

import { prisma } from '@/shared/lib/prisma';
import { storage } from '@/shared/lib/storage';
import { entitlementsFor, type Entitlements } from '@/shared/lib/entitlements';

export interface StorageUsage {
  storedCvs: number;
  maxStoredCvs: number;
  storedAnalyses: number;
  /** `null` when the tier is unlimited, so the UI can show "Unlimited". */
  maxStoredAnalyses: number | null;
  /** Total archived bytes across uploads and generated CVs. */
  bytesUsed: number;
  sourceRetentionDays: number | null;
}

/** Current usage against the caps, for the billing screen's meters. */
export async function getStorageUsage(
  userId: string,
  effectivePlan: string | null | undefined
): Promise<StorageUsage> {
  const entitlements = entitlementsFor(effectivePlan);

  const [cvCount, analysisCount, cvBytes, uploadBytes] = await Promise.all([
    prisma.generatedCV.count({ where: { userId } }),
    prisma.analysis.count({ where: { userId } }),
    prisma.generatedCV.aggregate({ where: { userId }, _sum: { fileSize: true } }),
    prisma.analysis.aggregate({ where: { userId }, _sum: { sourceFileSize: true } }),
  ]);

  return {
    storedCvs: cvCount,
    maxStoredCvs: entitlements.maxStoredCvs,
    storedAnalyses: analysisCount,
    maxStoredAnalyses: Number.isFinite(entitlements.maxStoredAnalyses)
      ? entitlements.maxStoredAnalyses
      : null,
    // Rows archived before size tracking existed report null; treat as 0 rather
    // than guessing, so the meter under-reports instead of inventing usage.
    bytesUsed: (cvBytes._sum.fileSize ?? 0) + (uploadBytes._sum.sourceFileSize ?? 0),
    sourceRetentionDays: entitlements.sourceRetentionDays,
  };
}

/**
 * Drop generated CVs beyond the tier's cap, oldest first, deleting their stored
 * objects as it goes. Call after persisting a new CV.
 */
export async function pruneGeneratedCvs(
  userId: string,
  entitlements: Entitlements
): Promise<number> {
  const { maxStoredCvs } = entitlements;
  if (!Number.isFinite(maxStoredCvs)) return 0;

  try {
    const excess = await prisma.generatedCV.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: maxStoredCvs,
      select: { id: true, fileKey: true },
    });
    if (excess.length === 0) return 0;

    await Promise.all(
      excess.filter((c) => c.fileKey).map((c) => storage.delete('rewrites', c.fileKey as string))
    );
    await prisma.generatedCV.deleteMany({ where: { id: { in: excess.map((c) => c.id) } } });

    console.info(`[storage-quota] Pruned ${excess.length} generated CV(s) for user ${userId}.`);
    return excess.length;
  } catch (error) {
    console.warn(
      '[storage-quota] Failed to prune generated CVs:',
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}

/**
 * Drop analyses beyond the tier's cap, oldest first. Unlike CV pruning this
 * removes the analysis record itself, so it only ever runs on tiers with a
 * finite cap (free) — paid tiers keep their full history.
 */
export async function pruneAnalyses(userId: string, entitlements: Entitlements): Promise<number> {
  const { maxStoredAnalyses } = entitlements;
  if (!Number.isFinite(maxStoredAnalyses)) return 0;

  try {
    const excess = await prisma.analysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: maxStoredAnalyses,
      select: { id: true, sourceFileKey: true },
    });
    if (excess.length === 0) return 0;

    await Promise.all(
      excess.filter((a) => a.sourceFileKey).map((a) => storage.delete('uploads', a.sourceFileKey as string))
    );
    await prisma.analysis.deleteMany({ where: { id: { in: excess.map((a) => a.id) } } });

    console.info(`[storage-quota] Pruned ${excess.length} analysis record(s) for user ${userId}.`);
    return excess.length;
  } catch (error) {
    console.warn(
      '[storage-quota] Failed to prune analyses:',
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}

/**
 * Delete archived source uploads whose retention window has passed, clearing
 * the key so the UI stops offering a download. The Analysis row and every score
 * on it survive — only the original file goes.
 *
 * Scoped to one user when `userId` is given (cheap to run inline after an
 * upload); omit it to sweep every user from a scheduled job.
 */
export async function sweepExpiredSources(userId?: string, limit = 100): Promise<number> {
  try {
    const expired = await prisma.analysis.findMany({
      where: {
        ...(userId ? { userId } : {}),
        sourceExpiresAt: { lt: new Date() },
        sourceFileKey: { not: null },
      },
      take: limit,
      select: { id: true, sourceFileKey: true },
    });
    if (expired.length === 0) return 0;

    await Promise.all(
      expired.map((a) => storage.delete('uploads', a.sourceFileKey as string))
    );
    await prisma.analysis.updateMany({
      where: { id: { in: expired.map((a) => a.id) } },
      data: { sourceFileKey: null, sourceFileSize: null, sourceExpiresAt: null },
    });

    console.info(`[storage-quota] Swept ${expired.length} expired source file(s).`);
    return expired.length;
  } catch (error) {
    console.warn(
      '[storage-quota] Failed to sweep expired sources:',
      error instanceof Error ? error.message : error
    );
    return 0;
  }
}
