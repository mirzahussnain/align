import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL ?? '';
const endpoint = process.env.S3_ENDPOINT ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(databaseUrl);
const isLocalStorage = /(localhost|127\.0\.0\.1|host\.docker\.internal)/.test(endpoint);
const enabled = isLocalDb && isLocalStorage && Boolean(process.env.S3_BUCKET_UPLOADS);
const { prisma } = enabled ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { storage } = enabled ? await import('@/shared/lib/storage') : { storage: null as never };
const { createCvUploadIntent, finalizeCvUpload, cleanupCvUploadIntents } = await import('../cv-upload-intent');
const { storeUploadedCv, checksumOf } = await import('../stored-cv');
const { minimalPdf, docxFromDocxLibrary } = await import('../cv-extraction/__tests__/fixtures');

describe.skipIf(!enabled)('direct CV upload intents with PostgreSQL and MinIO', () => {
  const userId = `test_intent_${randomUUID()}`;
  const otherUserId = `test_intent_other_${randomUUID()}`;

  async function clear() {
    const intents = await prisma.cvUploadIntent.findMany({ where: { userId }, select: { objectKey: true } });
    const cvs = await prisma.storedCv.findMany({ where: { userId }, select: { storageKey: true } });
    await Promise.all([...intents.map((row) => row.objectKey), ...cvs.map((row) => row.storageKey)]
      .map((key) => storage.delete('uploads', key)));
    await prisma.cvUploadIntent.deleteMany({ where: { userId } });
    await prisma.storedCv.deleteMany({ where: { userId } });
  }

  async function upload(filename: string, mimeType: string, bytes: Buffer) {
    const intent = await createCvUploadIntent({ userId, filename, mimeType, sizeBytes: bytes.length });
    const response = await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Uint8Array(bytes) });
    expect(response.ok).toBe(true);
    return intent;
  }

  beforeAll(async () => {
    await prisma.user.createMany({ data: [
      { id: userId, name: 'Intent Test', email: `${userId}@example.test` },
      { id: otherUserId, name: 'Other Intent Test', email: `${otherUserId}@example.test` },
    ] });
  });
  beforeEach(clear);
  afterAll(async () => {
    await clear();
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('PUTs and finalizes valid PDF and DOCX files without proxying bytes through Next.js', async () => {
    const pdf = minimalPdf(['Candidate', 'Experience']);
    const pdfIntent = await upload('resume.pdf', 'application/pdf', pdf);
    const pdfResult = await finalizeCvUpload({ userId, intentId: pdfIntent.intentId });
    expect(pdfResult.storedCv.checksum).toBe(checksumOf(pdf));

    const docx = await docxFromDocxLibrary();
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const docxIntent = await upload('resume.docx', docxMime, docx);
    const docxResult = await finalizeCvUpload({ userId, intentId: docxIntent.intentId });
    expect(docxResult.storedCv.sourceFormat).toBe('docx');
  });

  it('rejects foreign ownership, reuse, expiry, and malformed bytes', async () => {
    const bytes = minimalPdf(['Private CV']);
    const owned = await upload('private.pdf', 'application/pdf', bytes);
    await expect(finalizeCvUpload({ userId: otherUserId, intentId: owned.intentId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(finalizeCvUpload({ userId, intentId: owned.intentId })).resolves.toMatchObject({ kind: 'created' });
    await expect(finalizeCvUpload({ userId, intentId: owned.intentId })).rejects.toMatchObject({ code: 'UPLOAD_ALREADY_FINALIZED' });

    const expired = await createCvUploadIntent({
      userId, filename: 'expired.pdf', mimeType: 'application/pdf', sizeBytes: 8,
      now: new Date(Date.now() - 10 * 60_000),
    });
    await expect(finalizeCvUpload({ userId, intentId: expired.intentId })).rejects.toMatchObject({ code: 'UPLOAD_INTENT_EXPIRED' });

    const malformedBytes = Buffer.from('not-pdf');
    const malformed = await upload('malformed.pdf', 'application/pdf', malformedBytes);
    await expect(finalizeCvUpload({ userId, intentId: malformed.intentId })).rejects.toMatchObject({ code: 'SIGNATURE_MISMATCH' });
    expect((await prisma.cvUploadIntent.findUniqueOrThrow({ where: { id: malformed.intentId } })).status).toBe('FAILED');
  });

  it('allows only one intent to reserve the final Free slot and releases terminal intents', async () => {
    await Promise.all([0, 1].map((index) => storeUploadedCv({
      userId, plan: 'FREE', filename: `${index}.pdf`, bytes: minimalPdf([`CV ${index}`, randomUUID()]),
    })));

    const outcomes = await Promise.allSettled([0, 1].map((index) => createCvUploadIntent({
      userId, filename: `next-${index}.pdf`, mimeType: 'application/pdf', sizeBytes: 100,
    })));
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    const live = await prisma.cvUploadIntent.findFirstOrThrow({ where: { userId, status: 'PENDING' } });
    await prisma.cvUploadIntent.update({ where: { id: live.id }, data: { status: 'FAILED' } });
    await expect(createCvUploadIntent({
      userId, filename: 'replacement.pdf', mimeType: 'application/pdf', sizeBytes: 100,
    })).resolves.toMatchObject({ intentId: expect.any(String) });
  });

  it('rejects size mismatches and malformed DOCX without creating Stored CVs', async () => {
    const pdf = minimalPdf(['Size mismatch']);
    const mismatched = await createCvUploadIntent({
      userId, filename: 'wrong-size.pdf', mimeType: 'application/pdf', sizeBytes: pdf.length + 1,
    });
    await storage.upload({ bucket: 'uploads', key: mismatched.objectKey, body: pdf, contentType: 'application/pdf' });
    await expect(finalizeCvUpload({ userId, intentId: mismatched.intentId })).rejects.toMatchObject({ code: 'UPLOAD_SIZE_MISMATCH' });

    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const malformedBytes = Buffer.from('PK malformed Word archive');
    const malformed = await createCvUploadIntent({
      userId, filename: 'malformed.docx', mimeType: docxMime, sizeBytes: malformedBytes.length,
    });
    await storage.upload({ bucket: 'uploads', key: malformed.objectKey, body: malformedBytes, contentType: docxMime });
    await expect(finalizeCvUpload({ userId, intentId: malformed.intentId })).rejects.toMatchObject({ code: 'SIGNATURE_MISMATCH' });

    expect(await prisma.storedCv.count({ where: { userId } })).toBe(0);
  });

  it('deduplicates finalized bytes and deletes the redundant intent object', async () => {
    const bytes = minimalPdf(['Same candidate', randomUUID()]);
    const first = await upload('first.pdf', 'application/pdf', bytes);
    await finalizeCvUpload({ userId, intentId: first.intentId });

    const second = await upload('renamed.pdf', 'application/pdf', bytes);
    await expect(finalizeCvUpload({ userId, intentId: second.intentId })).resolves.toMatchObject({ kind: 'duplicate' });
    expect(await prisma.storedCv.count({ where: { userId } })).toBe(1);
    await expect(storage.stat(second.objectKey)).rejects.toBeTruthy();
  });
  it('cleans abandoned objects idempotently and marks live states expired', async () => {
    const intent = await createCvUploadIntent({
      userId, filename: 'abandoned.pdf', mimeType: 'application/pdf', sizeBytes: 8,
      now: new Date(Date.now() - 10 * 60_000),
    });
    await storage.upload({ bucket: 'uploads', key: intent.objectKey, body: Buffer.from('orphaned'), contentType: 'application/pdf' });

    const missing = await createCvUploadIntent({
      userId, filename: 'missing.pdf', mimeType: 'application/pdf', sizeBytes: 8,
      now: new Date(Date.now() - 10 * 60_000),
    });

    await expect(cleanupCvUploadIntents()).resolves.toMatchObject({ processed: 2 });
    await expect(cleanupCvUploadIntents()).resolves.toMatchObject({ processed: 0 });
    expect((await prisma.cvUploadIntent.findUniqueOrThrow({ where: { id: intent.intentId } })).status).toBe('EXPIRED');
    expect((await prisma.cvUploadIntent.findUniqueOrThrow({ where: { id: missing.intentId } })).status).toBe('EXPIRED');
    await expect(storage.stat(intent.objectKey)).rejects.toBeTruthy();
  });
});
