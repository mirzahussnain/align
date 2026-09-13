// Real MinIO + real PostgreSQL proof of the stored-CV pipeline.
//
// The unit suites prove validation and extraction against buffers; only real
// object storage proves that the object actually lands under a server-generated
// key, that it is private, that a signed link works, and that expiry removes the
// binary while the record survives. SKIPPED unless both DATABASE_URL and the
// S3 block point at a local host.
//
// Run it with the local environment, e.g.
//   DATABASE_URL='postgresql://align:align@localhost:5433/align?schema=public' \
//     npx vitest run src/shared/services/__tests__/stored-cv.integration.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL ?? '';
const endpoint = process.env.S3_ENDPOINT ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const isLocalStorage = /(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(endpoint);
const enabled = isLocalDb && isLocalStorage && Boolean(process.env.S3_BUCKET_UPLOADS);

const { prisma } = enabled ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { storage } = enabled ? await import('@/shared/lib/storage') : { storage: null as never };
const {
  storeUploadedCv,
  extractStoredCvRecord,
  loadOwnedExtraction,
  deleteStoredCv,
  listStoredCvs,
  storedCvDownloadUrl,
  sweepExpiredStoredCvs,
  checksumOf,
} = await import('../stored-cv');
const { CvPipelineError } = await import('../cv-extraction');
const { docxFromDocxLibrary, minimalPdf } = await import('../cv-extraction/__tests__/fixtures');

const PDF_CV = [
  'Amara Okafor',
  'Registered Nurse',
  'amara.okafor@example.com',
  'WORK EXPERIENCE',
  'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021',
  'Delivered care on a 28-bed respiratory ward.',
];

describe.skipIf(!enabled)('stored CV pipeline — real MinIO and Postgres', () => {
  let userId: string;

  beforeAll(async () => {
    userId = `test_storage_${randomUUID()}`;
    await prisma.user.create({
      data: { id: userId, name: 'Storage Test', email: `${userId}@example.test` },
    });
  });

  /** Remove every stored CV object and row for this user. */
  async function clearStoredCvs(): Promise<void> {
    const rows = await prisma.storedCv.findMany({ where: { userId }, select: { storageKey: true } });
    await Promise.all(rows.map((row) => storage.delete('uploads', row.storageKey)));
    await prisma.storedCv.deleteMany({ where: { userId } });
  }

  // Each test starts with an empty allowance. The Free stored-CV limit is real
  // and enforced by these very code paths, so without this the suite would be
  // testing the limit rather than what each case is actually about.
  beforeEach(clearStoredCvs);

  afterAll(async () => {
    await clearStoredCvs();
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('stores a PDF under a server-generated key and reads it back', async () => {
    const bytes = minimalPdf(PDF_CV);
    const outcome = await storeUploadedCv({ userId, plan: 'FREE', filename: 'my cv.pdf', bytes });

    expect(outcome.kind).toBe('created');
    expect(outcome.storedCv.checksum).toBe(checksumOf(bytes));
    expect(outcome.storedCv.sourceFormat).toBe('pdf');

    const row = await prisma.storedCv.findUniqueOrThrow({ where: { id: outcome.storedCv.id } });
    // The key is built from ids only — the user's filename never reaches it.
    expect(row.storageKey).toBe(`users/${userId}/stored-cv/${row.id}.pdf`);
    expect(row.storageKey).not.toContain('my cv');

    const downloaded = await storage.download('uploads', row.storageKey);
    expect(checksumOf(downloaded)).toBe(row.checksum);
  });

  it('extracts text and structure from the stored object', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'extract-me.pdf',
      bytes: minimalPdf(PDF_CV),
    });
    const extraction = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id });

    expect(extraction.status).toBe('READY');
    const loaded = await loadOwnedExtraction(userId, extraction.id);
    expect(loaded.extraction.extractedText).toContain('Staff Nurse');
    expect(loaded.structured.identity.fullName).toBe('Amara Okafor');
    expect(loaded.structured.experience[0]).toMatchObject({
      jobTitle: 'Staff Nurse',
      company: 'Salford Royal',
    });
  });

  it('reuses a READY extraction rather than re-reading the same bytes', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'reuse.pdf',
      bytes: minimalPdf(PDF_CV),
    });
    const first = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id });
    const second = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id });
    expect(second.id).toBe(first.id);
  });

  it('creates a NEW extraction attempt on a forced retry, never overwriting the first', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'retry.pdf',
      bytes: minimalPdf(PDF_CV),
    });
    const first = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id });
    const retried = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id, force: true });

    expect(retried.id).not.toBe(first.id);
    expect(retried.attempt).toBe(first.attempt + 1);
    // The earlier attempt is still there: confirmed candidates cite it.
    await expect(prisma.cvExtraction.findUnique({ where: { id: first.id } })).resolves.not.toBeNull();
  });

  it('stores a DOCX, proving the second format end to end', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'nurse.docx',
      bytes: await docxFromDocxLibrary(),
    });
    expect(outcome.storedCv.sourceFormat).toBe('docx');

    const extraction = await extractStoredCvRecord({ userId, storedCvId: outcome.storedCv.id });
    const loaded = await loadOwnedExtraction(userId, extraction.id);
    expect(loaded.structured.experience).toHaveLength(2);
  });

  it('detects the same file uploaded under a different name', async () => {
    const bytes = minimalPdf([...PDF_CV, 'Unique marker ' + randomUUID()]);
    const first = await storeUploadedCv({ userId, plan: 'FREE', filename: 'original.pdf', bytes });
    const second = await storeUploadedCv({ userId, plan: 'FREE', filename: 'renamed-copy.pdf', bytes });

    expect(second.kind).toBe('duplicate');
    expect(second.storedCv.id).toBe(first.storedCv.id);
    // One row, one object — a rename never produces a second copy.
    expect(await prisma.storedCv.count({ where: { userId, checksum: first.storedCv.checksum } })).toBe(1);
  });

  it('rejects a file whose signature contradicts its name before storing anything', async () => {
    const before = await prisma.storedCv.count({ where: { userId } });
    await expect(
      storeUploadedCv({ userId, plan: 'FREE', filename: 'cv.docx', bytes: minimalPdf(PDF_CV) })
    ).rejects.toBeInstanceOf(CvPipelineError);
    expect(await prisma.storedCv.count({ where: { userId } })).toBe(before);
  });

  it('issues a short-lived signed link and keeps the object private', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'signed.pdf',
      bytes: minimalPdf([...PDF_CV, randomUUID()]),
    });
    const url = await storedCvDownloadUrl(userId, outcome.storedCv.id);
    expect(url).toContain('X-Amz-Signature');
    expect(url).toContain('X-Amz-Expires');

    const row = await prisma.storedCv.findUniqueOrThrow({ where: { id: outcome.storedCv.id } });
    // Unsigned access to a private object must not work.
    const unsigned = await fetch(`${endpoint.replace(/\/$/, '')}/${process.env.S3_BUCKET_UPLOADS}/${row.storageKey}`);
    expect(unsigned.ok).toBe(false);
  });

  it('refuses to serve another user’s stored CV', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'private.pdf',
      bytes: minimalPdf([...PDF_CV, randomUUID()]),
    });
    await expect(storedCvDownloadUrl('someone-else', outcome.storedCv.id)).rejects.toBeInstanceOf(
      CvPipelineError
    );
  });

  it('removes the binary on delete while keeping the record', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'deleteme.pdf',
      bytes: minimalPdf([...PDF_CV, randomUUID()]),
    });
    const row = await prisma.storedCv.findUniqueOrThrow({ where: { id: outcome.storedCv.id } });

    await deleteStoredCv(userId, outcome.storedCv.id);

    await expect(storage.download('uploads', row.storageKey)).rejects.toBeTruthy();
    const after = await prisma.storedCv.findUniqueOrThrow({ where: { id: outcome.storedCv.id } });
    expect(after.deletedAt).toBeInstanceOf(Date);
    expect(after.objectDeletedAt).toBeInstanceOf(Date);
    // Gone from the user's list, and no longer using a slot.
    expect((await listStoredCvs(userId)).some((item) => item.id === after.id)).toBe(false);
  });

  it('sweeps an expired object and marks the record unavailable', async () => {
    const outcome = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'expiring.pdf',
      bytes: minimalPdf([...PDF_CV, randomUUID()]),
    });
    await prisma.storedCv.update({
      where: { id: outcome.storedCv.id },
      data: { retentionEndsAt: new Date(Date.now() - 1000) },
    });

    const swept = await sweepExpiredStoredCvs(userId);
    expect(swept).toBeGreaterThanOrEqual(1);

    const after = await prisma.storedCv.findUniqueOrThrow({ where: { id: outcome.storedCv.id } });
    expect(after.status).toBe('EXPIRED');
    expect(after.objectDeletedAt).toBeInstanceOf(Date);
    // The record survives; only the file is gone.
    await expect(storedCvDownloadUrl(userId, outcome.storedCv.id)).rejects.toBeInstanceOf(CvPipelineError);
  });

  it('stamps a retention window from the plan', async () => {
    const free = await storeUploadedCv({
      userId,
      plan: 'FREE',
      filename: 'retention-free.pdf',
      bytes: minimalPdf([...PDF_CV, randomUUID()]),
    });
    expect(free.storedCv.retentionEndsAt).toBeInstanceOf(Date);
    const days = Math.round(
      (free.storedCv.retentionEndsAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    // Free's configured source-file retention window.
    expect(days).toBe(180);
  });
});
