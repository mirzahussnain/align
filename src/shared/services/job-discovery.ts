/** Provider-neutral discovery primitives. ATS data is read from snapshots, never boards. */
import { createHash } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';
import { blankSponsorSignal, extractEligibilityHints, normaliseCompanyName, normaliseLocation, normaliseLocationKey, normaliseTitle } from '@/shared/services/job-normalisation';
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
  contractType: string | null; employmentType: string | null; providerDescription: string | null; descriptionAvailability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY'; postedAt: Date | null; expiresAt: Date | null; lastSeenAt: Date; fetchedAt: Date; vacancySponsorshipSignal: unknown;
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

/** Read only verified/enabled ATS snapshots; database outage is a partial result, not a search failure. */
export async function getAtsSnapshotProviderResults(now = new Date()): Promise<AtsSnapshotProviderResult[]> {
  const started = Date.now();
  try {
    const rows = await prisma.jobSnapshot.findMany({ where: { status: 'ACTIVE', lastSeenAt: { gte: new Date(now.getTime() - ATS_FRESHNESS.usableStaleMs) }, employerSource: { is: { enabled: true, verificationStatus: 'VERIFIED', provider: { in: [...DISCOVERY_ATS_PROVIDERS] } } }, providerReferences: { some: { provider: { in: [...DISCOVERY_ATS_PROVIDERS] } } } }, include: { employerSource: { select: { provider: true } }, providerReferences: true } }) as unknown as SnapshotRow[];
    return DISCOVERY_ATS_PROVIDERS.map((provider) => { const sourceRows = rows.filter((row) => row.employerSource?.provider === provider); const jobs = sourceRows.flatMap((row) => snapshotToJob(row) ?? []); const stale = sourceRows.some((row) => now.getTime() - row.lastSeenAt.getTime() > ATS_FRESHNESS.freshMs); return { provider, status: jobs.length ? (stale ? 'STALE_CACHE' : 'SUCCESS') : 'EMPTY', jobs, rawReceived: sourceRows.length, validNormalised: jobs.length, durationMs: Date.now() - started }; });
  } catch { return DISCOVERY_ATS_PROVIDERS.map((provider) => ({ provider, status: 'UNAVAILABLE' as const, jobs: [], rawReceived: 0, validNormalised: 0, durationMs: Date.now() - started })); }
}
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

/** Deterministic field selection: direct descriptions/URLs, populated salary, then trusted aggregator data. */
export function mergeCanonicalJobs(jobs: NormalisedJob[]): NormalisedJob[] {
  const groups: NormalisedJob[][] = [];
  for (const job of jobs) { const group = groups.find((candidate) => candidate.some((item) => areCanonicalDuplicates(item, job))); if (group) group.push(job); else groups.push([job]); }
  return groups.map((group) => { const primary = ordered(group)[0]; const salary = [...group].sort((a, b) => Number(Boolean(b.salaryMin ?? b.salaryMax)) - Number(Boolean(a.salaryMin ?? a.salaryMax)) || quality(b) - quality(a))[0]; const application = first(group, (job) => job.providerReferences.find((ref) => DISCOVERY_ATS_PROVIDERS.includes(ref.provider as DiscoveryAtsProvider))?.applicationUrl); return { ...primary, canonicalUrl: application ?? primary.canonicalUrl, providerReferences: references(group.flatMap((job) => job.providerReferences)), description: first(group, (job) => job.description), descriptionAvailability: first(group, (job) => job.description ? job.descriptionAvailability : undefined) ?? primary.descriptionAvailability, locationText: first(group, (job) => job.locationText) ?? primary.locationText, city: first(group, (job) => job.city), region: first(group, (job) => job.region), country: first(group, (job) => job.country), salaryMin: salary.salaryMin, salaryMax: salary.salaryMax, salaryPeriod: salary.salaryPeriod, currency: salary.currency, salaryText: salary.salaryText, postedAt: first(group, (job) => job.postedAt), sponsorSignal: first(group, (job) => job.sponsorSignal.jobWording !== 'NOT_MENTIONED' ? job.sponsorSignal : undefined) ?? primary.sponsorSignal }; });
}
