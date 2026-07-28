import { describe, expect, it } from 'vitest';
import { isUsableSnapshot, jobCard, safeUrl, snapshotFreshness, sponsorSummary } from '@/shared/services/job-board-api';

const now = new Date('2026-07-28T12:00:00.000Z');
const snapshot = (lastSeenAt: Date, overrides: Record<string, unknown> = {}) => ({
  id: 'job-1', title: 'Platform Engineer', employerName: 'Example Ltd', companyRecordId: 'company-1', locationText: 'London', workStyle: 'HYBRID', employmentType: 'FULL_TIME', salaryMin: 60000, salaryMax: 75000, salaryCurrency: 'GBP', salaryPeriod: 'YEAR', status: 'ACTIVE', lastSeenAt,
  employerSource: { provider: 'GREENHOUSE', enabled: true, verificationStatus: 'VERIFIED' }, companyRecord: { displayName: 'Example Ltd', sponsorMatchStatus: 'EXACT' }, providerReferences: [{ provider: 'GREENHOUSE', providerUrl: 'https://jobs.example.test/1', applicationUrl: 'https://jobs.example.test/apply/1' }], ...overrides,
});

describe('Phase 10 job-board contract mapping', () => {
  it('uses the central 24-hour / 7-day ATS freshness policy', () => {
    expect(snapshotFreshness(snapshot(new Date(now.getTime() - 23 * 60 * 60_000)), now)).toBe('FRESH');
    expect(snapshotFreshness(snapshot(new Date(now.getTime() - 25 * 60 * 60_000)), now)).toBe('STALE');
    expect(isUsableSnapshot(snapshot(new Date(now.getTime() - 6 * 24 * 60 * 60_000)), now)).toBe(true);
    expect(isUsableSnapshot(snapshot(new Date(now.getTime() - 8 * 24 * 60 * 60_000)), now)).toBe(false);
  });

  it('does not count disabled or unverified ATS snapshots as active', () => {
    expect(isUsableSnapshot(snapshot(now, { employerSource: { provider: 'GREENHOUSE', enabled: false, verificationStatus: 'VERIFIED' } }), now)).toBe(false);
    expect(isUsableSnapshot(snapshot(now, { employerSource: { provider: 'GREENHOUSE', enabled: true, verificationStatus: 'PENDING' } }), now)).toBe(false);
  });

  it('creates a lightweight provider-neutral card and omits unsafe URLs', () => {
    const card = jobCard(snapshot(now));
    expect(card).toMatchObject({ id: 'job-1', company: { id: 'company-1', displayName: 'Example Ltd' }, freshness: 'FRESH', saved: false, sourceSummary: { preferredProvider: 'GREENHOUSE', employerDirect: true } });
    expect(card).not.toHaveProperty('description');
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('keeps sponsor-register evidence neutral', () => {
    expect(sponsorSummary('EXACT')).toEqual({ status: 'MATCHED' });
    expect(sponsorSummary('AMBIGUOUS')).toEqual({ status: 'AMBIGUOUS' });
    expect(sponsorSummary('NONE')).toEqual({ status: 'NONE' });
  });
});