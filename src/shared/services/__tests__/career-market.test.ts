import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import type { NormalisedJob, ProviderSearchResult } from '@/shared/types/job';
import {
  buildCareerMarketSnapshot,
  careerMarketKey,
  isUkMarketJob,
  marketProviderLocation,
  resolveCareerMarketSnapshot,
} from '../career-market';

function job(overrides: Partial<NormalisedJob> = {}): NormalisedJob {
  return {
    source: 'ADZUNA', sourceJobId: '1', providerReferences: [], canonicalUrl: 'https://jobs.test/1',
    title: 'Product Manager', company: 'Acme', locationText: 'London', region: 'London',
    descriptionAvailability: 'PARTIAL', remoteType: 'HYBRID', salaryMin: 50_000,
    salaryMax: 70_000, salaryPeriod: 'YEAR', currency: 'GBP', salaryText: '£50k–£70k',
    contractType: 'permanent', sponsorSignal: { registerMatchStatus: 'EXACT', jobWording: 'NOT_MENTIONED', explanation: 'Register evidence only' },
    eligibilityHints: [], dedupeFingerprint: 'fp-1', canonicalJobId: 'job-1', fetchedAt: '2026-09-25T10:00:00.000Z',
    ...overrides,
  };
}

function result(jobs: NormalisedJob[]): ProviderSearchResult {
  return { provider: 'ADZUNA', status: 'SUCCESS', jobs, rawReceived: jobs.length, validNormalised: jobs.length, durationMs: 12 };
}

describe('Career Market snapshots', () => {
  it('normalizes working-hours variants separately from employment type without losing sample counts', () => {
    const values = ['Full-Time', 'Full Time', 'full_time', 'FullTime', 'Permanent', 'Permanent, Full Time'];
    const snapshot = buildCareerMarketSnapshot(
      { role: 'Analyst', location: 'UK' },
      [result(values.map((contractType, index) => job({
        sourceJobId: String(index + 1),
        canonicalJobId: `job-${index + 1}`,
        dedupeFingerprint: `fp-${index + 1}`,
        canonicalUrl: `https://jobs.test/${index + 1}`,
        title: `Analyst ${index + 1}`,
        contractType,
        employmentType: contractType,
      })))],
    );

    expect(snapshot.metrics.employmentTypeMix).toEqual([
      { label: 'Not stated', count: 4, share: 66.7 },
      { label: 'Permanent', count: 2, share: 33.3 },
    ]);
    expect(snapshot.metrics.workingHoursMix).toEqual([
      { label: 'Full-time', count: 5, share: 83.3 },
      { label: 'Not stated', count: 1, share: 16.7 },
    ]);
    expect(snapshot.metrics.employmentTypeMix.reduce((sum, item) => sum + item.count, 0)).toBe(6);
    expect(snapshot.metrics.workingHoursMix.reduce((sum, item) => sum + item.count, 0)).toBe(6);
    expect(snapshot.dataQuality).toMatchObject({ contractTypeMissing: 4, workingHoursMissing: 1 });
  });

  it('uses a quartile salary range only when the annual sample has stable quartile coverage', () => {
    const salaries = [20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000];
    const snapshot = buildCareerMarketSnapshot(
      { role: 'Engineer', location: 'UK' },
      [result(salaries.map((salary, index) => job({
        sourceJobId: String(index + 1),
        canonicalJobId: `salary-job-${index + 1}`,
        dedupeFingerprint: `salary-fp-${index + 1}`,
        canonicalUrl: `https://jobs.test/salary-${index + 1}`,
        title: `Engineer ${index + 1}`,
        salaryMin: salary,
        salaryMax: salary,
      })))],
    );

    expect(snapshot.metrics.salary.annualGbp).toEqual({
      minimum: 20_000,
      median: 55_000,
      maximum: 90_000,
      range: { kind: 'QUARTILE', minimum: 37_500, maximum: 72_500 },
    });
  });

  it('keeps an observed salary range when the annual sample is too small for stable quartiles', () => {
    const salaries = [20_000, 30_000, 80_000, 90_000, 100_000, 110_000, 120_000];
    const snapshot = buildCareerMarketSnapshot(
      { role: 'Engineer', location: 'UK' },
      [result(salaries.map((salary, index) => job({
        sourceJobId: String(index + 1),
        canonicalJobId: `small-salary-job-${index + 1}`,
        dedupeFingerprint: `small-salary-fp-${index + 1}`,
        canonicalUrl: `https://jobs.test/small-salary-${index + 1}`,
        title: `Engineer ${index + 1}`,
        salaryMin: salary,
        salaryMax: salary,
      })))],
    );

    expect(snapshot.metrics.salary.annualGbp).toMatchObject({
      minimum: 20_000,
      median: 90_000,
      maximum: 120_000,
      range: { kind: 'OBSERVED', minimum: 20_000, maximum: 120_000 },
    });
  });

  it('classifies provider jobs without precomputed UK eligibility before sampling', () => {
    expect(isUkMarketJob(job({ locationText: 'Leeds', region: 'Yorkshire', ukEligibility: undefined }))).toBe(true);
    expect(isUkMarketJob(job({ locationText: 'New York, NY', region: 'New York', ukEligibility: undefined }))).toBe(false);
  });

  it('does not turn the default UK-wide sample into a provider radius search', () => {
    expect(marketProviderLocation('UK')).toBe('');
    expect(marketProviderLocation(' United Kingdom ')).toBe('');
    expect(marketProviderLocation('Leeds')).toBe('Leeds');
  });

  it('uses normalized role and location for a stable market key', () => {
    expect(careerMarketKey('  Product   Manager ', ' Greater London ')).toBe(
      careerMarketKey('product manager', 'greater london'),
    );
    expect(careerMarketKey('product manager', 'Leeds')).not.toBe(careerMarketKey('product manager', 'London'));
  });

  it('derives only sampled, disclosed metrics and reports missingness', () => {
    const snapshot = buildCareerMarketSnapshot(
      { role: 'Product Manager', location: 'UK' },
      [result([
        job(),
        job({ sourceJobId: '2', canonicalJobId: 'job-2', dedupeFingerprint: 'fp-2', canonicalUrl: 'https://jobs.test/2', title: 'Operations Manager', company: 'Beta', locationText: 'Leeds', region: 'Yorkshire', remoteType: 'REMOTE', salaryMin: undefined, salaryMax: undefined, salaryPeriod: undefined, salaryText: undefined, contractType: undefined, sponsorSignal: { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'No register match' } }),
      ])],
      new Date('2026-09-25T12:00:00.000Z'),
      new Date('2026-09-25T12:00:01.000Z'),
    );

    expect(snapshot.sampleSize).toBe(2);
    expect(snapshot.metrics.salary).toMatchObject({ disclosedCount: 1, eligibleAnnualCount: 1, disclosureRate: 50, annualGbp: { minimum: 60_000, median: 60_000, maximum: 60_000 } });
    expect(snapshot.dataQuality.salaryMissing).toBe(1);
    expect(snapshot.metrics.workStyleMix.map((item) => item.label)).toEqual(['HYBRID', 'REMOTE']);
    expect(snapshot.metrics).not.toHaveProperty('historicalTrend');
    expect(snapshot.metrics).not.toHaveProperty('demandScore');
  });

  it('keeps unknown work style as missingness instead of chart data', () => {
    const snapshot = buildCareerMarketSnapshot(
      { role: 'Analyst', location: 'UK' },
      [result([
        job({ remoteType: 'UNKNOWN' }),
        job({ sourceJobId: '2', canonicalJobId: 'job-2', canonicalUrl: 'https://jobs.test/2', dedupeFingerprint: 'fp-2', title: 'Senior Analyst', company: 'Beta', locationText: 'Leeds', region: 'Yorkshire', remoteType: 'HYBRID' }),
      ])],
    );

    expect(snapshot.dataQuality.workStyleUnknown).toBe(1);
    expect(snapshot.metrics.workStyleMix).toEqual([
      { label: 'HYBRID', count: 1, share: 100 },
    ]);
  });

  it('serves fresh snapshots without regeneration', async () => {
    const store = new MemoryCacheStore();
    const fresh = { ...buildCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, [result([job()])]), id: 'snapshot-1' };
    const generate = vi.fn();
    const findLatest = vi.fn(async () => fresh);

    const resolved = await resolveCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, { store, findLatest, generate });
    expect(resolved).toMatchObject({ freshness: 'FRESH', snapshot: { id: 'snapshot-1' } });
    expect(generate).not.toHaveBeenCalled();
  });

  it('regenerates a fresh snapshot whose calculation version cannot provide the new presentation dimensions', async () => {
    const store = new MemoryCacheStore();
    const legacy = {
      ...buildCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, [result([job()])]),
      id: 'snapshot-legacy',
      calculationVersion: 'market-sample-v1',
    };
    const current = {
      ...buildCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, [result([job()])]),
      id: 'snapshot-current',
    };
    const generate = vi.fn(async () => current);

    const resolved = await resolveCareerMarketSnapshot(
      { role: 'Nurse', location: 'Leeds' },
      { store, findLatest: vi.fn(async () => legacy), generate },
    );

    expect(generate).toHaveBeenCalledOnce();
    expect(resolved).toMatchObject({ freshness: 'GENERATED', snapshot: { id: 'snapshot-current' } });
  });

  it('returns stale data when another request owns the refresh lock', async () => {
    const store = new MemoryCacheStore();
    const old = new Date('2026-09-23T10:00:00.000Z');
    const stale = { ...buildCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, [result([job()])], old, old), id: 'snapshot-old' };
    await store.setIfAbsent(`v2:jobs:lock:market:${stale.marketKey}`, 'other-owner', 60);
    const resolved = await resolveCareerMarketSnapshot(
      { role: 'Nurse', location: 'Leeds' },
      { store, findLatest: vi.fn(async () => stale), generate: vi.fn() },
      new Date('2026-09-25T12:00:00.000Z'),
    );
    expect(resolved).toEqual({ freshness: 'STALE', snapshot: stale });
  });
});
