/**
 * Ownership and privacy for candidate practical facts.
 *
 * Sponsor-register evidence is company-level public data and may be shared-cached.
 * Everything in this file is the opposite: user-specific, never shared-cached,
 * and never logged in the clear.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    profileIdentity: { findUnique: vi.fn() },
    profilePracticalFacts: { findUnique: vi.fn() },
    profile: { findFirst: vi.fn() },
  },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

const { buildConfirmedCandidateFacts } = await import('@/shared/services/practical-compatibility-store');
const { comparePracticalCompatibility } = await import('@/shared/services/practical-compatibility');
const { __setJobLogSink, logJobBoardEvent, sanitizeJobMeta } = await import(
  '@/shared/services/job-board-observability'
);

const profileRow = {
  id: 'profile-1',
  licences: [],
  professionalRegistrations: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.profileIdentity.findUnique.mockResolvedValue(null);
  prisma.profilePracticalFacts.findUnique.mockResolvedValue(null);
  prisma.profile.findFirst.mockResolvedValue(profileRow);
});

describe('ownership', () => {
  it('scopes every read by user id', async () => {
    await buildConfirmedCandidateFacts('user-1', 'profile-1');
    expect(prisma.profile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'profile-1', userId: 'user-1' } }),
    );
    expect(prisma.profileIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(prisma.profilePracticalFacts.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('returns nothing for a profile the caller does not own', async () => {
    // The user-scoped `findFirst` simply does not match.
    prisma.profile.findFirst.mockResolvedValue(null);
    expect(await buildConfirmedCandidateFacts('user-2', 'profile-1')).toBeNull();
  });
});

describe('no inference from prose', () => {
  it('reads only named structured columns', async () => {
    await buildConfirmedCandidateFacts('user-1', 'profile-1');
    const select = prisma.profile.findFirst.mock.calls[0][0].select;
    // No experience, project, summary, stored CV or extraction relation is
    // selected, so there is no prose in scope to infer a fact from.
    expect(Object.keys(select).sort()).toEqual(['id', 'licences', 'professionalRegistrations']);
    expect(JSON.stringify(select)).not.toMatch(/experience|summary|storedCv|extraction|description/i);
  });

  it('does not treat an absent licence row as a confirmed absence', async () => {
    const facts = await buildConfirmedCandidateFacts('user-1', 'profile-1');
    // UNKNOWN, not false: nobody has said the candidate lacks a licence.
    expect(facts?.drivingLicenceHeld).toBeUndefined();
  });

  it('derives work permission only from statuses that are unambiguous', async () => {
    prisma.profileIdentity.findUnique.mockResolvedValue({ visaStatus: 'BRITISH_CITIZEN', visaExpiry: null, city: null, state: null, country: null });
    const british = await buildConfirmedCandidateFacts('user-1', 'profile-1');
    expect(british).toMatchObject({ hasUnrestrictedWorkPermission: true, requiresSponsorshipNow: false });

    // A sponsored route is NOT converted into "requires sponsorship now": that
    // would be applying the Immigration Rules, which this product does not do.
    prisma.profileIdentity.findUnique.mockResolvedValue({ visaStatus: 'SKILLED_WORKER', visaExpiry: null, city: null, state: null, country: null });
    const skilled = await buildConfirmedCandidateFacts('user-1', 'profile-1');
    expect(skilled?.requiresSponsorshipNow).toBeUndefined();
    expect(skilled?.hasUnrestrictedWorkPermission).toBe(false);
  });

  it('lets an explicit user answer override anything derived', async () => {
    prisma.profileIdentity.findUnique.mockResolvedValue({ visaStatus: 'GRADUATE', visaExpiry: null, city: null, state: null, country: null });
    prisma.profilePracticalFacts.findUnique.mockResolvedValue({
      requiresSponsorshipNow: false,
      mayRequireSponsorshipLater: true,
      relocationLocations: [],
    });
    const facts = await buildConfirmedCandidateFacts('user-1', 'profile-1');
    expect(facts).toMatchObject({ requiresSponsorshipNow: false, mayRequireSponsorshipLater: true });
  });
});

describe('logging never carries a profile value', () => {
  it('drops every non-allow-listed field, including profile facts', () => {
    const safe = sanitizeJobMeta({
      unknownCount: 3,
      visaStatus: 'GRADUATE',
      visaExpiry: '2027-12-01',
      homeCity: 'Birmingham',
      drivingLicenceHeld: false,
      dbs: 'ENHANCED',
      securityClearance: 'SC',
      professionalRegistration: 'NMC',
      description: 'a whole job advert',
    });
    expect(safe).toEqual({ unknownCount: 3 });
  });

  it('emits counts only for a completed comparison', () => {
    const emitted: Record<string, unknown>[] = [];
    const restore = __setJobLogSink((record) => emitted.push(record));
    try {
      const result = comparePracticalCompatibility(
        [{ category: 'DRIVING_LICENCE', requirement: 'REQUIRED', evidenceText: 'Driving licence required.', confidence: 'HIGH' }],
        { professionalRegistrations: [], homeCity: 'Birmingham', drivingLicenceHeld: false },
      );
      logJobBoardEvent('practical_comparison_completed', {
        count: result.items.length,
        confirmedCount: result.summary.confirmed,
        conflictCount: result.summary.conflicts,
        unknownCount: result.summary.unknown,
      });
    } finally {
      restore();
    }
    const line = JSON.stringify(emitted[0]);
    expect(line).toMatch(/"conflictCount":1/);
    expect(line).not.toMatch(/Birmingham|licence|GRADUATE|visa/i);
  });
});

describe('shared caching boundary', () => {
  it('the comparison is a pure function with no cache dependency at all', async () => {
    const compatibility = await import('@/shared/services/practical-compatibility');
    const source = compatibility.comparePracticalCompatibility.toString();
    // A user-specific result must never be written to a shared namespace. The
    // module imports no cache store, so there is nothing there to misuse.
    expect(source).not.toMatch(/cacheKeys|getCacheStore|redis/i);
    expect(Object.keys(compatibility)).not.toContain('cache');
  });
});
