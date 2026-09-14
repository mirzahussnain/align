import { normaliseProviderJob } from '../job-normalisation.ts';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities.ts';
import { htmlToReadableText } from '../job-description-html.ts';
import { buildBoardApiUrl, buildPublicBoardUrl } from '../employer-source-validation.ts';
import { verifyEmployerSourceRequest } from '../employer-source-verification.ts';
import { addUrlRejection, validateHostedJobUrl, validateOptionalApplicationUrl, type JobUrlRejectionReason } from '../employer-job-url-validation.ts';
import type { NormalisedJob, ProviderJob } from '../../types/job.ts';
import type { EmployerJobSourceRef, EmployerSourceVerificationResult } from '../../types/employer-source.ts';

export type PersistedGreenhouseSource = EmployerJobSourceRef & {
  id: string; companyRecordId: string; enabled: boolean; verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';
  companyRecord: { id: string; displayName: string; websiteUrl?: string | null; careersUrl?: string | null };
};
export type GreenhouseFetchResult = { jobs: NormalisedJob[]; rawReceived: number; invalidUrls: number; invalidJobRecords: number; invalidHostedUrls: number; invalidApplicationUrls: number; urlRejections: Record<string, number>; duplicateProviderJobIds: number; fetchTimestamp: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type GreenhouseJob = { id?: string | number; title?: string; updated_at?: string; absolute_url?: string; location?: { name?: string }; content?: string; departments?: Array<{ name?: string }>; offices?: Array<{ name?: string }> };
const GREENHOUSE_JOB_HOSTS = ['boards.greenhouse.io', 'job-boards.greenhouse.io'] as const;

function names(items: GreenhouseJob['departments']): string[] | undefined { const value = (items ?? []).flatMap((item) => typeof item.name === 'string' && item.name.trim() ? [item.name.trim()] : []); return value.length ? value : undefined; }
function verifiedHostedUrl(identifier: string, jobId: string): string { return `https://boards.greenhouse.io/${identifier}/jobs/${jobId}`; }
function assertQueryAllowed(source: PersistedGreenhouseSource): void {
  if (source.provider !== 'GREENHOUSE') throw new Error('The Greenhouse adapter only accepts Greenhouse sources.');
  if (source.verificationStatus !== 'VERIFIED' || source.enabled !== true) throw new Error('Only persisted, verified and enabled employer sources may be fetched.');
  if (!source.id || !source.companyRecordId || !source.companyRecord?.displayName) throw new Error('A persisted employer source and company identity are required.');
}

export function createGreenhouseAdapter(dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
  const request = dependencies.fetch ?? fetch;
  return {
    provider: 'GREENHOUSE' as const, label: 'Greenhouse', capabilities: JOB_PROVIDER_CAPABILITIES.GREENHOUSE, isConfigured: () => true,
    boardUrl: (source: EmployerJobSourceRef) => buildPublicBoardUrl(source),
    verifySource: (source: EmployerJobSourceRef & { companyRecordId: string }) => verifyEmployerSourceRequest({ companyRecordId: source.companyRecordId, provider: 'GREENHOUSE', providerIdentifier: source.providerIdentifier }),
    async fetchBoard(source: PersistedGreenhouseSource, options: { signal?: AbortSignal } = {}): Promise<GreenhouseFetchResult> {
      assertQueryAllowed(source); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000); const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await request(buildBoardApiUrl(source), { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json', 'user-agent': 'Align Greenhouse employer refresh' } });
        if (!response.ok) throw new Error(response.status === 404 ? 'GREENHOUSE_BOARD_NOT_FOUND' : response.status === 401 || response.status === 403 ? 'GREENHOUSE_AUTH_REQUIRED' : `GREENHOUSE_HTTP_${response.status}`);
        let payload: unknown; try { payload = await response.json(); } catch { throw new Error('GREENHOUSE_MALFORMED_RESPONSE'); }
        if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { jobs?: unknown }).jobs)) throw new Error('GREENHOUSE_MALFORMED_RESPONSE');
        const raw = (payload as { jobs: GreenhouseJob[] }).jobs; const seen = new Set<string>(); let invalidJobRecords = 0; let invalidApplicationUrls = 0; let duplicateProviderJobIds = 0; const urlRejections: Record<string, number> = {};
        const jobs = raw.flatMap((job): NormalisedJob[] => {
          const id = job.id === undefined || job.id === null ? '' : String(job.id); if (!id || !job.title?.trim()) { invalidJobRecords += 1; return []; }
          const verified = verifiedHostedUrl(source.providerIdentifier, id); const supplied = validateHostedJobUrl(job.absolute_url, GREENHOUSE_JOB_HOSTS, source.providerIdentifier);
          const hostedUrl = supplied.valid ? supplied.url : verified;
          const application = supplied.valid ? { valid: true as const, url: undefined } : validateOptionalApplicationUrl(job.absolute_url, { providerHosts: GREENHOUSE_JOB_HOSTS, identifier: source.providerIdentifier, employerEvidence: [source.companyRecord.websiteUrl, source.companyRecord.careersUrl] });
          if (!application.valid) { invalidApplicationUrls += 1; addUrlRejection(urlRejections, application.reason); }
          if (seen.has(id)) { duplicateProviderJobIds += 1; return []; } seen.add(id);
          const providerJob: ProviderJob = { id: `greenhouse-${id}`, source: 'greenhouse', title: job.title, company: source.companyRecord.displayName, location: job.location?.name?.trim() || '', salary: null, salaryMin: null, salaryMax: null, description: htmlToReadableText(job.content), url: application.valid && application.url ? application.url : hostedUrl, hostedUrl, ...(application.valid && application.url ? { applicationUrl: application.url } : {}), postedDate: job.updated_at ?? '', contractType: null, isRemote: /remote/i.test(job.location?.name ?? ''), hasSponsorship: false, employerSourceId: source.id, companyRecordId: source.companyRecordId, departments: names(job.departments), offices: names(job.offices) };
          return [normaliseProviderJob(providerJob)];
        });
        return { jobs, rawReceived: raw.length, invalidUrls: invalidApplicationUrls, invalidJobRecords, invalidHostedUrls: 0, invalidApplicationUrls, urlRejections, duplicateProviderJobIds, fetchTimestamp: new Date().toISOString() };
      } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') throw new Error('GREENHOUSE_TIMEOUT'); if (error instanceof Error && error.name === 'AbortError') throw new Error('GREENHOUSE_TIMEOUT'); throw error; }
      finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
    },
  };
}
export const greenhouseAdapter = createGreenhouseAdapter(); export type GreenhouseAdapter = ReturnType<typeof createGreenhouseAdapter>; export type { EmployerSourceVerificationResult, JobUrlRejectionReason };