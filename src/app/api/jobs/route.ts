import { NextRequest, NextResponse } from 'next/server';
import { searchAdzunaJobs } from '@/shared/services/adzuna';
import { searchReedJobs } from '@/shared/services/reed';
import { searchJoobleJobs } from '@/shared/services/jooble';
import { isCompanySponsor, batchCheckSponsors } from '@/shared/services/sponsor-registry';
import type { JobSearchParams, Job } from '@/shared/types/job';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { JobsQuerySchema } from './schema';
import { applyRateLimit, jobsLimiter } from '@/shared/lib/rate-limit';

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const ip = request.headers.get('x-forwarded-for') ?? 'anonymous';
    const rateLimitResponse = await applyRateLimit(jobsLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const { searchParams } = new URL(request.url);

    const parsed = JobsQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      throw new APIError(parsed.error.message, 400);
    }

    const {
      query, location, page, perPage, contractType,
      salaryMin, salaryMax, sortBy, sponsorship, experience,
      tech: techFilter, source
    } = parsed.data;

    // Map to JobSearchParams for services
    const params: JobSearchParams = {
      query, location, page, perPage, contractType: contractType as JobSearchParams['contractType'],
      salaryMin, salaryMax, sortBy: sortBy as JobSearchParams['sortBy'],
      sponsorship: sponsorship as JobSearchParams['sponsorship'],
      experience: experience as JobSearchParams['experience']
    };

    const rawQuery = query.trim();

    // Dynamically check if the query is an exact match for a sponsor company
    const isSponsor = await isCompanySponsor(rawQuery);
    if (isSponsor) {
      params.company = rawQuery;
      params.query = techFilter ? techFilter : 'software OR developer OR engineer OR tech OR data OR product OR design';
    } else {
      if (rawQuery.startsWith('"') && rawQuery.endsWith('"') && rawQuery.length > 2) {
        // Legacy quotes fallback support
        params.company = rawQuery.slice(1, -1);
        params.query = techFilter ? `${params.company} ${techFilter}` : params.company;
      } else {
        params.query = techFilter ? `${rawQuery} ${techFilter}` : rawQuery;
      }
    }

    const results: { source: string; jobs: Job[]; total: number; error?: string }[] = [];

    // Fetch from selected sources
    const fetchPromises = [];

    if (source === 'all' || source === 'adzuna') {
      fetchPromises.push(
        searchAdzunaJobs(params)
          .then((r) => results.push({ source: 'adzuna', jobs: r.jobs, total: r.total }))
          .catch(() => results.push({ source: 'adzuna', jobs: [], total: 0, error: 'PROVIDER_ERROR' }))
      );
    }

    if (source === 'all' || source === 'reed') {
      fetchPromises.push(
        searchReedJobs(params)
          .then((r) => results.push({ source: 'reed', jobs: r.jobs, total: r.total }))
          .catch(() => results.push({ source: 'reed', jobs: [], total: 0, error: 'PROVIDER_ERROR' }))
      );
    }

    if (source === 'all' || source === 'jooble') {
      fetchPromises.push(
        searchJoobleJobs(params)
          .then((r) => results.push({ source: 'jooble', jobs: r.jobs, total: r.total }))
          .catch(() => results.push({ source: 'jooble', jobs: [], total: 0, error: 'PROVIDER_ERROR' }))
      );
    }

    await Promise.all(fetchPromises);

    // Combine and deduplicate
    const allJobs = results.flatMap((r) => r.jobs);

    // 1. Batch-resolve Sponsorship via GOV.UK Registry (single registry load, O(n) lookups)
    const companyNames = allJobs.map((job) => job.company);
    const sponsorMap = await batchCheckSponsors(companyNames);
    const enhancedJobs = allJobs.map((job) => ({
      ...job,
      hasSponsorship: sponsorMap.get(job.company) ?? false,
    }));

    // 2. Post-fetch filtering
    let filteredJobs = enhancedJobs;

    // Strict exact phrase match if it's a company search
    if (params.company) {
      const exactPhrase = params.company.toLowerCase();
      filteredJobs = filteredJobs.filter((job) => 
        job.company.toLowerCase().includes(exactPhrase) || 
        job.title.toLowerCase().includes(exactPhrase)
      );
    }

    if (params.sponsorship === 'yes') {
      filteredJobs = filteredJobs.filter((job) => job.hasSponsorship);
    } else if (params.sponsorship === 'no') {
      filteredJobs = filteredJobs.filter((job) => !job.hasSponsorship);
    }

    if (params.experience && params.experience !== 'all') {
      filteredJobs = filteredJobs.filter((job) => {
        const t = job.title.toLowerCase();
        if (params.experience === 'junior') {
          return /\b(junior|graduate|associate|trainee|intern)\b/i.test(t);
        }
        if (params.experience === 'senior') {
          return /\b(senior|lead|principal|head|director|manager)\b/i.test(t);
        }
        if (params.experience === 'mid') {
          const isJunior = /\b(junior|graduate|associate|trainee|intern)\b/i.test(t);
          const isSenior = /\b(senior|lead|principal|head|director|manager)\b/i.test(t);
          return !isJunior && !isSenior;
        }
        return true;
      });
    }

    // 3. Post-fetch sorting
    if (params.sortBy === 'date') {
      filteredJobs.sort((a, b) => new Date(b.postedDate).getTime() - new Date(a.postedDate).getTime());
    } else if (params.sortBy === 'salary') {
      filteredJobs.sort((a, b) => (b.salaryMax || 0) - (a.salaryMax || 0));
    }

    // Recalculate total
    const totalResults = results.reduce((sum, r) => sum + r.total, 0);

    const errors = results.filter((r) => r.error).map((r) => `${r.source}: ${r.error}`);
    return NextResponse.json({
      jobs: filteredJobs,
      results,
      meta: {
        totalJobs: allJobs.length,
        currentPage: params.page,
        sourcesUsed: results.map((r) => r.source),
        errors: results.filter((r) => r.error).map((r) => ({ source: r.source, message: 'Provider failed to respond securely.' })) // Sanitized
      },
    });
  });
}
