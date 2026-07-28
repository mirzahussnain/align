import { normaliseProviderJob } from '../job-normalisation.ts';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities.ts';
import { htmlToReadableText } from '../job-description-html.ts';
import { buildBoardApiUrl, buildPublicBoardUrl } from '../employer-source-validation.ts';
import { verifyEmployerSourceRequest } from '../employer-source-verification.ts';
import { addUrlRejection, validateHostedJobUrl, validateOptionalApplicationUrl } from '../employer-job-url-validation.ts';
import type { NormalisedJob, ProviderJob } from '../../types/job.ts';
import type { EmployerJobSourceRef, EmployerSourceVerificationResult } from '../../types/employer-source.ts';

export type PersistedLeverSource = EmployerJobSourceRef & {
  id: string; companyRecordId: string; enabled: boolean; verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';
  companyRecord: { id: string; displayName: string; websiteUrl?: string | null; careersUrl?: string | null };
};
export type LeverFetchResult = {
  jobs: NormalisedJob[]; rawReceived: number; invalidUrls: number; invalidHostedUrls: number; invalidApplicationUrls: number;
  invalidJobRecords: number; urlRejections: Record<string, number>; duplicateProviderJobIds: number; fetchTimestamp: string;
};
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type LeverJob = {
  id?: string; text?: string; hostedUrl?: string; applyUrl?: string; description?: string; descriptionPlain?: string;
  createdAt?: number; updatedAt?: number; workplaceType?: string;
  categories?: { location?: string; team?: string; department?: string; commitment?: string };
};
const hostsFor = (region: 'GLOBAL' | 'EU' | undefined) => region === 'EU' ? ['jobs.eu.lever.co'] : ['jobs.lever.co'];
const dateValue = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : '';
const category = (value: string | undefined) => value?.trim() || undefined;

function assertQueryAllowed(source: PersistedLeverSource): void {
  if (source.provider !== 'LEVER') throw new Error('The Lever adapter only accepts Lever sources.');
  if (source.verificationStatus !== 'VERIFIED' || source.enabled !== true) throw new Error('Only persisted, verified and enabled employer sources may be fetched.');
  if (!source.id || !source.companyRecordId || !source.companyRecord?.displayName) throw new Error('A persisted employer source and company identity are required.');
}

export function createLeverAdapter(dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
  const request = dependencies.fetch ?? fetch;
  return {
    provider: 'LEVER' as const,
    label: 'Lever',
    capabilities: JOB_PROVIDER_CAPABILITIES.LEVER,
    isConfigured: () => true,
    boardUrl: (source: EmployerJobSourceRef) => buildPublicBoardUrl(source),
    verifySource: (source: EmployerJobSourceRef & { companyRecordId: string }) => verifyEmployerSourceRequest({ companyRecordId: source.companyRecordId, provider: 'LEVER', providerIdentifier: source.providerIdentifier, providerRegion: source.leverRegion }),
    async fetchBoard(source: PersistedLeverSource, options: { signal?: AbortSignal } = {}): Promise<LeverFetchResult> {
      assertQueryAllowed(source);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000);
      const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await request(buildBoardApiUrl(source), { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json', 'user-agent': 'Align Lever employer refresh' } });
        if (!response.ok) throw new Error(response.status === 404 ? 'LEVER_BOARD_NOT_FOUND' : response.status === 401 || response.status === 403 ? 'LEVER_AUTH_REQUIRED' : `LEVER_HTTP_${response.status}`);
        let payload: unknown; try { payload = await response.json(); } catch { throw new Error('LEVER_MALFORMED_RESPONSE'); }
        if (!Array.isArray(payload)) throw new Error('LEVER_MALFORMED_RESPONSE');
        const raw = payload as LeverJob[]; const hosts = hostsFor(source.leverRegion);
        const seen = new Set<string>(); let invalidHostedUrls = 0; let invalidApplicationUrls = 0; let invalidJobRecords = 0; let duplicateProviderJobIds = 0;
        const urlRejections: Record<string, number> = {};
        const jobs = raw.flatMap((job): NormalisedJob[] => {
          const id = job.id?.trim() ?? ''; const title = job.text?.trim() ?? '';
          if (!id || !title) { invalidJobRecords += 1; return []; }
          const hosted = validateHostedJobUrl(job.hostedUrl, hosts, source.providerIdentifier);
          if (!hosted.valid) { invalidHostedUrls += 1; addUrlRejection(urlRejections, hosted.reason); return []; }
          const application = validateOptionalApplicationUrl(job.applyUrl, { providerHosts: hosts, identifier: source.providerIdentifier, employerEvidence: [source.companyRecord.websiteUrl, source.companyRecord.careersUrl] });
          if (!application.valid) { invalidApplicationUrls += 1; addUrlRejection(urlRejections, application.reason); }
          if (seen.has(id)) { duplicateProviderJobIds += 1; return []; } seen.add(id);
          const place = [category(job.workplaceType), category(job.categories?.location)].filter(Boolean).join(' - ');
          const providerJob: ProviderJob = {
            id: `lever-${id}`, source: 'lever', title, company: source.companyRecord.displayName, location: place,
            salary: null, salaryMin: null, salaryMax: null, description: job.descriptionPlain?.trim() || htmlToReadableText(job.description),
            url: application.valid && application.url ? application.url : hosted.url, hostedUrl: hosted.url,
            ...(application.valid && application.url ? { applicationUrl: application.url } : {}),
            postedDate: dateValue(job.updatedAt ?? job.createdAt), contractType: category(job.categories?.commitment) ?? null,
            isRemote: job.workplaceType?.toLowerCase() === 'remote', hasSponsorship: false, employerSourceId: source.id, companyRecordId: source.companyRecordId,
            departments: [category(job.categories?.department), category(job.categories?.team)].filter((value): value is string => Boolean(value)),
          };
          return [normaliseProviderJob(providerJob)];
        });
        return { jobs, rawReceived: raw.length, invalidUrls: invalidHostedUrls + invalidApplicationUrls, invalidHostedUrls, invalidApplicationUrls, invalidJobRecords, urlRejections, duplicateProviderJobIds, fetchTimestamp: new Date().toISOString() };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('LEVER_TIMEOUT');
        if (error instanceof Error && error.name === 'AbortError') throw new Error('LEVER_TIMEOUT');
        throw error;
      } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
    },
  };
}

export const leverAdapter = createLeverAdapter();
export type LeverAdapter = ReturnType<typeof createLeverAdapter>;
export type { EmployerSourceVerificationResult };