import { createHash } from 'node:crypto';
import { API_CONFIG } from '@/shared/lib/config';
import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchReedJobs } from '@/shared/services/reed';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { normaliseProviderJob } from '@/shared/services/job-normalisation';
import type { JobProvider, JobSearchParams, NormalisedJob, ProviderSearchResult } from '@/shared/types/job';

const TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
type Adapter = (params: JobSearchParams) => ReturnType<typeof searchAdzunaJobs>;
type Cached = { expiresAt: number; result: ProviderSearchResult };
const providerCache = new Map<string, Cached>();
const providers: Record<JobProvider, { configured: () => boolean; search: Adapter }> = {
  ADZUNA: { configured: () => Boolean(API_CONFIG.adzuna.appId && API_CONFIG.adzuna.appKey), search: searchAdzunaJobs },
  REED: { configured: () => Boolean(API_CONFIG.reed.apiKey), search: searchReedJobs },
  JOOBLE: { configured: () => Boolean(API_CONFIG.jooble.apiKey), search: searchJoobleJobs },
};
const cacheKey = (provider: JobProvider, params: JobSearchParams) => `${provider}:${createHash('sha256').update(JSON.stringify(params)).digest('hex')}`;
function timeout<T>(promise: Promise<T>): Promise<T> { return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]); }
function clone(result: ProviderSearchResult, cacheHit = false): ProviderSearchResult { return { ...result, jobs: result.jobs.map((job) => ({ ...job, providerReferences: [...job.providerReferences] })), cacheHit }; }

export async function searchProvider(provider: JobProvider, params: JobSearchParams): Promise<ProviderSearchResult> {
  const started = Date.now(); const definition = providers[provider];
  if (!definition.configured()) return { provider, status: 'NOT_CONFIGURED', jobs: [], rawReceived: 0, validNormalised: 0, durationMs: 0 };
  const key = cacheKey(provider, params); const cached = providerCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { ...clone(cached.result, true), durationMs: Date.now() - started };
  try {
    const response = await timeout(definition.search(params));
    const jobs = response.jobs.map(normaliseProviderJob).filter((job) => Boolean(job.title && job.company && job.canonicalUrl));
    const result: ProviderSearchResult = { provider, status: jobs.length ? 'SUCCESS' : 'EMPTY', jobs, rawReceived: response.jobs.length, validNormalised: jobs.length, nextCursor: jobs.length === params.perPage ? String(params.page + 1) : undefined, durationMs: Date.now() - started };
    providerCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
    return clone(result);
  } catch (error) {
    const timedOut = error instanceof Error && error.message === 'timeout';
    return { provider, status: timedOut ? 'TIMED_OUT' : 'FAILED', jobs: [], rawReceived: 0, validNormalised: 0, errorCode: timedOut ? 'TIMEOUT' : 'UNAVAILABLE', durationMs: Date.now() - started };
  }
}
export async function searchProviders(params: JobSearchParams, selected: JobProvider[]) { return Promise.all(selected.map((provider) => searchProvider(provider, params))); }
const similarity = (a: string, b: string) => a === b ? 1 : !a || !b ? 0 : (a.split(' ').filter((word) => b.split(' ').includes(word)).length / Math.max(a.split(' ').length, b.split(' ').length));
export function areDuplicates(a: NormalisedJob, b: NormalisedJob) {
  if (a.canonicalUrl === b.canonicalUrl) return true;
  const title = similarity(a.title.toLowerCase(), b.title.toLowerCase()); const company = similarity(a.companyNormalised ?? '', b.companyNormalised ?? ''); const location = similarity(a.locationText.toLowerCase(), b.locationText.toLowerCase());
  const postedDistance = a.postedAt && b.postedAt ? Math.abs(Date.parse(a.postedAt) - Date.parse(b.postedAt)) / 86_400_000 : undefined;
  return title >= .8 && company >= .8 && location >= .6 && (postedDistance === undefined || postedDistance <= 14);
}
function richer(a: NormalisedJob, b: NormalisedJob) { return (a.description?.length ?? 0) >= (b.description?.length ?? 0) ? a : b; }
export function deduplicateJobs(jobs: NormalisedJob[]) {
  const merged: NormalisedJob[] = [];
  for (const job of jobs) {
    const index = merged.findIndex((existing) => areDuplicates(existing, job));
    if (index < 0) { merged.push(job); continue; }
    const existing = merged[index]; const primary = richer(existing, job); const secondary = primary === existing ? job : existing;
    merged[index] = { ...primary, providerReferences: [...primary.providerReferences, ...secondary.providerReferences], salaryMin: primary.salaryMin ?? secondary.salaryMin, salaryMax: primary.salaryMax ?? secondary.salaryMax, sponsorSignal: primary.sponsorSignal.jobWording !== 'NOT_MENTIONED' ? primary.sponsorSignal : secondary.sponsorSignal };
  }
  const ids = new Set<string>();
  return merged.map((job) => {
    let canonicalJobId = job.canonicalJobId; let suffix = 2;
    while (ids.has(canonicalJobId)) canonicalJobId = `${job.canonicalJobId}-${suffix++}`;
    ids.add(canonicalJobId); return { ...job, canonicalJobId };
  });
}