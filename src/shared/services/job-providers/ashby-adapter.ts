import { normaliseProviderJob } from '../job-normalisation.ts';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities.ts';
import { htmlToReadableText } from '../job-description-html.ts';
import { buildBoardApiUrl, buildPublicBoardUrl } from '../employer-source-validation.ts';
import { verifyEmployerSourceRequest } from '../employer-source-verification.ts';
import { addUrlRejection, validateHostedJobUrl, validateOptionalApplicationUrl } from '../employer-job-url-validation.ts';
import type { NormalisedJob, ProviderJob } from '../../types/job.ts';
import type { EmployerJobSourceRef, EmployerSourceVerificationResult } from '../../types/employer-source.ts';

export type PersistedAshbySource = EmployerJobSourceRef & { id: string; companyRecordId: string; enabled: boolean; verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED'; companyRecord: { id: string; displayName: string; websiteUrl?: string | null; careersUrl?: string | null } };
export type AshbyFetchResult = { jobs: NormalisedJob[]; rawReceived: number; invalidUrls: number; invalidHostedUrls: number; invalidApplicationUrls: number; invalidJobRecords: number; urlRejections: Record<string, number>; duplicateProviderJobIds: number; fetchTimestamp: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type CompensationComponent = { compensationType?: string; interval?: string; currencyCode?: string | null; minValue?: number | null; maxValue?: number | null };
type AshbyJob = { id?: string; jobPostingId?: string; title?: string; location?: string; secondaryLocations?: Array<{ location?: string }>; department?: string; team?: string; isListed?: boolean; isRemote?: boolean; workplaceType?: string; descriptionHtml?: string; descriptionPlain?: string; publishedAt?: string; updatedAt?: string; employmentType?: string; jobUrl?: string; applyUrl?: string; compensation?: { compensationTierSummary?: string; scrapeableCompensationSalarySummary?: string; summaryComponents?: CompensationComponent[] } };
const ASHBY_JOB_HOSTS = ['jobs.ashbyhq.com'] as const;
const clean = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const numeric = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

function providerJobId(job: AshbyJob): string | undefined {
  const id = clean(job.id) ?? clean(job.jobPostingId);
  if (id) return id;
  try { return clean(job.jobUrl) ? new URL(job.jobUrl!).pathname.split('/').filter(Boolean).at(-1) : undefined; } catch { return undefined; }
}
function normalisedWorkplace(value: string | undefined): 'ONSITE' | 'HYBRID' | 'REMOTE' | undefined {
  const key = value?.replace(/[ _-]/g, '').toLowerCase();
  return key === 'onsite' ? 'ONSITE' : key === 'hybrid' ? 'HYBRID' : key === 'remote' ? 'REMOTE' : undefined;
}
function salary(value: AshbyJob['compensation']) {
  // The canonical contract currently supports GBP. Never relabel another currency or derive values from prose.
  const component = value?.summaryComponents?.find((item) => item.compensationType?.toLowerCase() === 'salary' && item.currencyCode === 'GBP');
  const interval = component?.interval?.replace(/\s+/g, '').toUpperCase();
  const salaryPeriod = interval === '1YEAR' || interval === 'YEAR' ? 'YEAR' as const : interval === '1HOUR' || interval === 'HOUR' ? 'HOUR' as const : interval === '1DAY' || interval === 'DAY' ? 'DAY' as const : interval === '1WEEK' || interval === 'WEEK' ? 'WEEK' as const : interval === '1MONTH' || interval === 'MONTH' ? 'MONTH' as const : undefined;
  return { salary: clean(value?.scrapeableCompensationSalarySummary) ?? clean(value?.compensationTierSummary) ?? null, salaryMin: numeric(component?.minValue) ?? null, salaryMax: numeric(component?.maxValue) ?? null, salaryPeriod };
}
function assertQueryAllowed(source: PersistedAshbySource): void {
  if (source.provider !== 'ASHBY') throw new Error('The Ashby adapter only accepts Ashby sources.');
  if (source.verificationStatus !== 'VERIFIED' || source.enabled !== true) throw new Error('Only persisted, verified and enabled employer sources may be fetched.');
  if (!source.id || !source.companyRecordId || !source.companyRecord?.displayName) throw new Error('A persisted employer source and company identity are required.');
}

export function createAshbyAdapter(dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
  const request = dependencies.fetch ?? fetch;
  return {
    provider: 'ASHBY' as const, label: 'Ashby', capabilities: JOB_PROVIDER_CAPABILITIES.ASHBY, isConfigured: () => true,
    boardUrl: (source: EmployerJobSourceRef) => buildPublicBoardUrl(source),
    verifySource: (source: EmployerJobSourceRef & { companyRecordId: string }) => verifyEmployerSourceRequest({ companyRecordId: source.companyRecordId, provider: 'ASHBY', providerIdentifier: source.providerIdentifier }),
    async fetchBoard(source: PersistedAshbySource, options: { signal?: AbortSignal } = {}): Promise<AshbyFetchResult> {
      assertQueryAllowed(source);
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000); const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await request(buildBoardApiUrl(source), { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json', 'user-agent': 'Align Ashby employer refresh' } });
        if (!response.ok) throw new Error(response.status === 404 ? 'ASHBY_BOARD_NOT_FOUND' : response.status === 401 || response.status === 403 ? 'ASHBY_AUTH_REQUIRED' : `ASHBY_HTTP_${response.status}`);
        let payload: unknown; try { payload = await response.json(); } catch { throw new Error('ASHBY_MALFORMED_RESPONSE'); }
        if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { jobs?: unknown }).jobs)) throw new Error('ASHBY_MALFORMED_RESPONSE');
        const raw = (payload as { jobs: AshbyJob[] }).jobs; const seen = new Set<string>(); let invalidHostedUrls = 0; let invalidApplicationUrls = 0; let invalidJobRecords = 0; let duplicateProviderJobIds = 0; const urlRejections: Record<string, number> = {};
        const jobs = raw.flatMap((job): NormalisedJob[] => {
          if (job.isListed === false) return [];
          const id = providerJobId(job); const title = clean(job.title);
          if (!id || !title) { invalidJobRecords += 1; return []; }
          const hosted = validateHostedJobUrl(job.jobUrl, ASHBY_JOB_HOSTS, source.providerIdentifier);
          if (!hosted.valid) { invalidHostedUrls += 1; addUrlRejection(urlRejections, hosted.reason); return []; }
          const application = validateOptionalApplicationUrl(job.applyUrl, { providerHosts: ASHBY_JOB_HOSTS, identifier: source.providerIdentifier, employerEvidence: [source.companyRecord.websiteUrl, source.companyRecord.careersUrl] });
          if (!application.valid) { invalidApplicationUrls += 1; addUrlRejection(urlRejections, application.reason); }
          if (seen.has(id)) { duplicateProviderJobIds += 1; return []; } seen.add(id);
          const pay = salary(job.compensation); const workStyle = normalisedWorkplace(job.workplaceType); const description = clean(job.descriptionHtml) ? htmlToReadableText(job.descriptionHtml) : (clean(job.descriptionPlain) ?? ''); const secondary = (job.secondaryLocations ?? []).flatMap((item) => clean(item.location) ? [item.location!.trim()] : []);
          const rawJob: ProviderJob = { id: `ashby-${id}`, source: 'ashby', title, company: source.companyRecord.displayName, location: clean(job.location) ?? '', salary: pay.salary, salaryMin: pay.salaryMin, salaryMax: pay.salaryMax, description, url: application.valid && application.url ? application.url : hosted.url, hostedUrl: hosted.url, ...(application.valid && application.url ? { applicationUrl: application.url } : {}), postedDate: clean(job.publishedAt) ?? clean(job.updatedAt) ?? '', contractType: clean(job.employmentType) ?? null, isRemote: workStyle === 'REMOTE' || job.isRemote === true, hasSponsorship: false, employerSourceId: source.id, companyRecordId: source.companyRecordId, departments: [clean(job.department), clean(job.team)].filter((item): item is string => Boolean(item)), offices: secondary };
          const normalised = normaliseProviderJob(rawJob); return [{ ...normalised, ...(pay.salaryPeriod ? { salaryPeriod: pay.salaryPeriod } : {}), ...(workStyle ? { remoteType: workStyle } : {}) }];
        });
        return { jobs, rawReceived: raw.length, invalidUrls: invalidHostedUrls + invalidApplicationUrls, invalidHostedUrls, invalidApplicationUrls, invalidJobRecords, urlRejections, duplicateProviderJobIds, fetchTimestamp: new Date().toISOString() };
      } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new Error('ASHBY_TIMEOUT'); if (error instanceof Error && error.name === 'AbortError') throw new Error('ASHBY_TIMEOUT'); throw error; }
      finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
    },
  };
}
export const ashbyAdapter = createAshbyAdapter();
export type AshbyAdapter = ReturnType<typeof createAshbyAdapter>;
export type { EmployerSourceVerificationResult };
