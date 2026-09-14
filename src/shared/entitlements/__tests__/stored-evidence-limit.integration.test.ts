// Real-PostgreSQL proof that the reusable-evidence allowance counts reusable
// evidence and nothing else, and that its capacity check is race-free.
//
// The unit suite proves the counting definition against a mocked client, but only
// a real database can prove that (a) canonical Career Profile rows genuinely do
// not move the count, and (b) the advisory lock actually serialises two requests
// competing for the last slot. Like the reservation integration suite this is
// SKIPPED unless DATABASE_URL points at a local host, and it seeds and tears down
// its own throwaway user.
//
// Run it with the local database URL, e.g.
//   DATABASE_URL='postgresql://align:align@localhost:5433/align?schema=public' \
//     npx vitest run src/shared/entitlements/__tests__/stored-evidence-limit.integration.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { assertStoredEvidenceLimit, countStoredEvidence, checkCapability, EntitlementRequiredError } =
  await import('../server');

/** The Free reusable-evidence allowance, from the one authoritative registry. */
const FREE_LIMIT = 25;

describe.skipIf(!isLocalDb)('reusable stored-evidence limit — real Postgres', () => {
  let userId: string;
  let profileId: string;

  beforeAll(async () => {
    userId = `test_evi_${randomUUID()}`;
    await prisma.user.create({
      data: { id: userId, name: 'Stored Evidence Test', email: `${userId}@example.test` },
    });
    const profile = await prisma.profile.create({
      data: { userId, label: 'Test track', isDefault: true },
      select: { id: true },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.otherEvidence.deleteMany({ where: { profileId } });
  });

  /** Create `count` reusable evidence records directly. */
  async function seedEvidence(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await prisma.otherEvidence.create({
        data: { profileId, title: `Achievement ${i}`, description: `Cut handover time by ${i}%.` },
      });
    }
  }

  /** Create one row in every canonical Career Profile table. */
  async function seedCareerProfileRecords(rounds: number): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      await prisma.experience.create({ data: { profileId, jobTitle: `Role ${i}`, company: `Employer ${i}`, startDate: '2020-01' } });
      await prisma.projectEntry.create({ data: { profileId, name: `Project ${i}` } });
      await prisma.education.create({ data: { profileId, degree: `Degree ${i}`, university: `Institution ${i}` } });
      await prisma.skill.create({ data: { profileId, name: `Skill ${i}`, normalizedName: `skill ${i}` } });
      await prisma.certification.create({ data: { profileId, name: `Certification ${i}` } });
      await prisma.training.create({ data: { profileId, course: `Course ${i}` } });
      await prisma.licence.create({ data: { profileId, officialName: `Licence ${i}` } });
      await prisma.professionalRegistration.create({ data: { profileId, officialName: `Registration ${i}`, issuingBody: `Body ${i}` } });
      await prisma.language.create({ data: { profileId, language: `Language ${i}`, speaking: 'fluent' } });
      await prisma.volunteering.create({ data: { profileId, organisation: `Org ${i}`, role: `Volunteer ${i}`, skillsTools: [] } });
    }
  }

  it('does not count any canonical Career Profile record', async () => {
    // 40 rounds = 400 canonical rows, sixteen times the Free allowance.
    await seedCareerProfileRecords(40);
    try {
      expect(await countStoredEvidence(userId)).toBe(0);
      await expect(checkCapability(userId, 'profile_evidence_storage')).resolves.toMatchObject({
        allowed: true,
        used: 0,
        limit: FREE_LIMIT,
      });
    } finally {
      await prisma.profile.update({ where: { id: profileId }, data: {
        experience: { deleteMany: {} }, projects: { deleteMany: {} }, education: { deleteMany: {} },
        skills: { deleteMany: {} }, certifications: { deleteMany: {} }, trainings: { deleteMany: {} },
        licences: { deleteMany: {} }, professionalRegistrations: { deleteMany: {} },
        languages: { deleteMany: {} }, volunteering: { deleteMany: {} },
      } });
    }
  });

  it('counts reusable evidence records', async () => {
    await seedEvidence(12);
    expect(await countStoredEvidence(userId)).toBe(12);
    await expect(checkCapability(userId, 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: true,
      used: 12,
      remaining: FREE_LIMIT - 12,
    });
  });

  it('lets a Free user fill the allowance and rejects the next record', async () => {
    await seedEvidence(FREE_LIMIT - 1);
    await expect(
      prisma.$transaction(async (tx) => assertStoredEvidenceLimit(userId, tx))
    ).resolves.toBeUndefined();

    await seedEvidence(1); // now exactly at the limit
    await expect(
      prisma.$transaction(async (tx) => assertStoredEvidenceLimit(userId, tx))
    ).rejects.toBeInstanceOf(EntitlementRequiredError);
  });

  it('lets only one of two concurrent creations take the last slot', async () => {
    await seedEvidence(FREE_LIMIT - 1);

    const attempt = async () =>
      prisma.$transaction(async (tx) => {
        await assertStoredEvidenceLimit(userId, tx);
        await tx.otherEvidence.create({
          data: { profileId, title: `Race ${randomUUID()}`, description: 'Concurrent create.' },
        });
      });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual(['fulfilled', 'rejected']);
    const rejection = results.find((result) => result.status === 'rejected');
    expect((rejection as PromiseRejectedResult).reason).toBeInstanceOf(EntitlementRequiredError);
    // The limit held: never 26.
    expect(await countStoredEvidence(userId)).toBe(FREE_LIMIT);
  });

  it('frees a slot immediately when a record is deleted, and never blocks a delete', async () => {
    await seedEvidence(FREE_LIMIT);
    const doomed = await prisma.otherEvidence.findFirst({ where: { profileId }, select: { id: true } });
    await prisma.otherEvidence.delete({ where: { id: doomed!.id } });

    expect(await countStoredEvidence(userId)).toBe(FREE_LIMIT - 1);
    await expect(
      prisma.$transaction(async (tx) => assertStoredEvidenceLimit(userId, tx))
    ).resolves.toBeUndefined();
  });

  it('never blocks editing an existing record at (or above) the limit', async () => {
    await seedEvidence(FREE_LIMIT + 5); // as if seeded before a plan downgrade
    await expect(checkCapability(userId, 'profile_evidence_storage')).resolves.toMatchObject({
      allowed: false,
      used: FREE_LIMIT + 5,
      remaining: 0,
      reason: 'resource_limit_reached',
    });

    // Existing records survive the downgrade and stay editable — an update never
    // reaches the capacity check.
    const existing = await prisma.otherEvidence.findFirst({ where: { profileId }, select: { id: true } });
    const updated = await prisma.otherEvidence.update({
      where: { id: existing!.id },
      data: { description: 'Edited while over the limit.' },
      select: { description: true },
    });
    expect(updated.description).toBe('Edited while over the limit.');
    expect(await countStoredEvidence(userId)).toBe(FREE_LIMIT + 5);
  });

  it('does not count application-scoped evidence approvals', async () => {
    await seedEvidence(2);
    const cvRevision = await prisma.cvRevision.create({
      data: {
        userId,
        filename: 'evidence-test.pdf',
        mimeType: 'application/pdf',
        byteSize: 100,
        checksum: randomUUID(),
        extractedText: 'Evidence test CV text.',
        parserVersion: 'test',
      },
    });
    const jobRevision = await prisma.jobRevision.create({
      data: {
        userId,
        title: 'Evidence test role',
        company: 'Example employer',
        description: 'Evidence test vacancy description.',
        descriptionSource: 'USER_PASTED',
        descriptionHash: randomUUID(),
      },
    });
    const profileSnapshot = await prisma.careerProfileSnapshot.create({
      data: {
        userId,
        sourceProfileId: profileId,
        profileLabel: 'Test track',
        snapshotJson: {},
        schemaVersion: 1,
        contentHash: randomUUID(),
      },
    });
    const analysis = await prisma.jobMatch.create({
      data: {
        userId,
        cvRevisionId: cvRevision.id,
        jobRevisionId: jobRevision.id,
        profileSnapshotId: profileSnapshot.id,
        matchScore: 50,
        resultJson: {},
        algorithmVersion: 'test',
        promptVersion: 'test',
      },
      select: { id: true },
    });
    await prisma.applicationEvidenceContext.create({
      data: { userId, jobMatchId: analysis.id, profileId, requirementId: 'req-1', kind: 'OTHER', details: {}, approvedAt: new Date() },
    });
    await prisma.profileEvidenceApproval.create({
      data: { userId, jobMatchId: analysis.id, profileId, requirementId: 'req-2', evidenceType: 'other', evidenceId: 'x', snapshot: {} },
    });

    // Approvals are governed by the per-application limit, not this one — and
    // referencing one evidence record from several applications still counts once.
    expect(await countStoredEvidence(userId)).toBe(2);
    await prisma.jobMatch.delete({ where: { id: analysis.id } });
  });
});
