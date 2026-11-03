// Real-PostgreSQL proof of preview and generation compare-and-set claims.
// Skipped unless DATABASE_URL names a local database; fixtures are isolated and
// removed by cascading user deletion.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/u.test(databaseUrl);
const { prisma } = isLocalDb
  ? await import('@/shared/lib/prisma')
  : { prisma: null as never };
const { claimThumbnailRetry } = await import('../preview-repository');
const { claimGeneration } = await import('@/shared/cv-generation/generation-lease');

describe.skipIf(!isLocalDb)('document preview leases — real Postgres concurrency', () => {
  const suffix = randomUUID();
  const userIds = [`preview_owner_a_${suffix}`, `preview_owner_b_${suffix}`];
  const generationIds = [`preview_generation_a_${suffix}`, `preview_generation_b_${suffix}`];
  const generatedCvIds = [`preview_cv_a_${suffix}`, `preview_cv_b_${suffix}`];
  const hash = 'a'.repeat(64);

  beforeAll(async () => {
    for (let index = 0; index < userIds.length; index += 1) {
      const userId = userIds[index];
      await prisma.user.create({
        data: { id: userId, name: 'Preview Test', email: `${userId}@example.test` },
      });
      await prisma.cvGeneration.create({
        data: {
          id: generationIds[index], userId, operationId: `operation_${suffix}_${index}`,
          sourceMode: 'CAREER_PROFILE', status: 'PLAN_APPROVED',
        },
      });
      await prisma.generatedCV.create({
        data: {
          id: generatedCvIds[index], userId, cvGenerationId: generationIds[index],
          template: 'architect', data: {}, fileKey: `users/${userId}/${generatedCvIds[index]}/CV.docx`,
        },
      });
      await prisma.generatedCvPreview.create({
        data: {
          generatedCvId: generatedCvIds[index], userId, documentHash: hash,
          rendererVersion: 'integration', status: 'FAILED',
          failureCode: 'THUMBNAIL_RENDER_FAILED', pageCount: 1,
          pdfKey: `users/${userId}/${generatedCvIds[index]}/previews/${hash}/document.pdf`,
          pdfSize: 100, attemptCount: 1,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('allows the same document hash for two owners without leaking either row', async () => {
    const rows = await prisma.generatedCvPreview.findMany({
      where: { documentHash: hash, userId: { in: userIds } },
      orderBy: { userId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.userId))).toEqual(new Set(userIds));
  });

  it('grants exactly one preview retry claim under concurrency', async () => {
    const now = new Date();
    const results = await Promise.all([
      claimThumbnailRetry({ userId: userIds[0], generatedCvId: generatedCvIds[0], documentHash: hash, now }),
      claimThumbnailRetry({ userId: userIds[0], generatedCvId: generatedCvIds[0], documentHash: hash, now }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['claimed', 'in_progress']);
  });

  it('grants exactly one fenced generation claim under concurrency', async () => {
    const now = new Date();
    const results = await Promise.all([
      claimGeneration({ userId: userIds[1], generationId: generationIds[1], now }),
      claimGeneration({ userId: userIds[1], generationId: generationIds[1], now }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(['claimed', 'in_progress']);
    const row = await prisma.cvGeneration.findUniqueOrThrow({ where: { id: generationIds[1] } });
    expect(row.generationAttemptCount).toBe(1);
    expect(row.generationLeaseToken).toBeTruthy();
  });
});
