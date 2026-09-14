// Real-PostgreSQL proof of the CV → stored document → extraction → import →
// confirmation pipeline.
//
// The unit suites prove the rules; only a real database proves that confirming a
// proposal writes the right canonical row, that the reusable-evidence allowance
// stops at exactly the right point WITHOUT taking the rest of the import down
// with it, and that the stored-CV limit is race-free. SKIPPED unless
// DATABASE_URL points at a local host, and it seeds and tears down its own user.
//
// Run it with the local database URL, e.g.
//   DATABASE_URL='postgresql://align:align@localhost:5433/align?schema=public' \
//     npx vitest run src/shared/services/cv-import/__tests__/import-pipeline.integration.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

const url = process.env.DATABASE_URL ?? '';
const isLocalDb = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);

const { prisma } = isLocalDb ? await import('@/shared/lib/prisma') : { prisma: null as never };
const { CvImportEntityType, CvImportReviewStatus, CvImportSessionStatus, CvExtractionStatus } =
  await import('@/generated/prisma/client');
const {
  openImportSession,
  applyCandidateDecisions,
  loadImportSession,
  addUserSuppliedIdentity,
  USER_SUPPLIED_EXCERPT,
} = await import('../session');
const { countStoredEvidence, countStoredSourceCvs, assertStoredSourceCvLimit, EntitlementRequiredError } =
  await import('@/shared/entitlements/server');
const { emptyExtractionPayload } = await import('../../cv-extraction/types');

/** Free launch allowances, from the one authoritative registry. */
const FREE_EVIDENCE_LIMIT = 25;
const FREE_STORED_CV_LIMIT = 3;

const provenance = { excerpt: 'Read from the CV', sourceLocation: { line: 3 } };

describe.skipIf(!isLocalDb)('CV import pipeline — real Postgres', () => {
  let userId: string;
  let profileId: string;
  let storedCvId: string;
  let extractionId: string;

  beforeAll(async () => {
    userId = `test_import_${randomUUID()}`;
    await prisma.user.create({
      data: { id: userId, name: 'Amara Okafor', email: `${userId}@example.test` },
    });
    const profile = await prisma.profile.create({
      data: { userId, label: 'Nursing', isDefault: true },
      select: { id: true },
    });
    profileId = profile.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // A clean profile and a fresh stored CV + extraction per test, so no test
    // depends on another's leftovers.
    await prisma.cvImportSession.deleteMany({ where: { userId } });
    await prisma.storedCv.deleteMany({ where: { userId } });
    // Identity is shared across tracks rather than owned by one, so it is cleared
    // separately — a leftover phone or LinkedIn URL would turn the next test's
    // addition into a conflict.
    await prisma.profileIdentity.deleteMany({ where: { userId } });
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        professionalSummary: null,
        experience: { deleteMany: {} },
        education: { deleteMany: {} },
        projects: { deleteMany: {} },
        skills: { deleteMany: {} },
        skillGroups: { deleteMany: {} },
        otherEvidence: { deleteMany: {} },
        languages: { deleteMany: {} },
      },
    });
  });

  /** Create a stored CV and a READY extraction carrying `structured`. */
  async function seedExtraction(structured: Record<string, unknown>): Promise<void> {
    const storedCv = await prisma.storedCv.create({
      data: {
        userId,
        storageProvider: 's3',
        storageKey: `users/${userId}/stored-cv/${randomUUID()}.pdf`,
        originalFilename: 'cv.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        checksum: randomUUID().replace(/-/g, ''),
        sourceFormat: 'pdf',
        status: 'READY',
      },
      select: { id: true },
    });
    storedCvId = storedCv.id;

    const extraction = await prisma.cvExtraction.create({
      data: {
        storedCvId,
        parserVersion: 'cv-extract@test',
        attempt: 1,
        sourceFormat: 'pdf',
        status: CvExtractionStatus.READY,
        extractedText: 'Staff Nurse at Salford Royal',
        structuredData: { ...emptyExtractionPayload(), ...structured },
      },
      select: { id: true },
    });
    extractionId = extraction.id;
  }

  const open = () =>
    openImportSession({ userId, storedCvId, extractionId, profileId, accountFullName: 'Amara Okafor' });

  const EXPERIENCE = {
    jobTitle: 'Staff Nurse',
    company: 'Salford Royal',
    startDate: '2017-09',
    endDate: '2021-02',
    current: false,
    achievements: ['Delivered ward care.'],
    ...provenance,
  };

  describe('sessions', () => {
    it('is idempotent: reopening resolves to the same session and candidate ids', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const first = await open();
      const second = await open();
      expect(second.id).toBe(first.id);
      expect(second.candidates.map((c) => c.id)).toEqual(first.candidates.map((c) => c.id));
    });

    it('does not regenerate candidates over decisions already made', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'reject' }],
      });

      const reopened = await open();
      expect(reopened.candidates).toHaveLength(1);
      expect(reopened.candidates[0].reviewStatus).toBe(CvImportReviewStatus.REJECTED);
    });

    it('stores immutable provenance on every candidate', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      const row = await prisma.cvImportCandidate.findUniqueOrThrow({
        where: { id: session.candidates[0].id },
      });
      expect(row.sourceExcerpt).toBe(provenance.excerpt);
      expect(row.extractionId).toBe(extractionId);
      expect(row.parserVersion).toBe('cv-extract@test');
    });
  });

  describe('confirmation writes canonical records', () => {
    it('creates an Experience row and links it back to the candidate', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'confirm' }],
      });

      expect(result.imported).toBe(1);
      const experience = await prisma.experience.findFirstOrThrow({ where: { profileId } });
      expect(experience).toMatchObject({
        jobTitle: 'Staff Nurse',
        company: 'Salford Royal',
        startDate: '2017-09',
        current: false,
      });

      const candidate = await prisma.cvImportCandidate.findUniqueOrThrow({
        where: { id: session.candidates[0].id },
      });
      expect(candidate.reviewStatus).toBe(CvImportReviewStatus.CONFIRMED);
      expect(candidate.createdEntityType).toBe('experience');
      expect(candidate.createdEntityId).toBe(experience.id);
      expect(candidate.confirmedByUserId).toBe(userId);
      expect(candidate.confirmedAt).toBeInstanceOf(Date);
    });

    it('creates nothing for a rejected candidate', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'reject' }],
      });
      expect(await prisma.experience.count({ where: { profileId } })).toBe(0);
    });

    it('is idempotent: confirming twice creates one row', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      const decisions = [{ candidateId: session.candidates[0].id, action: 'confirm' as const }];
      await applyCandidateDecisions({ userId, sessionId: session.id, decisions });
      const second = await applyCandidateDecisions({ userId, sessionId: session.id, decisions });

      expect(second.outcomes[0].outcome).toBe('already_imported');
      expect(await prisma.experience.count({ where: { profileId } })).toBe(1);
    });

    it('applies a user edit while keeping the original excerpt', async () => {
      await seedExtraction({ experience: [{ ...EXPERIENCE, company: undefined }] });
      const session = await open();
      expect(session.candidates[0].reviewStatus).toBe(CvImportReviewStatus.CONFLICT);

      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [
          {
            candidateId: session.candidates[0].id,
            action: 'confirm',
            edited: { ...EXPERIENCE, company: 'Manchester Royal Infirmary' },
          },
        ],
      });

      const experience = await prisma.experience.findFirstOrThrow({ where: { profileId } });
      expect(experience.company).toBe('Manchester Royal Infirmary');

      const candidate = await prisma.cvImportCandidate.findUniqueOrThrow({
        where: { id: session.candidates[0].id },
      });
      // The edit changed the payload; the record of what the DOCUMENT said did not.
      expect(candidate.sourceExcerpt).toBe(provenance.excerpt);
      expect(candidate.conflictCode).toBeNull();
    });

    it('refuses a confirmation that still lacks a required field', async () => {
      await seedExtraction({ experience: [{ ...EXPERIENCE, company: undefined }] });
      const session = await open();
      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'confirm' }],
      });
      expect(result.outcomes[0].outcome).toBe('unresolved_conflict');
      expect(await prisma.experience.count({ where: { profileId } })).toBe(0);
    });

    it('rejects a candidate belonging to another session', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: 'not-a-real-candidate', action: 'confirm' }],
      });
      expect(result.outcomes[0].outcome).toBe('invalid');
    });
  });

  describe('canonical records never consume the reusable-evidence allowance', () => {
    it('imports career history of every kind without moving the evidence count', async () => {
      await seedExtraction({
        experience: [EXPERIENCE],
        education: [
          {
            degree: 'BSc Adult Nursing',
            university: 'University of Salford',
            startDate: '2014',
            endDate: '2017',
            current: false,
            ...provenance,
          },
        ],
        projects: [{ name: 'Ward handover redesign', startDate: null, endDate: null, achievements: [], ...provenance }],
        skills: [
          { name: 'Venepuncture', ...provenance },
          { name: 'Cannulation', ...provenance },
        ],
        certifications: [{ officialName: 'ILS', issuingBody: 'Resus Council', issueDate: '2022', expiryDate: null, ...provenance }],
        training: [{ course: 'Safeguarding Level 3', provider: 'NHS', startDate: null, endDate: null, ...provenance }],
        licences: [{ officialName: 'Driving licence', issueDate: null, expiryDate: null, ...provenance }],
        professionalRegistrations: [
          { officialName: 'Registered Nurse', issuingBody: 'NMC', issueDate: null, expiryDate: null, ...provenance },
        ],
        languages: [{ language: 'Igbo', proficiency: 'Fluent', ...provenance }],
        volunteering: [
          { organisation: 'Age UK', role: 'Befriender', startDate: null, endDate: null, ...provenance },
        ],
      });

      const session = await open();
      const canonical = session.candidates.filter(
        (candidate) =>
          candidate.entityType !== CvImportEntityType.OTHER_EVIDENCE &&
          candidate.entityType !== CvImportEntityType.IDENTITY_UPDATE
      );

      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: canonical.map((candidate) => ({ candidateId: candidate.id, action: 'confirm' as const })),
      });

      expect(result.imported).toBe(canonical.length);
      expect(result.pendingCapacity).toBe(0);
      // The whole point: completing a profile is not a commercial allowance.
      expect(await countStoredEvidence(userId)).toBe(0);
    });

    it('maps an unambiguous language proficiency and leaves an ambiguous one unset', async () => {
      await seedExtraction({
        languages: [
          { language: 'Igbo', proficiency: 'Fluent', ...provenance },
          { language: 'French', proficiency: 'pretty good', ...provenance },
        ],
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: session.candidates
          .filter((c) => c.entityType === CvImportEntityType.LANGUAGE)
          .map((c) => ({ candidateId: c.id, action: 'confirm' as const })),
      });

      const igbo = await prisma.language.findFirstOrThrow({ where: { profileId, language: 'Igbo' } });
      expect(igbo.speaking).toBe('full_professional');

      const french = await prisma.language.findFirstOrThrow({ where: { profileId, language: 'French' } });
      // No level was invented; the wording is kept verbatim instead.
      expect(french.speaking).toBeNull();
      expect(french.professionalUseContext).toBe('pretty good');
    });
  });

  describe('reusable evidence allowance', () => {
    it('consumes one slot per confirmed item, and nothing for proposals', async () => {
      await seedExtraction({
        otherEvidence: [
          { title: 'Handover redesign', description: 'Cut handover time by 20%.', ...provenance },
          { title: 'Employee award', description: 'Employee of the year 2022.', ...provenance },
        ],
      });
      const session = await open();
      expect(await countStoredEvidence(userId)).toBe(0);

      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'confirm' }],
      });
      expect(await countStoredEvidence(userId)).toBe(1);

      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[1].id, action: 'reject' }],
      });
      // A rejection costs nothing.
      expect(await countStoredEvidence(userId)).toBe(1);
    });

    it('imports an award whose wording happens to name another record type', async () => {
      // Regression: the free-text authoring path warns a user who types their
      // job history into Other evidence, by looking for words like "project" in
      // the title. Import routes by entity type instead — this candidate came
      // from the achievements section precisely BECAUSE the parser's experience,
      // education and credential readers did not claim it — so re-guessing from
      // the wording rejected a real award for containing an ordinary word, and
      // took the whole confirmation batch down with it.
      await seedExtraction({
        otherEvidence: [
          {
            title: 'First Place – D.I.E Project Award',
            description: 'Won first place in the annual departmental competition.',
            ...provenance,
          },
        ],
      });
      const session = await open();
      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'confirm' }],
      });

      expect(result.imported).toBe(1);
      expect(result.failed).toBe(0);
      const row = await prisma.otherEvidence.findFirstOrThrow({ where: { profileId } });
      expect(row.title).toBe('First Place – D.I.E Project Award');
    });

    it('imports every canonical record even when the evidence allowance is full', async () => {
      // The exact scenario from the brief: canonical records must all land, and
      // the evidence proposals that do not fit must stay reviewable.
      for (let index = 0; index < FREE_EVIDENCE_LIMIT; index += 1) {
        await prisma.otherEvidence.create({
          data: { profileId, title: `Existing ${index}`, description: 'Already stored.' },
        });
      }

      await seedExtraction({
        experience: [EXPERIENCE],
        skills: [{ name: 'Venepuncture', ...provenance }, { name: 'Cannulation', ...provenance }],
        otherEvidence: [
          { title: 'Extra one', description: 'Would not fit.', ...provenance },
          { title: 'Extra two', description: 'Would not fit either.', ...provenance },
        ],
      });

      const session = await open();
      const decisions = session.candidates
        .filter((candidate) => candidate.entityType !== CvImportEntityType.IDENTITY_UPDATE)
        .map((candidate) => ({ candidateId: candidate.id, action: 'confirm' as const }));

      const result = await applyCandidateDecisions({ userId, sessionId: session.id, decisions });

      // Career history all landed.
      expect(await prisma.experience.count({ where: { profileId } })).toBe(1);
      expect(await prisma.skill.count({ where: { profileId } })).toBe(2);
      // Evidence beyond the allowance did not, and did not take anything with it.
      expect(result.pendingCapacity).toBe(2);
      expect(await countStoredEvidence(userId)).toBe(FREE_EVIDENCE_LIMIT);

      const blocked = result.outcomes.filter((outcome) => outcome.outcome === 'blocked_by_limit');
      expect(blocked).toHaveLength(2);
      expect(blocked[0].decision).toMatchObject({
        capability: 'profile_evidence_storage',
        reason: 'resource_limit_reached',
      });

      // Still reviewable, still importable later — never silently discarded.
      const reloaded = await loadImportSession(userId, session.id);
      const stillPending = reloaded.candidates.filter(
        (candidate) =>
          candidate.entityType === CvImportEntityType.OTHER_EVIDENCE &&
          candidate.reviewStatus === CvImportReviewStatus.PROPOSED
      );
      expect(stillPending).toHaveLength(2);
      expect(reloaded.status).toBe(CvImportSessionStatus.PARTIALLY_IMPORTED);
    });
  });

  describe('a single failing candidate', () => {
    it('is reported and left proposed, while the rest of the batch still lands', async () => {
      // The per-candidate transaction exists so one item cannot take the batch
      // with it. That has to hold for EVERY failure, not only the anticipated
      // ones: here the profile already holds this skill, so the unique index
      // refuses a second copy when the user confirms it anyway.
      await prisma.skill.create({
        data: { profileId, name: 'Wound care', normalizedName: 'wound care' },
      });
      await seedExtraction({
        experience: [EXPERIENCE],
        skills: [{ name: 'Wound care', ...provenance }],
      });

      const session = await open();
      const result = await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: session.candidates.map((candidate) => ({
          candidateId: candidate.id,
          action: 'confirm' as const,
        })),
      });

      expect(result.imported).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.outcomes.filter((outcome) => outcome.outcome === 'failed')).toHaveLength(1);
      // The experience still landed, and the skill is still there to review.
      expect(await prisma.experience.count({ where: { profileId } })).toBe(1);
      const reloaded = await loadImportSession(userId, session.id);
      const skill = reloaded.candidates.find(
        (candidate) => candidate.entityType === CvImportEntityType.SKILL
      );
      expect(skill?.reviewStatus).not.toBe(CvImportReviewStatus.CONFIRMED);
    });
  });

  describe('application-scoped evidence', () => {
    it('creates no application evidence or approvals during import', async () => {
      await seedExtraction({
        experience: [EXPERIENCE],
        otherEvidence: [{ title: 'Award', description: 'Employee of the year.', ...provenance }],
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: session.candidates
          .filter((c) => c.entityType !== CvImportEntityType.IDENTITY_UPDATE)
          .map((c) => ({ candidateId: c.id, action: 'confirm' as const })),
      });

      // CV import populates the Career Profile. An approval is a claim about a
      // specific vacancy and is never made on the user's behalf.
      expect(await prisma.applicationEvidenceContext.count({ where: { userId } })).toBe(0);
      expect(await prisma.profileEvidenceApproval.count({ where: { userId } })).toBe(0);
    });
  });

  describe('stored source CV limit', () => {
    beforeEach(async () => {
      await prisma.storedCv.deleteMany({ where: { userId } });
    });

    async function seedStoredCvs(count: number): Promise<void> {
      for (let index = 0; index < count; index += 1) {
        await prisma.storedCv.create({
          data: {
            userId,
            storageProvider: 's3',
            storageKey: `users/${userId}/stored-cv/${randomUUID()}.pdf`,
            originalFilename: `cv-${index}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            checksum: randomUUID().replace(/-/g, ''),
            sourceFormat: 'pdf',
            status: 'STORED',
          },
        });
      }
    }

    it('counts stored CVs and rejects the one past the allowance', async () => {
      await seedStoredCvs(FREE_STORED_CV_LIMIT - 1);
      await expect(
        prisma.$transaction(async (tx) => assertStoredSourceCvLimit(userId, tx))
      ).resolves.toBeUndefined();

      await seedStoredCvs(1);
      expect(await countStoredSourceCvs(userId)).toBe(FREE_STORED_CV_LIMIT);
      await expect(
        prisma.$transaction(async (tx) => assertStoredSourceCvLimit(userId, tx))
      ).rejects.toBeInstanceOf(EntitlementRequiredError);
    });

    it('lets only one of two concurrent uploads take the last slot', async () => {
      await seedStoredCvs(FREE_STORED_CV_LIMIT - 1);

      const attempt = async () =>
        prisma.$transaction(async (tx) => {
          await assertStoredSourceCvLimit(userId, tx);
          await tx.storedCv.create({
            data: {
              userId,
              storageProvider: 's3',
              storageKey: `users/${userId}/stored-cv/${randomUUID()}.pdf`,
              originalFilename: 'race.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1,
              checksum: randomUUID().replace(/-/g, ''),
              sourceFormat: 'pdf',
              status: 'STORED',
            },
          });
        });

      const results = await Promise.allSettled([attempt(), attempt()]);
      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      expect(await countStoredSourceCvs(userId)).toBe(FREE_STORED_CV_LIMIT);
    });

    it('frees a slot on soft delete while keeping the row for provenance', async () => {
      await seedStoredCvs(FREE_STORED_CV_LIMIT);
      const doomed = await prisma.storedCv.findFirstOrThrow({ where: { userId }, select: { id: true } });
      await prisma.storedCv.update({
        where: { id: doomed.id },
        data: { deletedAt: new Date(), objectDeletedAt: new Date(), status: 'DELETED' },
      });

      expect(await countStoredSourceCvs(userId)).toBe(FREE_STORED_CV_LIMIT - 1);
      // The row survives, so anything imported from it keeps its source.
      expect(await prisma.storedCv.count({ where: { userId } })).toBe(FREE_STORED_CV_LIMIT);
    });
  });

  describe('provenance survives the original file', () => {
    it('keeps confirmed records and their excerpts when the object expires', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: session.candidates[0].id, action: 'confirm' }],
      });

      // Retention expiry removes the BINARY, not the record of what it said.
      await prisma.storedCv.update({
        where: { id: storedCvId },
        data: { status: 'EXPIRED', objectDeletedAt: new Date() },
      });

      expect(await prisma.experience.count({ where: { profileId } })).toBe(1);
      const candidate = await prisma.cvImportCandidate.findUniqueOrThrow({
        where: { id: session.candidates[0].id },
      });
      expect(candidate.sourceExcerpt).toBe(provenance.excerpt);
      expect(candidate.createdEntityId).toBeTruthy();
    });
  });

  /**
   * Contact details, the professional summary and project links: the four things
   * a real import lost between the document and the database. Every assertion
   * here is on the ROW, because the defect was never in the parser alone — the
   * phone was read correctly and then written into the wrong column.
   */
  describe('identity, summary and project links reach the right columns', () => {
    const identityOf = (session: Awaited<ReturnType<typeof open>>, field: string) =>
      session.candidates.find(
        (candidate) =>
          candidate.entityType === CvImportEntityType.IDENTITY_UPDATE &&
          (candidate.structuredData as { field?: string }).field === field
      )!;

    it('writes a phone as a dial code and a national number, never as one string', async () => {
      await seedExtraction({
        identity: {
          phone: '+44 7737-853800',
          phoneDialCode: '+44',
          phoneNumber: '7737853800',
          phoneCountry: 'GB',
        },
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: identityOf(session, 'phone').id, action: 'confirm' }],
      });

      const identity = await prisma.profileIdentity.findUniqueOrThrow({ where: { userId } });
      expect(identity.phoneDialCode).toBe('+44');
      expect(identity.phoneNumber).toBe('7737853800');
      expect(identity.phoneCountry).toBe('GB');
      // The reported defect, asserted as an absence.
      expect(identity.phoneNumber).not.toContain('+');
    });

    it('writes LinkedIn, GitHub and website into their own columns', async () => {
      await seedExtraction({
        identity: {
          linkedin: 'https://linkedin.com/in/amara-okafor',
          github: 'https://github.com/amaraokafor',
          website: 'https://amaraokafor.dev',
        },
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: (['linkedin', 'github', 'website'] as const).map((field) => ({
          candidateId: identityOf(session, field).id,
          action: 'confirm' as const,
        })),
      });

      const identity = await prisma.profileIdentity.findUniqueOrThrow({ where: { userId } });
      expect(identity).toMatchObject({
        linkedin: 'https://linkedin.com/in/amara-okafor',
        github: 'https://github.com/amaraokafor',
        website: 'https://amaraokafor.dev',
      });
    });

    it('confirming one identity field leaves the others alone', async () => {
      await seedExtraction({
        identity: { linkedin: 'https://linkedin.com/in/amara-okafor', website: 'https://amaraokafor.dev' },
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [
          { candidateId: identityOf(session, 'linkedin').id, action: 'confirm' },
          { candidateId: identityOf(session, 'website').id, action: 'reject' },
        ],
      });

      const identity = await prisma.profileIdentity.findUniqueOrThrow({ where: { userId } });
      expect(identity.linkedin).toBe('https://linkedin.com/in/amara-okafor');
      expect(identity.website).toBeNull();
    });

    it('never overwrites the account email from a CV', async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await seedExtraction({ identity: { email: 'someone.else@example.com' } });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: identityOf(session, 'email').id, action: 'confirm' }],
      });

      const after = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(after.email).toBe(before.email);
      // It lands on the CONTACT address instead, which is what the field is for.
      const identity = await prisma.profileIdentity.findUniqueOrThrow({ where: { userId } });
      expect(identity.email).toBe('someone.else@example.com');
    });

    it('writes a confirmed professional summary onto the imported track', async () => {
      await seedExtraction({
        summary: 'Registered nurse with eight years of acute medical experience.',
        summarySource: { excerpt: 'Registered nurse with eight years…', sourceLocation: { line: 3 } },
      });
      const session = await open();
      const candidate = session.candidates.find(
        (entry) => entry.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE
      )!;
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: candidate.id, action: 'confirm' }],
      });

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
      expect(profile.professionalSummary).toBe(
        'Registered nurse with eight years of acute medical experience.'
      );
    });

    it('leaves an existing summary untouched until the conflict is decided', async () => {
      await prisma.profile.update({
        where: { id: profileId },
        data: { professionalSummary: 'My own wording.' },
      });
      await seedExtraction({
        summary: 'Registered nurse with eight years of acute medical experience.',
        summarySource: { excerpt: 'Registered nurse with eight years…', sourceLocation: { line: 3 } },
      });
      const session = await open();
      const candidate = session.candidates.find(
        (entry) => entry.entityType === CvImportEntityType.PROFILE_SUMMARY_UPDATE
      )!;
      expect(candidate.reviewStatus).toBe(CvImportReviewStatus.CONFLICT);
      expect(candidate.conflictCode).toBe('SUMMARY_ALREADY_SET');

      const profile = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
      expect(profile.professionalSummary).toBe('My own wording.');
      await prisma.profile.update({ where: { id: profileId }, data: { professionalSummary: null } });
    });

    it('creates a ProjectEntry with its repository and live URLs', async () => {
      await seedExtraction({
        projects: [
          {
            name: 'Kinetx',
            startDate: null,
            endDate: null,
            achievements: ['Deployed to Azure.'],
            repositoryUrl: 'https://github.com/amaraokafor/kinetx',
            liveUrl: 'https://kinetx.example.com',
            ...provenance,
          },
        ],
      });
      const session = await open();
      const candidate = session.candidates.find(
        (entry) => entry.entityType === CvImportEntityType.PROJECT
      )!;
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: candidate.id, action: 'confirm' }],
      });

      const projects = await prisma.projectEntry.findMany({ where: { profileId } });
      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'Kinetx',
        repositoryUrl: 'https://github.com/amaraokafor/kinetx',
        liveUrl: 'https://kinetx.example.com',
      });
      await prisma.projectEntry.deleteMany({ where: { profileId } });
    });

    it('links a project to its technologies, reusing skills the profile already has', async () => {
      const group = await prisma.skillGroup.create({
        data: { profileId, category: 'Technical', sortOrder: 0 },
        select: { id: true },
      });
      const existing = await prisma.skill.create({
        data: {
          profileId,
          skillGroupId: group.id,
          name: 'PostgreSQL',
          normalizedName: 'postgresql',
          sortOrder: 0,
        },
        select: { id: true },
      });

      await seedExtraction({
        projects: [
          {
            name: 'Kinetx',
            startDate: null,
            endDate: null,
            achievements: [],
            technologies: ['Node.js', 'PostgreSQL', 'postgresql'],
            ...provenance,
          },
        ],
      });
      const session = await open();
      const candidate = session.candidates.find(
        (entry) => entry.entityType === CvImportEntityType.PROJECT
      )!;
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: candidate.id, action: 'confirm' }],
      });

      const project = await prisma.projectEntry.findFirstOrThrow({
        where: { profileId },
        include: { projectSkills: { include: { skill: true } }, },
      });
      const linked = project.projectSkills.map((link) => link.skill.name).sort();
      expect(linked).toEqual(['Node.js', 'PostgreSQL']);
      // The profile's own PostgreSQL was reused, not duplicated beside itself,
      // and the same technology written twice is one claim.
      expect(project.projectSkills.map((link) => link.skillId)).toContain(existing.id);
      expect(await prisma.skill.count({ where: { profileId } })).toBe(2);
    });

    it('does not duplicate a project or its links when a confirmation is retried', async () => {
      await seedExtraction({
        projects: [
          {
            name: 'Kinetx',
            startDate: null,
            endDate: null,
            achievements: [],
            repositoryUrl: 'https://github.com/amaraokafor/kinetx',
            ...provenance,
          },
        ],
      });
      const session = await open();
      const candidate = session.candidates.find(
        (entry) => entry.entityType === CvImportEntityType.PROJECT
      )!;
      const decisions = [{ candidateId: candidate.id, action: 'confirm' as const }];
      await applyCandidateDecisions({ userId, sessionId: session.id, decisions });
      const second = await applyCandidateDecisions({ userId, sessionId: session.id, decisions });

      expect(second.outcomes[0].outcome).toBe('already_imported');
      const projects = await prisma.projectEntry.findMany({ where: { profileId } });
      expect(projects).toHaveLength(1);
      expect(projects[0].repositoryUrl).toBe('https://github.com/amaraokafor/kinetx');
      await prisma.projectEntry.deleteMany({ where: { profileId } });
    });

    it('changes nothing at all when identity proposals are rejected', async () => {
      await seedExtraction({
        identity: { linkedin: 'https://linkedin.com/in/amara-okafor', website: 'https://amaraokafor.dev' },
      });
      const session = await open();
      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: session.candidates
          .filter((entry) => entry.entityType === CvImportEntityType.IDENTITY_UPDATE)
          .map((entry) => ({ candidateId: entry.id, action: 'reject' as const })),
      });
      expect(await prisma.profileIdentity.count({ where: { userId } })).toBe(0);
    });

    it('lets a detail the CV did not carry be added and confirmed in the same review', async () => {
      await seedExtraction({ experience: [EXPERIENCE] });
      const session = await open();
      const withAdded = await addUserSuppliedIdentity({
        userId,
        sessionId: session.id,
        field: 'linkedin',
        value: 'linkedin.com/in/amara-okafor',
      });
      const added = identityOf(withAdded, 'linkedin');
      // Added as a PROPOSAL, stamped honestly as not having come from the CV.
      expect(added.reviewStatus).toBe(CvImportReviewStatus.EDITED);
      expect(added.sourceExcerpt).toBe(USER_SUPPLIED_EXCERPT);
      expect(await prisma.profileIdentity.count({ where: { userId } })).toBe(0);

      await applyCandidateDecisions({
        userId,
        sessionId: session.id,
        decisions: [{ candidateId: added.id, action: 'confirm' }],
      });
      const identity = await prisma.profileIdentity.findUniqueOrThrow({ where: { userId } });
      expect(identity.linkedin).toBe('https://linkedin.com/in/amara-okafor');
    });
  });
});
