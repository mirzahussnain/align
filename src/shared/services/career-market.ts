import { createHash } from 'node:crypto';

import { prisma } from '@/shared/lib/prisma';
import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import { getCacheBackend, getCacheStore } from '@/shared/lib/cache/cache-provider';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { acquireRefreshLock } from '@/shared/lib/cache/refresh-lock';
import { deduplicateJobs, searchProvider } from '@/shared/services/job-search';
import { assessUkLocation, isUkDiscoverable } from '@/shared/services/uk-location';
import { SEARCH_JOB_PROVIDERS, type NormalisedJob, type ProviderSearchResult } from '@/shared/types/job';
import type { CareerMarketSnapshotView, MarketMixItem } from '@/shared/types/career-market';

export const CAREER_MARKET_CALCULATION_VERSION = 'market-sample-v2';
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
// Eight observations give each outer quartile at least two real observations.
// Below that boundary, interpolated quartiles are too sensitive to one listing.
const MIN_STABLE_QUARTILE_SAMPLE = 8;

type SnapshotDraft = Omit<CareerMarketSnapshotView, 'id'>;
type MarketInput = { role: string; location: string };
type SnapshotResolution = {
  freshness: 'FRESH' | 'GENERATED' | 'STALE' | 'PENDING';
  snapshot: CareerMarketSnapshotView | null;
};

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

export function isUkMarketJob(job: NormalisedJob): boolean {
  const eligibility = job.ukEligibility ?? assessUkLocation({
    locationText: job.locationText,
    city: job.city,
    region: job.region,
    country: job.country,
    remote: job.remoteType === 'REMOTE',
  }).eligibility;
  return isUkDiscoverable(eligibility);
}

export function marketProviderLocation(location: string): string {
  const trimmed = location.trim();
  return /^(?:uk|united kingdom)$/i.test(trimmed) ? '' : trimmed;
}

export function careerMarketKey(role: string, location: string): string {
  return createHash('sha256')
    .update(`${normalize(role)}\n${normalize(location) || 'uk'}`)
    .digest('hex')
    .slice(0, 32);
}

function mix(values: string[], limit = 8): MarketMixItem[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, share: values.length ? Math.round((count / values.length) * 1000) / 10 : 0 }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

function percentile(values: number[], percentileValue: number) {
  const ordered = [...values].sort((a, b) => a - b);
  const position = (ordered.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = ordered[lowerIndex];
  const upper = ordered[upperIndex];
  return Math.round(lower + (upper - lower) * (position - lowerIndex));
}

function normalizedEmploymentText(value: string | undefined) {
  return (value ?? '').trim().toLocaleLowerCase('en-GB').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function employmentType(value: string | undefined): string {
  const normalized = normalizedEmploymentText(value);
  if (/\bpermanent\b/.test(normalized)) return 'Permanent';
  if (/\b(fixed term|temporary|temp)\b/.test(normalized)) return 'Fixed-term / Temporary';
  if (/\bcontract(or)?\b/.test(normalized)) return 'Contract';
  if (/\bbank\b/.test(normalized)) return 'Bank';
  if (/\blocum\b/.test(normalized)) return 'Locum';
  if (/\b(casual|freelance|intern(ship)?|apprentice(ship)?|volunteer)\b/.test(normalized)) return 'Other';
  return 'Not stated';
}

function workingHours(value: string | undefined): string {
  const normalized = normalizedEmploymentText(value);
  if (/\bfull\s*time\b/.test(normalized)) return 'Full-time';
  if (/\bpart\s*time\b/.test(normalized)) return 'Part-time';
  if (/\b(flexible|variable hours|zero hours|compressed hours)\b/.test(normalized)) return 'Flexible / Other';
  return 'Not stated';
}

export function buildCareerMarketSnapshot(
  input: MarketInput,
  providerResults: ProviderSearchResult[],
  samplingStartedAt = new Date(),
  samplingCompletedAt = new Date(),
): SnapshotDraft {
  const jobs = deduplicateJobs(providerResults.flatMap((result) => result.jobs));
  const salaryDisclosed = jobs.filter((job) => job.salaryText || job.salaryMin != null || job.salaryMax != null);
  const annualSalaries = jobs.flatMap((job) => {
    if (job.salaryPeriod !== 'YEAR') return [];
    const lower = job.salaryMin ?? job.salaryMax;
    const upper = job.salaryMax ?? job.salaryMin;
    return lower == null || upper == null ? [] : [Math.round((lower + upper) / 2)];
  });
  const employmentValues = jobs.map((job) => employmentType(job.contractType || job.employmentType));
  const workingHoursValues = jobs.map((job) => workingHours(job.contractType || job.employmentType));
  const workStyleValues = jobs.map((job) => job.remoteType || 'UNKNOWN');
  const disclosedWorkStyles = workStyleValues.filter((value) => value !== 'UNKNOWN');
  const regionValues = jobs.map((job) => job.region || job.city || '').filter(Boolean);
  const sponsorValues = jobs.map((job) => job.sponsorSignal.registerMatchStatus);
  const disclosedRate = jobs.length ? Math.round((salaryDisclosed.length / jobs.length) * 1000) / 10 : 0;

  return {
    marketKey: careerMarketKey(input.role, input.location),
    roleQuery: input.role.trim(),
    locationQuery: input.location.trim() || 'UK',
    normalizedRole: normalize(input.role),
    normalizedLocation: normalize(input.location) || 'uk',
    providerCoverage: providerResults.map((result) => ({
      provider: result.provider,
      status: result.status,
      sampled: result.jobs.length,
    })),
    sampleSize: jobs.length,
    samplingStartedAt: samplingStartedAt.toISOString(),
    samplingCompletedAt: samplingCompletedAt.toISOString(),
    generatedAt: samplingCompletedAt.toISOString(),
    expiresAt: new Date(samplingCompletedAt.getTime() + SNAPSHOT_TTL_MS).toISOString(),
    calculationVersion: CAREER_MARKET_CALCULATION_VERSION,
    dataQuality: {
      salaryMissing: jobs.length - salaryDisclosed.length,
      contractTypeMissing: employmentValues.filter((value) => value === 'Not stated').length,
      workingHoursMissing: workingHoursValues.filter((value) => value === 'Not stated').length,
      workStyleUnknown: workStyleValues.filter((value) => value === 'UNKNOWN').length,
      locationMissing: jobs.filter((job) => !job.locationText.trim()).length,
      note: "A bounded vacancy sample from Align's integrated sources; coverage and missing fields are shown explicitly.",
    },
    metrics: {
      sampledVacancyCount: jobs.length,
      salary: {
        disclosedCount: salaryDisclosed.length,
        eligibleAnnualCount: annualSalaries.length,
        disclosureRate: disclosedRate,
        ...(annualSalaries.length ? {
          annualGbp: {
            minimum: Math.min(...annualSalaries),
            median: median(annualSalaries),
            maximum: Math.max(...annualSalaries),
            range: annualSalaries.length >= MIN_STABLE_QUARTILE_SAMPLE
              ? { kind: 'QUARTILE' as const, minimum: percentile(annualSalaries, 0.25), maximum: percentile(annualSalaries, 0.75) }
              : { kind: 'OBSERVED' as const, minimum: Math.min(...annualSalaries), maximum: Math.max(...annualSalaries) },
          },
        } : {}),
      },
      employmentTypeMix: mix(employmentValues),
      workingHoursMix: mix(workingHoursValues),
      workStyleMix: mix(disclosedWorkStyles) as CareerMarketSnapshotView['metrics']['workStyleMix'],
      regions: mix(regionValues),
      topEmployers: mix(jobs.map((job) => job.company), 6),
      sponsorshipEmployerContext: mix(sponsorValues),
      currentVacancies: jobs.slice(0, 12).map((job) => ({
        id: job.canonicalJobId,
        title: job.title,
        employer: job.company,
        location: job.locationText,
        provider: job.source,
        url: job.canonicalUrl,
        ...(job.salaryText ? { salaryText: job.salaryText } : {}),
      })),
    },
  };
}

function rowToView(row: {
  id: string; marketKey: string; roleQuery: string; locationQuery: string; normalizedRole: string;
  normalizedLocation: string; providerCoverage: unknown; sampleSize: number; samplingStartedAt: Date;
  samplingCompletedAt: Date; generatedAt: Date; expiresAt: Date; calculationVersion: string;
  dataQuality: unknown; metrics: unknown;
}): CareerMarketSnapshotView {
  return {
    id: row.id,
    marketKey: row.marketKey,
    roleQuery: row.roleQuery,
    locationQuery: row.locationQuery,
    normalizedRole: row.normalizedRole,
    normalizedLocation: row.normalizedLocation,
    providerCoverage: row.providerCoverage as CareerMarketSnapshotView['providerCoverage'],
    sampleSize: row.sampleSize,
    samplingStartedAt: row.samplingStartedAt.toISOString(),
    samplingCompletedAt: row.samplingCompletedAt.toISOString(),
    generatedAt: row.generatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    calculationVersion: row.calculationVersion,
    dataQuality: row.dataQuality as CareerMarketSnapshotView['dataQuality'],
    metrics: row.metrics as CareerMarketSnapshotView['metrics'],
  };
}

async function findLatestSnapshot(marketKey: string): Promise<CareerMarketSnapshotView | null> {
  const row = await prisma.careerMarketSnapshot.findFirst({ where: { marketKey }, orderBy: { generatedAt: 'desc' } });
  return row ? rowToView(row) : null;
}

async function generateSnapshot(input: MarketInput, store: CacheStore): Promise<CareerMarketSnapshotView> {
  const startedAt = new Date();
  const controller = new AbortController();
  const params = { query: input.role, location: marketProviderLocation(input.location), page: 1, perPage: 50, contractType: 'all' as const, sortBy: 'date' as const };
  const results = await Promise.all(SEARCH_JOB_PROVIDERS.map((provider) => searchProvider(provider, params, store, controller.signal)));
  if (!results.some((result) => ['SUCCESS', 'EMPTY', 'STALE_CACHE'].includes(result.status))) {
    throw new Error('MARKET_SAMPLE_UNAVAILABLE');
  }
  const ukResults = results.map((result) => ({
    ...result,
    jobs: result.jobs.filter(isUkMarketJob),
  }));
  const draft = buildCareerMarketSnapshot(input, ukResults, startedAt, new Date());
  const row = await prisma.careerMarketSnapshot.create({ data: {
    marketKey: draft.marketKey,
    roleQuery: draft.roleQuery,
    locationQuery: draft.locationQuery,
    normalizedRole: draft.normalizedRole,
    normalizedLocation: draft.normalizedLocation,
    providerCoverage: draft.providerCoverage as never,
    sampleSize: draft.sampleSize,
    samplingStartedAt: new Date(draft.samplingStartedAt),
    samplingCompletedAt: new Date(draft.samplingCompletedAt),
    generatedAt: new Date(draft.generatedAt),
    expiresAt: new Date(draft.expiresAt),
    calculationVersion: draft.calculationVersion,
    salaryDisclosedCount: draft.metrics.salary.disclosedCount,
    salaryEligibleCount: draft.metrics.salary.eligibleAnnualCount,
    dataQuality: draft.dataQuality as never,
    metrics: draft.metrics as never,
  } });
  return rowToView(row);
}

type ResolutionDependencies = {
  store?: CacheStore;
  findLatest?: (marketKey: string) => Promise<CareerMarketSnapshotView | null>;
  generate?: (input: MarketInput, store: CacheStore) => Promise<CareerMarketSnapshotView>;
  allowUnlockedRefresh?: boolean;
};

export async function resolveCareerMarketSnapshot(
  input: MarketInput,
  dependencies: ResolutionDependencies = {},
  now = new Date(),
): Promise<SnapshotResolution> {
  const store = dependencies.store ?? getCacheStore();
  const key = careerMarketKey(input.role, input.location);
  const cacheKey = cacheKeys.marketSnapshot(key);
  const cached = await store.get<CareerMarketSnapshotView>(cacheKey);
  if (
    cached
    && cached.calculationVersion === CAREER_MARKET_CALCULATION_VERSION
    && new Date(cached.expiresAt) > now
  ) return { freshness: 'FRESH', snapshot: cached };

  const findLatest = dependencies.findLatest ?? findLatestSnapshot;
  const persisted = await findLatest(key);
  if (
    persisted
    && persisted.calculationVersion === CAREER_MARKET_CALCULATION_VERSION
    && new Date(persisted.expiresAt) > now
  ) {
    await store.set(cacheKey, persisted, CACHE_TTL_SECONDS.marketSnapshot);
    return { freshness: 'FRESH', snapshot: persisted };
  }

  const lock = await acquireRefreshLock(store, cacheKeys.marketRefreshLock(key), CACHE_TTL_SECONDS.marketRefreshLock);
  const allowUnlockedRefresh = dependencies.allowUnlockedRefresh ?? (!dependencies.store && getCacheBackend() === 'disabled');
  if (!lock.acquired && !allowUnlockedRefresh) return { freshness: persisted ? 'STALE' : 'PENDING', snapshot: persisted };

  try {
    const generate = dependencies.generate ?? generateSnapshot;
    const generated = await generate(input, store);
    await store.set(cacheKey, generated, CACHE_TTL_SECONDS.marketSnapshot);
    return { freshness: 'GENERATED', snapshot: generated };
  } catch (error) {
    if (persisted) return { freshness: 'STALE', snapshot: persisted };
    throw error;
  } finally {
    await lock.release();
  }
}
