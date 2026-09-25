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

  it('serves fresh snapshots without regeneration', async () => {
    const store = new MemoryCacheStore();
    const fresh = { ...buildCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, [result([job()])]), id: 'snapshot-1' };
    const generate = vi.fn();
    const findLatest = vi.fn(async () => fresh);

    const resolved = await resolveCareerMarketSnapshot({ role: 'Nurse', location: 'Leeds' }, { store, findLatest, generate });
    expect(resolved).toMatchObject({ freshness: 'FRESH', snapshot: { id: 'snapshot-1' } });
    expect(generate).not.toHaveBeenCalled();
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
