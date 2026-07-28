/* eslint-disable @typescript-eslint/no-explicit-any -- This boundary accepts several Prisma relation payloads and emits typed public views. */
import { createHash } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';
import { ATS_FRESHNESS, DISCOVERY_ATS_PROVIDERS } from '@/shared/services/job-discovery';

export const SPONSOR_REGISTER_DISCLAIMER = 'Sponsor-register evidence indicates that an organisation name may appear on the UK register. It does not confirm sponsorship for a particular vacancy or candidate.';
const ATS = new Set<string>(DISCOVERY_ATS_PROVIDERS);
const toJson = <T>(value: unknown): T | undefined => value && typeof value === 'object' ? value as T : undefined;
const iso = (value: Date | null | undefined) => value?.toISOString();
const number = (value: { toNumber(): number } | number | null | undefined) => value == null ? undefined : typeof value === 'number' ? value : value.toNumber();
export const safeUrl = (value: string | null | undefined) => { if (!value) return undefined; try { const parsed = new URL(value); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.toString() : undefined; } catch { return undefined; } };
export const snapshotFreshness = (snapshot: { lastSeenAt: Date }, now = new Date()) => now.getTime() - snapshot.lastSeenAt.getTime() <= ATS_FRESHNESS.freshMs ? 'FRESH' as const : 'STALE' as const;
export const isUsableSnapshot = (snapshot: { lastSeenAt: Date; status: string; employerSource?: { enabled: boolean; verificationStatus: string; provider: string } | null }, now = new Date()) => snapshot.status === 'ACTIVE' && !!snapshot.employerSource && ATS.has(snapshot.employerSource.provider) && snapshot.employerSource.enabled && snapshot.employerSource.verificationStatus === 'VERIFIED' && now.getTime() - snapshot.lastSeenAt.getTime() <= ATS_FRESHNESS.usableStaleMs;

export type SponsorEvidenceSummary = { status: 'MATCHED' | 'AMBIGUOUS' | 'NONE' | 'NOT_CHECKED' };
export function sponsorSummary(status: string | null | undefined): SponsorEvidenceSummary {
  if (status === 'EXACT') return { status: 'MATCHED' };
  if (status === 'LIKELY' || status === 'AMBIGUOUS') return { status: 'AMBIGUOUS' };
  if (status === 'NONE') return { status: 'NONE' };
  return { status: 'NOT_CHECKED' };
}
function sourceHealth(source: any, now = new Date()) {
  if (!source.enabled || source.verificationStatus === 'DISABLED') return 'DISABLED';
  if (source.lastErrorAt && (!source.lastSuccessfulSyncAt || source.lastErrorAt > source.lastSuccessfulSyncAt)) return 'TEMPORARILY_UNAVAILABLE';
  if (!source.lastSuccessfulSyncAt || source.lastVerifiedJobCount === 0) return 'EMPTY';
  if (now.getTime() - source.lastSuccessfulSyncAt.getTime() > ATS_FRESHNESS.usableStaleMs) return 'STALE';
  return 'HEALTHY';
}
function preferredReference(snapshot: any) {
  const refs = snapshot.providerReferences ?? [];
  return refs.find((ref: any) => ATS.has(ref.provider) && safeUrl(ref.applicationUrl)) ?? refs.find((ref: any) => ATS.has(ref.provider)) ?? refs[0];
}
function description(snapshot: any) {
  const text = snapshot.userSuppliedDescription ?? snapshot.providerDescription ?? undefined;
  const source = snapshot.userSuppliedDescription ? 'USER_PASTED' : snapshot.providerDescription ? snapshot.descriptionAvailability === 'FULL' ? 'PROVIDER_FULL' : 'PROVIDER_PARTIAL' : 'NONE';
  const hash = text ? createHash('sha256').update(text).digest('hex') : undefined;
  return { text, source, hash, completeness: snapshot.userSuppliedDescription || snapshot.descriptionAvailability === 'FULL' ? 'FULL' : snapshot.descriptionAvailability ?? 'EXTERNAL_ONLY' };
}
function currentIntelligence(snapshot: any) {
  const selected = description(snapshot);
  if (!selected.hash || selected.hash !== snapshot.selectedDescriptionHash) return undefined;
  return { descriptionAssessment: toJson(snapshot.descriptionAssessment), practicalRequirements: toJson(snapshot.requirementEvidence), vacancySponsorship: toJson(snapshot.vacancySponsorshipSignal), assessedAt: iso(snapshot.intelligenceAssessedAt) };
}
export function jobCard(snapshot: any, saved = false) {
  const ref = preferredReference(snapshot);
  const provider = snapshot.employerSource?.provider ?? ref?.provider ?? 'UNKNOWN';
  const employerDirect = !!snapshot.employerSource || (snapshot.providerReferences ?? []).some((item: any) => ATS.has(item.provider));
  const salaryMin = number(snapshot.salaryMin); const salaryMax = number(snapshot.salaryMax);
  return {
    id: snapshot.id, title: snapshot.title,
    company: { ...(snapshot.companyRecordId ? { id: snapshot.companyRecordId } : {}), displayName: snapshot.companyRecord?.displayName ?? snapshot.employerName },
    ...(snapshot.locationText ? { location: snapshot.locationText } : {}), ...(snapshot.workStyle ? { workplaceType: snapshot.workStyle } : {}), ...(snapshot.employmentType ?? snapshot.contractType ? { employmentType: snapshot.employmentType ?? snapshot.contractType } : {}),
    ...(snapshot.salaryText || salaryMin != null || salaryMax != null ? { salary: { ...(snapshot.salaryText ? { text: snapshot.salaryText } : {}), ...(salaryMin != null ? { min: salaryMin } : {}), ...(salaryMax != null ? { max: salaryMax } : {}), ...(snapshot.salaryPeriod ? { period: snapshot.salaryPeriod } : {}), ...(snapshot.salaryCurrency ? { currency: snapshot.salaryCurrency } : {}) } } : {}),
    ...(iso(snapshot.postedAt) ? { postedAt: iso(snapshot.postedAt) } : {}), freshness: snapshotFreshness(snapshot),
    sourceSummary: { preferredProvider: provider, providerCount: (snapshot.providerReferences ?? []).length, employerDirect },
    sponsorEvidenceSummary: sponsorSummary(snapshot.companyRecord?.sponsorMatchStatus ?? toJson<any>(snapshot.employerSponsorEvidence)?.status), saved,
  };
}
export async function getJobDetailsView(jobSnapshotId: string, userId: string) {
  const snapshot = await prisma.jobSnapshot.findUnique({ where: { id: jobSnapshotId }, include: { providerReferences: true, companyRecord: true, employerSource: true, savedJobs: { where: { userId }, select: { id: true } } } });
  if (!snapshot) return null;
  const selected = description(snapshot); const intelligence = currentIntelligence(snapshot); const reference = preferredReference(snapshot);
  return {
    job: jobCard(snapshot, snapshot.savedJobs.length > 0), description: { ...(selected.text ? { text: selected.text } : {}), source: selected.source, hash: selected.hash, completeness: selected.completeness, intelligenceCurrent: Boolean(intelligence) },
    ...(intelligence ? intelligence : {}), sponsorEvidence: { summary: sponsorSummary(snapshot.companyRecord?.sponsorMatchStatus ?? toJson<any>(snapshot.employerSponsorEvidence)?.status), disclaimer: SPONSOR_REGISTER_DISCLAIMER, ...(snapshot.companyRecord?.sponsorOrganisationName ? { matchedOrganisationName: snapshot.companyRecord.sponsorOrganisationName } : {}) },
    sourceProvenance: snapshot.providerReferences.map((item) => ({ provider: item.provider, ...(safeUrl(item.providerUrl) ? { hostedUrl: safeUrl(item.providerUrl) } : {}), ...(safeUrl(item.applicationUrl) ? { applicationUrl: safeUrl(item.applicationUrl) } : {}) })),
    ...(safeUrl(reference?.applicationUrl) ? { applicationUrl: safeUrl(reference.applicationUrl) } : {}), ...(safeUrl(reference?.providerUrl) ? { hostedUrl: safeUrl(reference.providerUrl) } : {}),
    availability: isUsableSnapshot(snapshot) ? 'DISCOVERABLE' : 'HISTORICAL', matchPreparation: { eligible: !!selected.text, ...(selected.text ? {} : { reason: 'DESCRIPTION_INCOMPLETE' }) },
  };
}

export type PageInput = { cursor?: string; limit?: number };
const limitOf = (value: number | undefined) => Math.max(1, Math.min(value ?? 20, 50));
function decodeCursor(value?: string) { if (!value) return undefined; try { const parsed = JSON.parse(Buffer.from(value, 'base64url').toString()) as { name: string; id: string }; return typeof parsed.name === 'string' && typeof parsed.id === 'string' ? parsed : undefined; } catch { return null; } }
const encodeCursor = (value: { name: string; id: string }) => Buffer.from(JSON.stringify(value)).toString('base64url');

export type CompanyQuery = PageInput & { search?: string; provider?: string; industry?: string; sponsorStatus?: string; activeJobsOnly?: boolean; sort?: 'NAME' | 'ACTIVE_JOBS' | 'RECENTLY_REFRESHED' };
export async function listCompanies(query: CompanyQuery) {
  const now = new Date(); const cursor = decodeCursor(query.cursor); if (cursor === null) throw new Error('INVALID_CURSOR');
  const companies = await prisma.companyRecord.findMany({ include: { jobSources: true, jobSnapshots: { include: { employerSource: true } } } });
  const search = query.search?.trim().toLowerCase();
  const mapped = companies.map((company) => companyView(company, now)).filter((company) => (!search || company.displayName.toLowerCase().includes(search)) && (!query.provider || company.providers.includes(query.provider)) && (!query.industry || company.industry === query.industry) && (!query.sponsorStatus || company.sponsorEvidenceSummary.status === query.sponsorStatus) && (!query.activeJobsOnly || company.activeJobCount > 0));
  mapped.sort((a, b) => query.sort === 'ACTIVE_JOBS' ? b.activeJobCount - a.activeJobCount || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id) : query.sort === 'RECENTLY_REFRESHED' ? (b.lastRefreshedAt ?? '').localeCompare(a.lastRefreshedAt ?? '') || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id) : a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id));
  const start = cursor ? mapped.findIndex((item) => item.displayName === cursor.name && item.id === cursor.id) + 1 : 0; const items = mapped.slice(Math.max(0, start), Math.max(0, start) + limitOf(query.limit)); const last = items.at(-1);
  return { items, page: { hasMore: start + items.length < mapped.length, ...(last ? { nextCursor: encodeCursor({ name: last.displayName, id: last.id }) } : {}) } };
}
function companyView(company: any, now = new Date()) {
  const usable = company.jobSnapshots.filter((snapshot: any) => isUsableSnapshot(snapshot, now));
  const providers = [...new Set(company.jobSources.filter((source: any) => source.verificationStatus === 'VERIFIED').map((source: any) => source.provider))].sort();
  const refreshed = company.jobSources.map((source: any) => source.lastSuccessfulSyncAt as Date | null).filter(Boolean).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
  return { id: company.id, displayName: company.displayName, ...(company.industry ? { industry: company.industry } : {}), ...(safeUrl(company.websiteUrl) ? { websiteUrl: safeUrl(company.websiteUrl) } : {}), ...(safeUrl(company.careersUrl) ? { careersUrl: safeUrl(company.careersUrl) } : {}), sponsorEvidenceSummary: sponsorSummary(company.sponsorMatchStatus), verifiedSourceCount: company.jobSources.filter((source: any) => source.verificationStatus === 'VERIFIED').length, activeJobCount: usable.length, providers, ...(refreshed ? { lastRefreshedAt: iso(refreshed) } : {}) };
}
export async function getCompanyDetailsView(companyRecordId: string, userId?: string) {
  const company = await prisma.companyRecord.findUnique({ where: { id: companyRecordId }, include: { jobSources: true, jobSnapshots: { include: { employerSource: true, providerReferences: true, companyRecord: true, ...(userId ? { savedJobs: { where: { userId }, select: { id: true } } } : {}) } } } });
  if (!company) return null; const now = new Date(); const card = companyView(company, now); const active = company.jobSnapshots.filter((snapshot: any) => isUsableSnapshot(snapshot, now));
  return { company: card, sponsorEvidence: { summary: sponsorSummary(company.sponsorMatchStatus), disclaimer: SPONSOR_REGISTER_DISCLAIMER, ...(company.sponsorOrganisationName ? { matchedOrganisationName: company.sponsorOrganisationName } : {}) }, sources: company.jobSources.map((source: any) => ({ provider: source.provider, verificationStatus: source.verificationStatus, enabled: source.enabled, health: sourceHealth(source, now), ...(iso(source.lastVerifiedAt) ? { lastVerifiedAt: iso(source.lastVerifiedAt) } : {}), ...(iso(source.lastSuccessfulSyncAt) ? { lastSuccessfulRefreshAt: iso(source.lastSuccessfulSyncAt) } : {}), ...(source.lastErrorCode ? { lastErrorCategory: source.lastErrorCode } : {}) })), providerDistribution: Object.fromEntries(company.jobSources.map((source: any) => [source.provider, active.filter((snapshot: any) => snapshot.employerSourceId === source.id).length])), activeVacancies: active.map((snapshot: any) => jobCard(snapshot, (snapshot.savedJobs?.length ?? 0) > 0)) };
}
export async function listCompanyVacancies(companyRecordId: string, userId?: string, page: PageInput = {}) {
  const details = await getCompanyDetailsView(companyRecordId, userId); if (!details) return null; const cursor = decodeCursor(page.cursor); if (cursor === null) throw new Error('INVALID_CURSOR'); const rows = [...details.activeVacancies].sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') || a.id.localeCompare(b.id)); const index = cursor ? rows.findIndex((item) => item.id === cursor.id) + 1 : 0; const items = rows.slice(Math.max(0, index), Math.max(0, index) + limitOf(page.limit)); const last = items.at(-1); return { items, page: { hasMore: index + items.length < rows.length, ...(last ? { nextCursor: encodeCursor({ name: '', id: last.id }) } : {}) } };
}
export async function listSavedJobs(userId: string, page: PageInput = {}) {
  const limit = limitOf(page.limit); const cursor = page.cursor; let decoded: { savedAt: string; id: string } | undefined; if (cursor) try { decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new Error('INVALID_CURSOR'); }
  const rows = await prisma.savedJob.findMany({ where: { userId }, orderBy: [{ savedAt: 'desc' }, { id: 'desc' }], include: { jobSnapshot: { include: { providerReferences: true, companyRecord: true, employerSource: true } } } });
  const filtered = decoded ? rows.filter((row) => row.savedAt < new Date(decoded.savedAt) || row.savedAt.getTime() === new Date(decoded.savedAt).getTime() && row.id < decoded.id) : rows; const items = filtered.slice(0, limit).map((row) => ({ id: row.id, savedAt: iso(row.savedAt), availability: isUsableSnapshot(row.jobSnapshot) ? 'DISCOVERABLE' : 'HISTORICAL', job: jobCard(row.jobSnapshot, true) })); const last = items.at(-1); return { items, page: { hasMore: filtered.length > items.length, ...(last ? { nextCursor: Buffer.from(JSON.stringify({ savedAt: last.savedAt, id: last.id })).toString('base64url') } : {}) } };
}