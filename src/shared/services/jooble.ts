// Jooble API Service

import type { Job, JobSearchParams, JobSearchResult } from '@/shared/types/job';
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

export async function searchJoobleJobs(params: JobSearchParams): Promise<JobSearchResult> {
  const { apiKey, baseUrl } = API_CONFIG.jooble;

  if (!apiKey) {
    throw new Error('Jooble API key not configured');
  }

  const body = {
    keywords: params.query,
    location: params.location || 'United Kingdom',
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
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jooble API error: ${response.status} - ${errorText}`);
  }

  const data: JoobleResponse = await response.json();

  const jobs: Job[] = (data.jobs || []).map((job, index) => ({
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
