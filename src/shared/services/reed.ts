// Reed API Service

import type { ProviderJob, JobSearchParams, JobSearchResult } from '@/shared/types/job';
import { API_CONFIG } from '@/shared/lib/config';
import { providerResponseError } from '@/shared/services/job-providers/provider-errors';

interface ReedJob {
  jobId: number;
  employerName: string;
  employerId: number;
  jobTitle: string;
  locationName: string;
  minimumSalary: number | null;
  maximumSalary: number | null;
  currency: string;
  expirationDate: string;
  date: string;
  jobDescription: string;
  applications: number;
  jobUrl: string;
  isPermanent: boolean;
  isContract: boolean;
  isTemporary: boolean;
}

interface ReedResponse {
  results: ReedJob[];
  totalResults: number;
}

/** `signal` — see the note on `searchAdzunaJobs`. Optional; callers are unaffected. */
export async function searchReedJobs(
  params: JobSearchParams,
  options: { signal?: AbortSignal } = {}
): Promise<JobSearchResult> {
  const { apiKey, baseUrl } = API_CONFIG.reed;

  if (!apiKey) {
    throw new Error('Reed API key not configured');
  }

  const searchParams = new URLSearchParams({
    resultsToTake: String(params.perPage),
    resultsToSkip: String((params.page - 1) * params.perPage),
  });

  if (params.query) {
    searchParams.set('keywords', params.query);
  }
  if (params.company) {
    searchParams.set('employerName', params.company);
  }

  if (params.location) {
    searchParams.set('locationName', params.location);
    searchParams.set('distanceFromLocation', '25');
  }
  if (params.salaryMin) {
    searchParams.set('minimumSalary', String(params.salaryMin));
  }
  if (params.salaryMax) {
    searchParams.set('maximumSalary', String(params.salaryMax));
  }
  if (params.contractType === 'permanent') {
    searchParams.set('permanent', 'true');
  } else if (params.contractType === 'contract') {
    searchParams.set('contract', 'true');
  } else if (params.contractType === 'temporary') {
    searchParams.set('temp', 'true');
  }

  const url = `${baseUrl}?${searchParams.toString()}`;

  // Reed uses Basic Auth with API key as username and empty password
  const authHeader = Buffer.from(`${apiKey}:`).toString('base64');

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${authHeader}`,
    },
    next: { revalidate: 300 },
    signal: options.signal,
  });

  if (!response.ok) {
    throw providerResponseError('REED', response);
  }

  const data: ReedResponse = await response.json();

  const jobs: ProviderJob[] = data.results.map((job) => ({
    id: `reed-${job.jobId}`,
    title: job.jobTitle,
    company: job.employerName,
    location: job.locationName,
    salary: formatReedSalary(job.minimumSalary, job.maximumSalary),
    salaryMin: job.minimumSalary,
    salaryMax: job.maximumSalary,
    description: stripHtml(job.jobDescription),
    url: job.jobUrl,
    postedDate: job.date,
    source: 'reed' as const,
    contractType: job.isPermanent ? 'Permanent' : job.isContract ? 'Contract' : job.isTemporary ? 'Temporary' : null,
    isRemote: job.locationName.toLowerCase().includes('remote'),
    hasSponsorship: false,
    sponsorStatus: 'sponsorship-unknown' as const,
  }));

  return {
    jobs,
    total: data.totalResults,
    page: params.page,
    perPage: params.perPage,
    source: 'Reed',
  };
}

function formatReedSalary(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) {
    return `£${formatNumber(min)} - £${formatNumber(max)}`;
  }
  return `£${formatNumber(min || max || 0)}`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
