import { providerResponseError } from './provider-errors';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities';
import type { JobSearchParams, ProviderJob } from '@/shared/types/job';
import { JobProviderError, type JobProviderFetchResult, type SearchJobProviderAdapter } from '@/shared/types/job-provider';

const ENDPOINT = 'https://www.jobs.nhs.uk/api/v1/search_xml';

const decodeXml = (value: string) => value
  .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/i, '$1')
  .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

function tagText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function officialVacancyUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.jobs.nhs.uk' && url.pathname.startsWith('/candidate/jobadvert/')
      ? url.toString()
      : null;
  } catch { return null; }
}

export function parseNhsJobsXml(xml: string): { jobs: ProviderJob[]; total: number; totalPages: number; rawReceived: number } {
  if (!/<nhsSearch\b[^>]*>/i.test(xml) || !/<\/nhsSearch>/i.test(xml)) {
    throw new JobProviderError('NHS_JOBS', 'INVALID_RESPONSE');
  }
  const totalText = tagText(xml, 'totalResults');
  const pagesText = tagText(xml, 'totalPages');
  if (!/^\d+$/.test(totalText) || !/^\d+$/.test(pagesText)) {
    throw new JobProviderError('NHS_JOBS', 'INVALID_RESPONSE');
  }
  const blocks = [...xml.matchAll(/<vacancyDetails\b[^>]*>([\s\S]*?)<\/vacancyDetails>/gi)].map((match) => match[1]);
  const jobs = blocks.flatMap((block): ProviderJob[] => {
    const id = tagText(block, 'id');
    const title = tagText(block, 'title');
    const company = tagText(block, 'employer');
    const url = officialVacancyUrl(tagText(block, 'url'));
    if (!id || !title || !company || !url) return [];
    const locations = [...block.matchAll(/<location\b[^>]*>\s*([^<]+?)\s*<\/location>/gi)]
      .map((match) => decodeXml(match[1])).filter(Boolean);
    const description = tagText(block, 'description');
    const location = locations.join('; ');
    return [{
      id: `nhs_jobs-${id}`,
      title,
      company,
      location,
      salary: tagText(block, 'salary') || null,
      salaryMin: null,
      salaryMax: null,
      description,
      url,
      hostedUrl: url,
      applicationUrl: url,
      postedDate: tagText(block, 'postDate'),
      closingDate: tagText(block, 'closeDate') || undefined,
      source: 'nhs_jobs',
      contractType: tagText(block, 'type') || null,
      isRemote: /\b(remote|home[- ]based)\b/i.test(`${location} ${description}`),
      hasSponsorship: false,
    }];
  });
  return { jobs, total: Number(totalText), totalPages: Number(pagesText), rawReceived: blocks.length };
}

const contractType = (value: JobSearchParams['contractType']) => ({
  permanent: 'Permanent', contract: 'Fixed-Term', temporary: 'Bank', all: undefined,
})[value ?? 'all'];

export function buildNhsJobsSearchUrl(params: JobSearchParams, now = new Date()): string {
  const query = new URLSearchParams();
  if (params.query.trim()) query.set('keyword', params.query.trim());
  if (params.location.trim()) { query.set('location', params.location.trim()); query.set('distance', '25'); }
  query.set('page', String(Math.max(1, params.page)));
  if (params.salaryMin != null) query.set('salaryFrom', String(params.salaryMin));
  if (params.salaryMax != null) query.set('salaryTo', String(params.salaryMax));
  const mappedContract = contractType(params.contractType);
  if (mappedContract) query.set('contractType', mappedContract);
  if (params.remote) query.set('workingPattern', 'remoteWorking');
  if (params.postedWithinDays) {
    const from = new Date(now.getTime() - params.postedWithinDays * 86_400_000);
    query.set('publishedFrom', from.toISOString().slice(0, 10));
  }
  if (params.sortBy === 'date') query.set('sort', 'publicationDateDesc');
  if (params.sortBy === 'salary') query.set('sort', 'salaryDesc');
  return `${ENDPOINT}?${query.toString()}`;
}

export const nhsJobsAdapter: SearchJobProviderAdapter = {
  provider: 'NHS_JOBS',
  label: 'NHS Jobs',
  capabilities: JOB_PROVIDER_CAPABILITIES.NHS_JOBS as SearchJobProviderAdapter['capabilities'],
  isConfigured: () => true,
  async search(params, context): Promise<JobProviderFetchResult> {
    const response = await fetch(buildNhsJobsSearchUrl(params), {
      headers: { accept: 'application/xml, text/xml' },
      signal: context.signal,
    });
    if (!response.ok) throw providerResponseError('NHS_JOBS', response);
    const parsed = parseNhsJobsXml(await response.text());
    return {
      jobs: parsed.jobs,
      total: parsed.total,
      rawReceived: parsed.rawReceived,
      nextCursor: params.page < parsed.totalPages ? String(params.page + 1) : undefined,
    };
  },
};
