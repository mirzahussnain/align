/**
 * The Job Details contract, specifically the four things that must stay apart:
 * employer register evidence, vacancy sponsorship wording, candidate practical
 * compatibility, and formal CV match.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    jobSnapshot: { findUnique: vi.fn() },
    companyRecord: { findUnique: vi.fn() },
  },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

const ensureCompanySponsorEvidence = vi.fn(async () => ({ outcome: 'ALREADY_CURRENT', status: 'MATCHED' }));
vi.mock('@/shared/services/company-sponsor-evidence', async () => {
  const actual = await vi.importActual<typeof import('@/shared/services/company-sponsor-evidence')>(
    '@/shared/services/company-sponsor-evidence',
  );
  return { ...actual, ensureCompanySponsorEvidence: (...args: unknown[]) => ensureCompanySponsorEvidence(...(args as [])) };
});

const getSponsorRegisterVersion = vi.fn(async () => 'register-v1');
vi.mock('@/shared/services/sponsor-registry', () => ({
  getSponsorRegisterVersion: () => getSponsorRegisterVersion(),
}));

const buildConfirmedCandidateFacts = vi.fn(async () => null as unknown);
vi.mock('@/shared/services/practical-compatibility-store', () => ({
  buildConfirmedCandidateFacts: (...args: unknown[]) => buildConfirmedCandidateFacts(...(args as [])),
}));

const { getJobDetailsView } = await import('@/shared/services/job-board-api');

const description =
  'About the role. Responsibilities include running the ward. Requirements include an Enhanced DBS check and a full UK driving licence. Benefits include a pension. We cannot offer sponsorship for this position.';

const snapshotRow = (over: Record<string, unknown> = {}) => ({
  id: 'job-1',
  title: 'Ward Administrator',
  employerName: 'Fixture Care Ltd',
  companyRecordId: 'company-1',
  locationText: 'Birmingham',
  city: 'Birmingham',
  region: 'West Midlands',
  country: 'GB',
  workStyle: 'ONSITE',
  status: 'ACTIVE',
  lastSeenAt: new Date(),
  firstSeenAt: new Date(),
  providerDescription: description,
  userSuppliedDescription: null,
  descriptionAvailability: 'FULL',
  selectedDescriptionHash: null,
  descriptionAssessment: null,
  requirementEvidence: null,
  vacancySponsorshipSignal: null,
  intelligenceAssessedAt: null,
  employerSponsorEvidence: null,
  employerSource: { provider: 'GREENHOUSE', enabled: true, verificationStatus: 'VERIFIED' },
  companyRecord: {
    displayName: 'Fixture Care Ltd',
    sponsorMatchStatus: 'EXACT',
    sponsorOrganisationName: 'FIXTURE CARE LIMITED',
    sponsorRegisterVersion: 'register-v1',
    sponsorCheckedAt: new Date('2026-07-20T00:00:00.000Z'),
    sponsorEvidence: { reasons: ['Unique exact normalised organisation-name match.'] },
  },
  providerReferences: [{ provider: 'GREENHOUSE', providerJobId: 'g-1', providerUrl: 'https://jobs.test/1', applicationUrl: null }],
  savedJobs: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getSponsorRegisterVersion.mockResolvedValue('register-v1');
  buildConfirmedCandidateFacts.mockResolvedValue(null);
});

describe('employer sponsor-register evidence', () => {
  it('exposes status, matched organisation, register version and checked timestamp', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());

    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.sponsorEvidence).toMatchObject({
      status: 'MATCHED',
      matchedOrganisationName: 'FIXTURE CARE LIMITED',
      registerVersion: 'register-v1',
      checkedAt: '2026-07-20T00:00:00.000Z',
    });
  });

  it('always carries the disclaimer', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.sponsorEvidence.disclaimer).toMatch(
      /does not confirm sponsorship for a particular vacancy or candidate/,
    );
  });

  it('does not let an un-enriched company mask the snapshot’s own recorded evidence', async () => {
    // THE ORIGINAL DEFECT. `sponsorMatchStatus` is a non-null column defaulting
    // to NOT_CHECKED, so `company ?? blob` never fell through and every linked
    // vacancy reported "not checked" regardless of what had already been found.
    prisma.jobSnapshot.findUnique.mockResolvedValue(
      snapshotRow({
        companyRecord: { displayName: 'Fixture Care Ltd', sponsorMatchStatus: 'NOT_CHECKED', sponsorOrganisationName: null, sponsorRegisterVersion: null, sponsorCheckedAt: null, sponsorEvidence: null },
        employerSponsorEvidence: {
          status: 'EXACT',
          matchedOrganisationName: 'FIXTURE CARE LIMITED',
          registerVersion: 'register-v1',
          checkedAt: '2026-07-19T00:00:00.000Z',
        },
      }),
    );

    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.sponsorEvidence.status).toBe('MATCHED');
    expect(view?.sponsorEvidence.checkedAt).toBe('2026-07-19T00:00:00.000Z');
  });

  it('says the employer is not yet identified when no company is linked', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(
      snapshotRow({ companyRecordId: null, companyRecord: null, employerSource: null }),
    );
    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.sponsorEvidence).toMatchObject({ status: 'NOT_CHECKED', checkState: 'COMPANY_UNRESOLVED' });
  });

  it('completes a bounded check when the linked company has none, and re-reads it', async () => {
    prisma.jobSnapshot.findUnique
      .mockResolvedValueOnce(
        snapshotRow({ companyRecord: { displayName: 'Fixture Care Ltd', sponsorMatchStatus: 'NOT_CHECKED', sponsorOrganisationName: null, sponsorRegisterVersion: null, sponsorCheckedAt: null, sponsorEvidence: null } }),
      )
      .mockResolvedValueOnce(snapshotRow());

    const view = await getJobDetailsView('job-1', 'user-1');
    expect(ensureCompanySponsorEvidence).toHaveBeenCalledWith('company-1');
    expect(view?.sponsorEvidence.status).toBe('MATCHED');
  });

  it('does not re-check evidence that already belongs to the current register', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    await getJobDetailsView('job-1', 'user-1');
    expect(ensureCompanySponsorEvidence).not.toHaveBeenCalled();
    expect(prisma.jobSnapshot.findUnique).toHaveBeenCalledTimes(1);
  });

  it('shows stored evidence unchanged when the register itself is unavailable', async () => {
    getSponsorRegisterVersion.mockRejectedValue(new Error('offline'));
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());

    const view = await getJobDetailsView('job-1', 'user-1');
    expect(ensureCompanySponsorEvidence).not.toHaveBeenCalled();
    expect(view?.sponsorEvidence.status).toBe('MATCHED');
  });
});

describe('the four concepts stay separate', () => {
  it('does not treat employer-direct ATS identity as sponsor-register evidence', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(
      snapshotRow({
        // A VERIFIED, enabled Greenhouse board: strong company identity, and no
        // register evidence whatsoever.
        companyRecord: { displayName: 'Fixture Care Ltd', sponsorMatchStatus: 'NONE', sponsorOrganisationName: null, sponsorRegisterVersion: 'register-v1', sponsorCheckedAt: new Date(), sponsorEvidence: null },
      }),
    );
    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.job.sourceSummary.employerDirect).toBe(true);
    expect(view?.sponsorEvidence.status).toBe('NONE');
  });

  it('does not derive vacancy sponsorship wording from a register match', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    const view = await getJobDetailsView('job-1', 'user-1');
    // The employer matches the register; the advert's wording is a separate
    // field and is absent because no intelligence pass has assessed this text.
    expect(view?.sponsorEvidence.status).toBe('MATCHED');
    expect(view?.vacancySponsorship).toBeUndefined();
  });

  it('omits practical compatibility entirely when no Career Track is selected', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    const view = await getJobDetailsView('job-1', 'user-1');
    expect(view?.practicalCompatibility).toBeUndefined();
    expect(buildConfirmedCandidateFacts).not.toHaveBeenCalled();
  });

  it('keeps practical compatibility out of the match-readiness decision', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow({ selectedDescriptionHash: null }));
    buildConfirmedCandidateFacts.mockResolvedValue({ professionalRegistrations: [], drivingLicenceHeld: false });

    const view = await getJobDetailsView('job-1', 'user-1', { profileId: 'profile-1' });
    // Recorded conflicts and unknowns exist, and readiness still turns purely on
    // description completeness — a practical flag must never gate or score a match.
    expect(view?.practicalCompatibility).toBeDefined();
    expect(view?.matchPreparation).toMatchObject({ eligible: true });
    expect(JSON.stringify(view?.matchPreparation)).not.toMatch(/DRIVING|SPONSOR|DBS/i);
  });
});

describe('candidate practical compatibility on details', () => {
  it('is computed for the requested profile and carries its own disclaimer', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    buildConfirmedCandidateFacts.mockResolvedValue({ professionalRegistrations: [], homeCity: 'Birmingham' });

    const view = await getJobDetailsView('job-1', 'user-1', { profileId: 'profile-1' });
    expect(buildConfirmedCandidateFacts).toHaveBeenCalledWith('user-1', 'profile-1');
    expect(view?.practicalCompatibility?.disclaimer).toMatch(/not legal or immigration advice/i);
    expect(view?.practicalCompatibility?.summary).toBeDefined();
  });

  it('produces nothing when the profile does not belong to the user', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    // `buildConfirmedCandidateFacts` filters by user id and returns null for a
    // profile the caller does not own.
    buildConfirmedCandidateFacts.mockResolvedValue(null);

    const view = await getJobDetailsView('job-1', 'user-2', { profileId: 'someone-elses-profile' });
    expect(view?.practicalCompatibility).toBeUndefined();
  });

  it('never emits an eligibility percentage', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(snapshotRow());
    buildConfirmedCandidateFacts.mockResolvedValue({ professionalRegistrations: [], homeCity: 'Birmingham' });

    const view = await getJobDetailsView('job-1', 'user-1', { profileId: 'profile-1' });
    expect(JSON.stringify(view?.practicalCompatibility)).not.toMatch(/%|"score"|"percentage"/i);
  });
});
