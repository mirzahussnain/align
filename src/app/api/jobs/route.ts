import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { matchSponsorCompanies } from '@/shared/services/sponsor-registry';
import { deduplicateJobs, searchProviders } from '@/shared/services/job-search';
import type { JobSearchParams, NormalisedJob, ProviderCount, SearchJobProvider } from '@/shared/types/job';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { JobsQuerySchema } from './schema';
import { applyRateLimit, jobsLimiter } from '@/shared/lib/rate-limit';

import { auth } from '@/shared/lib/auth';
import { createJobReference } from '@/shared/services/job-reference';
const SESSION_TTL_MS = 15 * 60 * 1000;
type SearchSession = { queryHash: string; page: number; seenJobIds: Set<string>; expiresAt: number };
const sessions = new Map<string, SearchSession>();
const canonicalHash = (input: object) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
type CachedResponse = { expiresAt: number; jobs: NormalisedJob[]; providerCounts: ProviderCount[]; partialMessage?: string };
const responseCache = new Map<string, CachedResponse>();
// Only the market-wide search providers are fanned out per request. Employer-ATS
// providers answer per-board, never per-query, so they are orchestrated separately.
const selectedProviders = (source: string): SearchJobProvider[] => source === 'all' ? ['ADZUNA', 'REED', 'JOOBLE'] : [source.toUpperCase() as SearchJobProvider];
const elapsed = (from: number) => Date.now() - from;
function relevance(job: NormalisedJob, query: string) { const tokens = query.toLowerCase().split(/\s+/).filter(Boolean); return tokens.filter((token) => job.title.toLowerCase().includes(token)).length * 100 + (job.descriptionAvailability === 'FULL' ? 10 : 0); }
function applyFilters(jobs: NormalisedJob[], data: { sponsorship: string; experience: string; remoteType: string; postedWithinDays?: number }) {
  const after = data.postedWithinDays ? Date.now() - data.postedWithinDays * 86_400_000 : 0;
  return jobs.filter((job) => {
    if (data.sponsorship === 'registered' && job.sponsorSignal.registerMatchStatus === 'NONE') return false;
    if (data.sponsorship === 'offered' && !['EXPLICITLY_AVAILABLE', 'POSSIBLY_AVAILABLE'].includes(job.sponsorSignal.jobWording)) return false;
    if (data.sponsorship === 'required' && job.sponsorSignal.jobWording !== 'RIGHT_TO_WORK_REQUIRED') return false;
    if (data.sponsorship === 'exclude_no_sponsorship' && job.sponsorSignal.jobWording === 'EXPLICITLY_UNAVAILABLE') return false;
    if (data.remoteType !== 'all' && job.remoteType !== data.remoteType) return false;
    if (after && (!job.postedAt || Date.parse(job.postedAt) < after)) return false;
    const title = job.title.toLowerCase(); const junior = /\b(junior|graduate|associate|trainee|intern)\b/.test(title); const senior = /\b(senior|lead|principal|head|director|manager)\b/.test(title);
    return data.experience === 'all' || (data.experience === 'junior' && junior) || (data.experience === 'senior' && senior) || (data.experience === 'mid' && !junior && !senior);
  });
}
function sortJobs(jobs: NormalisedJob[], sortBy: string, query: string) {
  return jobs.sort((a, b) => {
    if (sortBy === 'date') return (Date.parse(b.postedAt ?? '') || 0) - (Date.parse(a.postedAt ?? '') || 0);
    if (sortBy === 'salary_desc' || sortBy === 'salary_asc') {
      // Only compare annual salaries; mixed periods and unknown salary remain consistently last.
      const amount = (job: NormalisedJob) => job.salaryPeriod === 'YEAR' ? job.salaryMax ?? job.salaryMin : undefined;
      const av = amount(a); const bv = amount(b); if (av === undefined && bv === undefined) return a.canonicalJobId.localeCompare(b.canonicalJobId); if (av === undefined) return 1; if (bv === undefined) return -1;
      return sortBy === 'salary_desc' ? bv - av : av - bv;
    }
    return relevance(b, query) - relevance(a, query) || a.canonicalJobId.localeCompare(b.canonicalJobId);
  });
}
export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const started = Date.now(); const rateStarted = Date.now(); const ip = request.headers.get('x-forwarded-for') ?? 'anonymous'; const rateLimitResponse = await applyRateLimit(jobsLimiter, ip); if (rateLimitResponse) return rateLimitResponse;
    const authenticated = await auth.api.getSession({ headers: request.headers });
    const parsed = JobsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries())); if (!parsed.success) throw new APIError(parsed.error.message, 400); const data = parsed.data;
    const params: JobSearchParams = { query: data.query, location: data.location, page: 1, perPage: data.perPage, contractType: data.contractType, salaryMin: data.salaryMin, sortBy: data.sortBy === 'date' ? 'date' : data.sortBy.startsWith('salary') ? 'salary' : 'relevance', sponsorship: 'all', experience: data.experience };
    const hash = canonicalHash({ ...params, source: data.source, sponsorship: data.sponsorship, remoteType: data.remoteType, postedWithinDays: data.postedWithinDays }); const now = Date.now(); for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id);
    const cached = responseCache.get(hash);
    if (cached && cached.expiresAt > now && !data.sessionId) {
      const cachedJobs = cached.jobs.map((job) => ({ ...job, providerReferences: [...job.providerReferences], jobReference: createJobReference(job, authenticated?.user.id ?? null) }));
      const cachedSessionId = randomUUID();
      sessions.set(cachedSessionId, { queryHash: hash, page: 1, seenJobIds: new Set(cachedJobs.map((job) => job.canonicalJobId)), expiresAt: now + SESSION_TTL_MS });
      return NextResponse.json({ jobs: cachedJobs, sessionId: cachedSessionId, meta: { currentPage: 1, providerCounts: cached.providerCounts, partialResults: Boolean(cached.partialMessage), message: cached.partialMessage, cached: true } });
    }
    let sessionId = data.sessionId; let session = sessionId ? sessions.get(sessionId) : undefined; if (session && session.queryHash !== hash) throw new APIError('Search session does not match these filters. Start a new search.', 400); if (!session) { sessionId = randomUUID(); session = { queryHash: hash, page: 0, seenJobIds: new Set(), expiresAt: now + SESSION_TTL_MS }; sessions.set(sessionId, session); } params.page = ++session.page;
    const providerStarted = Date.now(); const providerResults = await searchProviders(params, selectedProviders(data.source)); const providerMs = elapsed(providerStarted);
    const normaliseStarted = Date.now(); let jobs = deduplicateJobs(providerResults.flatMap((result) => result.jobs)); const normaliseMs = elapsed(normaliseStarted);
    const counts: ProviderCount[] = providerResults.map((result) => ({ provider: result.provider, status: result.status, rawReceived: result.rawReceived, validNormalised: result.validNormalised, uniqueContributed: jobs.filter((job) => job.providerReferences.some((reference) => reference.provider === result.provider)).length }));
    const sponsorStarted = Date.now(); try { const matches = await matchSponsorCompanies([...new Set(jobs.map((job) => job.company))]); jobs = jobs.map((job) => { const match = matches.get(job.company) ?? { status: 'NONE' as const }; return { ...job, sponsorSignal: { ...job.sponsorSignal, registerMatchStatus: match.status, matchedOrganisationName: match.organisationName, explanation: match.status === 'EXACT' ? 'This employer appears on the UK register of licensed sponsors. This does not confirm sponsorship for this vacancy.' : match.status === 'LIKELY' || match.status === 'AMBIGUOUS' ? 'A similar organisation name appears on the sponsor register. Verify the employer’s legal entity.' : job.sponsorSignal.explanation } }; }); } catch { /* source register is supplementary, never a search blocker */ } const sponsorMs = elapsed(sponsorStarted);
    const dedupeStarted = Date.now(); jobs = sortJobs(applyFilters(jobs, data), data.sortBy, params.query).filter((job) => !session.seenJobIds.has(job.canonicalJobId)).slice(0, data.perPage); jobs.forEach((job) => session.seenJobIds.add(job.canonicalJobId)); session.expiresAt = now + SESSION_TTL_MS; const dedupeMs = elapsed(dedupeStarted);
    jobs = jobs.map((job) => ({ ...job, jobReference: createJobReference(job, authenticated?.user.id ?? null) }));
    const unavailable = providerResults.filter((result) => result.status === 'FAILED' || result.status === 'TIMED_OUT');
    responseCache.set(hash, { expiresAt: now + 5 * 60_000, jobs: jobs.map(({ jobReference: _reference, ...job }) => job), providerCounts: counts, partialMessage: unavailable.length ? 'Some job sources are temporarily unavailable. Showing results from the available sources.' : undefined });
    return NextResponse.json({ jobs, sessionId, meta: { currentPage: session.page, providerCounts: counts, partialResults: unavailable.length > 0, message: unavailable.length ? 'Some job sources are temporarily unavailable. Showing results from the available sources.' : undefined, timings: { rateLimitMs: elapsed(rateStarted) - providerMs - normaliseMs - sponsorMs - dedupeMs, providerMs, normaliseMs, sponsorMs, dedupeMs, totalMs: elapsed(started) }, providerResults: providerResults.map(({ provider, status, durationMs, cacheHit }) => ({ provider, status, durationMs, cacheHit })) } });
  });
}