// Jooble API Service

import type { ProviderJob, JobSearchParams, JobSearchResult } from '@/shared/types/job';
import { API_CONFIG } from '@/shared/lib/config';

interface JoobleJob {
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  company: string;
  updated: string;
  id: string;
}

interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

/** `signal` — see the note on `searchAdzunaJobs`. Optional; callers are unaffected. */
export async function searchJoobleJobs(
  params: JobSearchParams,
  options: { signal?: AbortSignal } = {}
): Promise<JobSearchResult> {
  const { apiKey, baseUrl } = API_CONFIG.jooble;

  if (!apiKey) {
    throw new Error('Jooble API key not configured');
  }

  // UK SCOPE. Adzuna is scoped by its `/gb/` base path and Reed is a UK-only
  // board, but Jooble's endpoint is global and its only geographic control is the
  // `location` string. An empty location therefore returned worldwide results,
  // and a bare city ("Birmingham") is ambiguous to Jooble in exactly the way it
  // is ambiguous to us. The country is appended to every request so the provider
  // itself narrows the result set, rather than relying on the local classifier to
  // discard most of what it sends.
  const location = params.location?.trim()
    ? /\b(uk|u\.k\.|united kingdom|england|scotland|wales|northern ireland)\b/i.test(params.location)
      ? params.location.trim()
      : `${params.location.trim()}, United Kingdom`
    : 'United Kingdom';

  const body = {
    keywords: params.query,
    location,
    page: String(params.page),
    resultonthepage: String(params.perPage),
    ...(params.salaryMin && { salary: String(params.salaryMin) }),
  };

  const url = `${baseUrl}/${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    next: { revalidate: 300 },
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jooble API error: ${response.status} - ${errorText}`);
  }

  const data: JoobleResponse = await response.json();

  const jobs: ProviderJob[] = (data.jobs || []).map((job, index) => ({
    id: `jooble-${job.id || index}`,
    title: job.title,
    company: job.company || 'Company not specified',
    location: job.location || 'United Kingdom',
    salary: job.salary || null,
    salaryMin: null,
    salaryMax: null,
    description: job.snippet,
    url: job.link,
    postedDate: job.updated,
    source: 'jooble' as const,
    contractType: job.type || null,
    isRemote: (job.location || '').toLowerCase().includes('remote'),
    hasSponsorship: false, // Jooble doesn't provide this
    sponsorStatus: 'sponsorship-unknown' as const,
  }));

  return {
    jobs,
    total: data.totalCount || jobs.length,
    page: params.page,
    perPage: params.perPage,
    source: 'Jooble',
  };
}
