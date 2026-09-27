// Adzuna API Service

import type { ProviderJob, JobSearchParams, JobSearchResult } from '@/shared/types/job';
import { API_CONFIG } from '@/shared/lib/config';
import { providerResponseError } from '@/shared/services/job-providers/provider-errors';

interface AdzunaJob {
  id: string;
  title: string;
  company: { display_name: string };
  location: { display_name: string; area: string[] };
  salary_min: number;
  salary_max: number;
  description: string;
  redirect_url: string;
  created: string;
  contract_type?: string;
  contract_time?: string;
  category: { tag: string; label: string };
}

interface AdzunaResponse {
  results: AdzunaJob[];
  count: number;
  mean: number;
}

/**
 * `signal` lets the orchestrator stop waiting on a source it has abandoned, so a
 * request whose deadline has passed releases its socket instead of running to
 * completion unobserved. Optional, so every existing caller is unaffected.
 */
export async function searchAdzunaJobs(
  params: JobSearchParams,
  options: { signal?: AbortSignal } = {}
): Promise<JobSearchResult> {
  const { appId, appKey, baseUrl } = API_CONFIG.adzuna;

  if (!appId || !appKey) {
    throw new Error('Adzuna API credentials not configured');
  }

  const searchParams = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(params.perPage),
    'content-type': 'application/json',
  });

  if (params.query) {
    searchParams.set('what', params.query);
  }
  if (params.company) {
    searchParams.set('what_phrase', params.company);
  }

  if (params.location) {
    searchParams.set('where', params.location);
  }
  if (params.salaryMin) {
    searchParams.set('salary_min', String(params.salaryMin));
  }
  if (params.salaryMax) {
    searchParams.set('salary_max', String(params.salaryMax));
  }
  if (params.contractType === 'permanent' || params.contractType === 'contract') {
    searchParams.set('contract_type', params.contractType);
  }
  if (params.sortBy === 'date') {
    searchParams.set('sort_by', 'date');
  } else if (params.sortBy === 'salary') {
    searchParams.set('sort_by', 'salary');
  }

  const url = `${baseUrl}/${params.page}?${searchParams.toString()}`;

  const response = await fetch(url, { next: { revalidate: 300 }, signal: options.signal }); // Cache 5 min

  if (!response.ok) {
    throw providerResponseError('ADZUNA', response);
  }

  const data: AdzunaResponse = await response.json();

  const jobs: ProviderJob[] = data.results.map((job) => ({
    id: `adzuna-${job.id}`,
    title: job.title,
    company: job.company.display_name,
    location: job.location.display_name,
    salary: formatSalary(job.salary_min, job.salary_max),
    salaryMin: job.salary_min || null,
    salaryMax: job.salary_max || null,
    description: job.description,
    url: job.redirect_url,
    postedDate: job.created,
    source: 'adzuna' as const,
    contractType: job.contract_type || job.contract_time || null,
    isRemote: job.location.display_name.toLowerCase().includes('remote'),
    hasSponsorship: false,
    sponsorStatus: 'sponsorship-unknown' as const,
  }));

  return {
    jobs,
    total: data.count,
    page: params.page,
    perPage: params.perPage,
    source: 'Adzuna',
  };
}

function formatSalary(min: number, max: number): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) {
    return `£${formatNumber(min)} - £${formatNumber(max)}`;
  }
  return `£${formatNumber(min || max)}`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}
