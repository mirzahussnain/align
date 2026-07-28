import { normaliseProviderJob } from '../job-normalisation.ts';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities.ts';
import { htmlToReadableText } from '../job-description-html.ts';
import { buildBoardApiUrl, buildPublicBoardUrl } from '../employer-source-validation.ts';
import { verifyEmployerSourceRequest } from '../employer-source-verification.ts';
import type { NormalisedJob, ProviderJob } from '../../types/job.ts';
import type { EmployerJobSourceRef, EmployerSourceVerificationResult } from '../../types/employer-source.ts';

export type PersistedGreenhouseSource = EmployerJobSourceRef & {
  id: string; companyRecordId: string; enabled: boolean; verificationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';
  companyRecord: { id: string; displayName: string };
};
export type GreenhouseFetchResult = { jobs: NormalisedJob[]; rawReceived: number; invalidUrls: number; duplicateProviderJobIds: number; fetchTimestamp: string };
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type GreenhouseJob = { id?: string | number; title?: string; updated_at?: string; absolute_url?: string; location?: { name?: string }; content?: string; departments?: Array<{ name?: string }>; offices?: Array<{ name?: string }> };

function isGreenhouseJobUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'boards.greenhouse.io' || url.hostname === 'job-boards.greenhouse.io'); } catch { return false; }
}
function names(items: GreenhouseJob['departments']): string[] | undefined { const value = (items ?? []).flatMap((item) => typeof item.name === 'string' && item.name.trim() ? [item.name.trim()] : []); return value.length ? value : undefined; }
function assertQueryAllowed(source: PersistedGreenhouseSource): void {
  if (source.provider !== 'GREENHOUSE') throw new Error('The Greenhouse adapter only accepts Greenhouse sources.');
  if (source.verificationStatus !== 'VERIFIED' || source.enabled !== true) throw new Error('Only persisted, verified and enabled employer sources may be fetched.');
  if (!source.id || !source.companyRecordId || !source.companyRecord?.displayName) throw new Error('A persisted employer source and company identity are required.');
}

export function createGreenhouseAdapter(dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
  const request = dependencies.fetch ?? fetch;
  return {
    provider: 'GREENHOUSE' as const,
    label: 'Greenhouse',
    capabilities: JOB_PROVIDER_CAPABILITIES.GREENHOUSE,
    isConfigured: () => true,
    boardUrl: (source: EmployerJobSourceRef) => buildPublicBoardUrl(source),
    verifySource: (source: EmployerJobSourceRef & { companyRecordId: string }) => verifyEmployerSourceRequest({ companyRecordId: source.companyRecordId, provider: 'GREENHOUSE', providerIdentifier: source.providerIdentifier }),
    async fetchBoard(source: PersistedGreenhouseSource, options: { signal?: AbortSignal } = {}): Promise<GreenhouseFetchResult> {
      assertQueryAllowed(source);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000);
      const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true });
      try {
        const response = await request(buildBoardApiUrl(source), { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { accept: 'application/json', 'user-agent': 'Align Greenhouse employer refresh' } });
        if (!response.ok) throw new Error(response.status === 404 ? 'GREENHOUSE_BOARD_NOT_FOUND' : response.status === 401 || response.status === 403 ? 'GREENHOUSE_AUTH_REQUIRED' : `GREENHOUSE_HTTP_${response.status}`);
        let payload: unknown; try { payload = await response.json(); } catch { throw new Error('GREENHOUSE_MALFORMED_RESPONSE'); }
        if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { jobs?: unknown }).jobs)) throw new Error('GREENHOUSE_MALFORMED_RESPONSE');
        const raw = (payload as { jobs: GreenhouseJob[] }).jobs;
        const seen = new Set<string>(); let invalidUrls = 0; let duplicateProviderJobIds = 0;
        const jobs = raw.flatMap((job): NormalisedJob[] => {
          const id = job.id === undefined || job.id === null ? '' : String(job.id);
          if (!id || !job.title?.trim() || !isGreenhouseJobUrl(job.absolute_url)) { invalidUrls += 1; return []; }
          if (seen.has(id)) { duplicateProviderJobIds += 1; return []; } seen.add(id);
          const providerJob: ProviderJob = { id: `greenhouse-${id}`, source: 'greenhouse', title: job.title, company: source.companyRecord.displayName, location: job.location?.name?.trim() || '', salary: null, salaryMin: null, salaryMax: null, description: htmlToReadableText(job.content), url: job.absolute_url, postedDate: job.updated_at ?? '', contractType: null, isRemote: /remote/i.test(job.location?.name ?? ''), hasSponsorship: false, employerSourceId: source.id, companyRecordId: source.companyRecordId, departments: names(job.departments), offices: names(job.offices) };
          return [normaliseProviderJob(providerJob)];
        });
        return { jobs, rawReceived: raw.length, invalidUrls, duplicateProviderJobIds, fetchTimestamp: new Date().toISOString() };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new Error('GREENHOUSE_TIMEOUT');
        if (error instanceof Error && error.name === 'AbortError') throw new Error('GREENHOUSE_TIMEOUT');
        throw error;
      } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
    },
  };
}

export const greenhouseAdapter = createGreenhouseAdapter();
export type GreenhouseAdapter = ReturnType<typeof createGreenhouseAdapter>;
export type { EmployerSourceVerificationResult };