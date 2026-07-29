/** Provider-neutral discovery primitives. ATS data is read from snapshots, never boards. */
import { createHash } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';
import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import { createEnvelope, envelopeTtlSeconds, readEnvelope } from '@/shared/lib/cache/cache-envelope';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { DESCRIPTION_ASSESSMENT_VERSION } from '@/shared/services/job-description-completeness';
import { logJobBoardEvent } from '@/shared/services/job-board-observability';
import { blankSponsorSignal, extractEligibilityHints, normaliseCompanyName, normaliseLocation, normaliseLocationKey, normaliseTitle } from '@/shared/services/job-normalisation';
import { assessUkLocation, isUkDiscoverable, UK_SCOPE_VERSION } from '@/shared/services/uk-location';
import type { EmployerAtsProvider, JobProvider, NormalisedJob, ProviderReference } from '@/shared/types/job';

export const ATS_FRESHNESS = { freshMs: 24 * 60 * 60 * 1_000, usableStaleMs: 7 * 24 * 60 * 60 * 1_000 } as const;
export type DiscoveryProviderStatus = 'SUCCESS' | 'EMPTY' | 'STALE_CACHE' | 'TIMEOUT' | 'RATE_LIMITED' | 'UNAVAILABLE' | 'FAILED';
export type DiscoveryAtsProvider = Exclude<EmployerAtsProvider, 'SMARTRECRUITERS'>;
export const DISCOVERY_ATS_PROVIDERS = ['GREENHOUSE', 'LEVER', 'ASHBY'] as const satisfies readonly DiscoveryAtsProvider[];
export interface AtsSnapshotProviderResult { provider: DiscoveryAtsProvider; status: DiscoveryProviderStatus; jobs: NormalisedJob[]; rawReceived: number; validNormalised: number; durationMs: number; }
type SnapshotRow = {
  canonicalJobId: string; title: string; employerName: string; normalisedEmployerName: string; companyRecordId: string | null; employerSourceId: string | null;
  locationText: string | null; city: string | null; region: string | null; country: string | null; workStyle: string | null;
  salaryMin: { toNumber(): number } | number | null; salaryMax: { toNumber(): number } | number | null; salaryCurrency: string | null; salaryPeriod: string | null; salaryText: string | null;
  contractType: string | null; employmentType: string | null; providerDescription?: string | null; descriptionAvailability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY'; postedAt: Date | null; expiresAt: Date | null; lastSeenAt: Date; fetchedAt: Date; vacancySponsorshipSignal: unknown;
  employerSource: { provider: DiscoveryAtsProvider } | null; providerReferences: Array<{ provider: JobProvider; providerJobId: string; providerUrl: string; applicationUrl: string | null }>;
};
const asNumber = (value: SnapshotRow['salaryMin']) => value === null ? undefined : typeof value === 'number' ? value : value.toNumber();
const validUrl = (value: string | null | undefined) => { if (!value) return undefined; try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined; } catch { return undefined; } };
const remote = (value: string | null): NormalisedJob['remoteType'] => value === 'REMOTE' || value === 'HYBRID' || value === 'ONSITE' ? value : 'UNKNOWN';
const period = (value: string | null): NormalisedJob['salaryPeriod'] => value === 'HOUR' || value === 'DAY' || value === 'WEEK' || value === 'MONTH' || value === 'YEAR' ? value : undefined;

function snapshotToJob(row: SnapshotRow): NormalisedJob | null {
  const provider = row.employerSource?.provider;
  const primary = row.providerReferences.find((reference) => reference.provider === provider && validUrl(reference.providerUrl)) ?? row.providerReferences.find((reference) => validUrl(reference.providerUrl));
  if (!provider || !primary) return null;
  const refs: ProviderReference[] = row.providerReferences.flatMap((reference) => { const sourceUrl = validUrl(reference.providerUrl); if (!sourceUrl) return []; const applicationUrl = validUrl(reference.applicationUrl); return [{ provider: reference.provider, sourceJobId: reference.providerJobId, sourceUrl, ...(applicationUrl ? { applicationUrl } : {}) }]; });
  if (!refs.length) return null;
  const description = row.providerDescription ?? undefined; const location = normaliseLocation(row.locationText ?? '');
  const sponsor = row.vacancySponsorshipSignal && typeof row.vacancySponsorshipSignal === 'object' ? { ...blankSponsorSignal(), ...(row.vacancySponsorshipSignal as Partial<NormalisedJob['sponsorSignal']>) } : blankSponsorSignal();
  return { source: provider, sourceJobId: primary.providerJobId, providerReferences: refs, canonicalUrl: validUrl(primary.applicationUrl) ?? validUrl(primary.providerUrl)!, title: row.title, company: row.employerName, companyNormalised: row.normalisedEmployerName || normaliseCompanyName(row.employerName), ...location, city: row.city ?? location.city, region: row.region ?? location.region, country: row.country ?? location.country, description, descriptionAvailability: row.descriptionAvailability, salaryMin: asNumber(row.salaryMin), salaryMax: asNumber(row.salaryMax), salaryPeriod: period(row.salaryPeriod), currency: row.salaryCurrency === 'GBP' ? 'GBP' : undefined, salaryText: row.salaryText ?? undefined, contractType: row.contractType ?? undefined, employmentType: row.employmentType ?? undefined, remoteType: remote(row.workStyle) === 'UNKNOWN' ? location.remoteType : remote(row.workStyle), postedAt: row.postedAt?.toISOString(), expiresAt: row.expiresAt?.toISOString(), sponsorSignal: sponsor, eligibilityHints: extractEligibilityHints(description ?? '', remote(row.workStyle)), dedupeFingerprint: createHash('sha256').update(`${normaliseTitle(row.title)}|${row.normalisedEmployerName}|${normaliseLocationKey(row.locationText ?? '')}`).digest('hex').slice(0, 24), canonicalJobId: row.canonicalJobId, fetchedAt: row.fetchedAt.toISOString(), employerSourceId: row.employerSourceId ?? undefined, companyRecordId: row.companyRecordId ?? undefined };
}

/**
 * Read only verified/enabled ATS snapshots; database outage is a partial result,
 * not a search failure.
 *
 * THREE THINGS CHANGED HERE, ALL MEASURED AGAINST THE SAME QUERY.
 *
 * 1. NO DESCRIPTIONS. `include: { providerReferences: true }` pulled every
 *    column, and `providerDescription` holds whole job adverts. At catalogue
 *    scale that is megabytes of text transferred, parsed and discarded on every
 *    single search, because nothing on a result CARD renders a description. The
 *    select is now explicit and description-free. Persistence is unaffected: a
 *    NormalisedJob with no description makes `getOrCreateSnapshotFromNormalisedJob`
 *    retain the stored text rather than overwrite it, and identity dedupe between
 *    two employer-direct requisitions never consults description similarity.
 *
 * 2. UK SCOPE. There was no geographic predicate whatsoever, so every foreign
 *    requisition on a verified board entered UK Discover. Scope is applied in two
 *    layers: a cheap SQL pre-filter that removes the obviously-foreign rows the
 *    database can identify, and the authoritative deterministic classifier on
 *    what survives. SQL alone is not trusted — `country` is free-form in this
 *    schema — and the classifier alone would mean transferring the whole
 *    catalogue to reject most of it.
 *
 * 3. CACHED. This is a PUBLIC query: identical for every user, containing no
 *    saved state, no Career Track relevance and no pasted text. Those are merged
 *    per-user afterwards. So the normalised result is shared through the same
 *    CacheStore as the provider pages.
 */
export async function getAtsSnapshotProviderResults(
  now = new Date(),
  options: { store?: CacheStore } = {},
): Promise<AtsSnapshotProviderResult[]> {
  const started = Date.now();
  const store = options.store;
  const key = cacheKeys.atsSnapshotQuery(`${UK_SCOPE_VERSION}:${DESCRIPTION_ASSESSMENT_VERSION}`);

  if (store) {
    const cached = readEnvelope<AtsSnapshotProviderResult[]>(await store.get(key));
    if (cached.freshness === 'FRESH' || cached.freshness === 'STALE') {
      logJobBoardEvent(cached.freshness === 'STALE' ? 'cache_stale_served' : 'cache_hit', { cacheLayer: 'ats-snapshot', cacheHit: cached.freshness, ageMs: cached.ageMs, count: cached.value.reduce((total, result) => total + result.jobs.length, 0) });
      return cached.value.map((result) => ({ ...result, durationMs: Date.now() - started }));
    }
    logJobBoardEvent('cache_miss', { cacheLayer: 'ats-snapshot', cacheHit: 'MISS' });
  }

  try {
    const rows = await prisma.jobSnapshot.findMany({
      where: {
        status: 'ACTIVE',
        lastSeenAt: { gte: new Date(now.getTime() - ATS_FRESHNESS.usableStaleMs) },
        employerSource: { is: { enabled: true, verificationStatus: 'VERIFIED', provider: { in: [...DISCOVERY_ATS_PROVIDERS] } } },
        providerReferences: { some: { provider: { in: [...DISCOVERY_ATS_PROVIDERS] } } },
        // Cheap pre-filter only. Rows with no country evidence still reach the
        // classifier, which is what decides; this just avoids transferring the
        // clearly-foreign majority of a global board.
        //
        // The explicit NULL branch is load-bearing, not defensive tidiness.
        // `NOT: { country: { in: [...] } }` compiles to `NOT (country IN (...))`,
        // which evaluates to NULL — not TRUE — for a NULL country, so a bare
        // NOT-IN silently discards every row whose country was never recorded.
        // That is the overwhelming majority of this table, and losing them would
        // have emptied UK Discover rather than scoping it.
        OR: [{ country: null }, { country: { notIn: NON_UK_COUNTRY_VALUES } }],
      },
      select: {
        canonicalJobId: true, title: true, employerName: true, normalisedEmployerName: true, companyRecordId: true, employerSourceId: true,
        locationText: true, city: true, region: true, country: true, workStyle: true,
        salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, salaryText: true,
        contractType: true, employmentType: true, descriptionAvailability: true,
        postedAt: true, expiresAt: true, lastSeenAt: true, fetchedAt: true, vacancySponsorshipSignal: true,
        employerSource: { select: { provider: true } },
        providerReferences: { select: { provider: true, providerJobId: true, providerUrl: true, applicationUrl: true } },
      },
    }) as unknown as SnapshotRow[];

    const results = DISCOVERY_ATS_PROVIDERS.map((provider) => {
      const sourceRows = rows.filter((row) => row.employerSource?.provider === provider);
      const jobs = sourceRows.flatMap((row) => {
        const job = snapshotToJob(row);
        if (!job) return [];
        const scope = assessUkLocation({ locationText: row.locationText, city: row.city, region: row.region, country: row.country, remote: job.remoteType === 'REMOTE' });
        return isUkDiscoverable(scope.eligibility) ? [{ ...job, ukEligibility: scope.eligibility, ...(scope.countryCode ? { countryCode: scope.countryCode } : {}) }] : [];
      });
      const stale = sourceRows.some((row) => now.getTime() - row.lastSeenAt.getTime() > ATS_FRESHNESS.freshMs);
      return { provider, status: (jobs.length ? (stale ? 'STALE_CACHE' : 'SUCCESS') : 'EMPTY') as DiscoveryProviderStatus, jobs, rawReceived: sourceRows.length, validNormalised: jobs.length, durationMs: Date.now() - started };
    });

    if (store) {
      const envelope = createEnvelope(results, CACHE_TTL_SECONDS.atsSnapshotQuery, CACHE_TTL_SECONDS.atsSnapshotQueryStale);
      await store.set(key, envelope, envelopeTtlSeconds(envelope));
    }
    return results;
  } catch { return DISCOVERY_ATS_PROVIDERS.map((provider) => ({ provider, status: 'UNAVAILABLE' as const, jobs: [], rawReceived: 0, validNormalised: 0, durationMs: Date.now() - started })); }
}

/**
 * Country values the database can reject outright.
 *
 * Only literal, unambiguous non-UK values. Anything else — NULL, a city name
 * that landed in the column, "Remote" — is deliberately allowed through to the
 * classifier rather than guessed at in SQL.
 */
const NON_UK_COUNTRY_VALUES = [
  'US', 'USA', 'United States', 'CA', 'Canada', 'IE', 'Ireland', 'ES', 'Spain',
  'DE', 'Germany', 'FR', 'France', 'NL', 'Netherlands', 'IN', 'India', 'AU',
  'Australia', 'NZ', 'New Zealand', 'SG', 'Singapore', 'AE', 'PL', 'Poland',
  'PT', 'Portugal', 'IT', 'Italy', 'SE', 'Sweden', 'CH', 'Switzerland', 'JP',
  'Japan', 'BR', 'Brazil', 'ZA', 'South Africa', 'MX', 'Mexico', 'PH', 'NG',
];
const direct = (job: NormalisedJob) => job.providerReferences.some((ref) => DISCOVERY_ATS_PROVIDERS.includes(ref.provider as DiscoveryAtsProvider));
const quality = (job: NormalisedJob) => direct(job) ? 3 : job.source === 'JOOBLE' ? 1 : 2;
const words = (value: string) => new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
const similarity = (a: string | undefined, b: string | undefined) => { if (!a || !b) return 0; const left = words(a); const right = words(b); let overlap = 0; for (const word of left) if (right.has(word)) overlap += 1; return overlap / Math.max(1, Math.min(left.size, right.size)); };
const sameReference = (a: NormalisedJob, b: NormalisedJob) => a.source === b.source && a.sourceJobId === b.sourceJobId && a.providerReferences.some((left) => b.providerReferences.some((right) => left.provider === right.provider && left.sourceJobId === right.sourceJobId));

/** Conservative identity: same employer/title alone never joins two direct requisitions. */
export function areCanonicalDuplicates(a: NormalisedJob, b: NormalisedJob): boolean {
  if (a.canonicalUrl === b.canonicalUrl || sameReference(a, b)) return true;
  if (normaliseTitle(a.title) !== normaliseTitle(b.title) || (a.companyNormalised ?? normaliseCompanyName(a.company)) !== (b.companyNormalised ?? normaliseCompanyName(b.company)) || normaliseLocationKey(a.locationText) !== normaliseLocationKey(b.locationText)) return false;
  if (direct(a) && direct(b)) return false;
  if (!direct(a) && !direct(b)) return !a.postedAt || !b.postedAt || Math.abs(Date.parse(a.postedAt) - Date.parse(b.postedAt)) <= 14 * 86_400_000;
  if (a.postedAt && b.postedAt && Math.abs(Date.parse(a.postedAt) - Date.parse(b.postedAt)) > 14 * 86_400_000) return false;
  return similarity(a.description, b.description) >= 0.35;
}
const references = (values: ProviderReference[]) => { const seen = new Set<string>(); return values.filter((value) => { const key = `${value.provider}:${value.sourceJobId}`; if (seen.has(key)) return false; seen.add(key); return true; }); };
const ordered = (jobs: NormalisedJob[]) => [...jobs].sort((a, b) => quality(b) - quality(a) || (b.description?.length ?? 0) - (a.description?.length ?? 0) || a.canonicalJobId.localeCompare(b.canonicalJobId));
const first = <T>(jobs: NormalisedJob[], pick: (job: NormalisedJob) => T | undefined) => ordered(jobs).map(pick).find((value) => value !== undefined);

/**
 * Groups jobs via union-find over three exact-match keys instead of comparing
 * every job against every existing group. `areCanonicalDuplicates` already
 * requires an exact title+company+location match (or a shared canonicalUrl,
 * or a shared source reference) before any fuzzy check runs, so bucketing on
 * those keys first reproduces identical groupings — it only skips comparisons
 * that were always going to return false. At ATS-catalog scale (thousands of
 * jobs) the naive O(n^2) scan made every search take minutes; this keeps the
 * expensive pairwise checks confined to naturally small buckets.
 */
function groupCanonicalJobs(jobs: NormalisedJob[]): NormalisedJob[][] {
  const parent = jobs.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) { parent[index] = parent[parent[index]]; index = parent[index]; }
    return index;
  };
  const union = (a: number, b: number) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const bucket = <K>(key: (job: NormalisedJob) => K) => {
    const map = new Map<K, number[]>();
    jobs.forEach((job, index) => { const k = key(job); const list = map.get(k); if (list) list.push(index); else map.set(k, [index]); });
    return map;
  };
  const byKey = bucket((job) => `${normaliseTitle(job.title)}|${job.companyNormalised ?? normaliseCompanyName(job.company)}|${normaliseLocationKey(job.locationText)}`);
  for (const indices of byKey.values()) for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) if (areCanonicalDuplicates(jobs[indices[i]], jobs[indices[j]])) union(indices[i], indices[j]);
  const byUrl = bucket((job) => job.canonicalUrl || '');
  for (const [url, indices] of byUrl) if (url) for (let i = 1; i < indices.length; i++) union(indices[0], indices[i]);
  const byRef = bucket((job) => `${job.source}:${job.sourceJobId}`);
  for (const indices of byRef.values()) for (let i = 0; i < indices.length; i++) for (let j = i + 1; j < indices.length; j++) if (sameReference(jobs[indices[i]], jobs[indices[j]])) union(indices[i], indices[j]);
  const groupsByRoot = new Map<number, NormalisedJob[]>();
  jobs.forEach((job, index) => { const root = find(index); const list = groupsByRoot.get(root); if (list) list.push(job); else groupsByRoot.set(root, [job]); });
  return [...groupsByRoot.values()];
}

/** Deterministic field selection: direct descriptions/URLs, populated salary, then trusted aggregator data. */
export function mergeCanonicalJobs(jobs: NormalisedJob[]): NormalisedJob[] {
  return groupCanonicalJobs(jobs).map((group) => { const primary = ordered(group)[0]; const salary = [...group].sort((a, b) => Number(Boolean(b.salaryMin ?? b.salaryMax)) - Number(Boolean(a.salaryMin ?? a.salaryMax)) || quality(b) - quality(a))[0]; const application = first(group, (job) => job.providerReferences.find((ref) => DISCOVERY_ATS_PROVIDERS.includes(ref.provider as DiscoveryAtsProvider))?.applicationUrl); return { ...primary, canonicalUrl: application ?? primary.canonicalUrl, providerReferences: references(group.flatMap((job) => job.providerReferences)), description: first(group, (job) => job.description), descriptionAvailability: first(group, (job) => job.description ? job.descriptionAvailability : undefined) ?? primary.descriptionAvailability, locationText: first(group, (job) => job.locationText) ?? primary.locationText, city: first(group, (job) => job.city), region: first(group, (job) => job.region), country: first(group, (job) => job.country), salaryMin: salary.salaryMin, salaryMax: salary.salaryMax, salaryPeriod: salary.salaryPeriod, currency: salary.currency, salaryText: salary.salaryText, postedAt: first(group, (job) => job.postedAt), sponsorSignal: first(group, (job) => job.sponsorSignal.jobWording !== 'NOT_MENTIONED' ? job.sponsorSignal : undefined) ?? primary.sponsorSignal }; });
}
