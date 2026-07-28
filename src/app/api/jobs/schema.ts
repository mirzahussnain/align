import { z } from 'zod';

export const JobsQuerySchema = z.object({
  query: z.string().trim().max(200, 'Query too long').min(1, 'Enter a job title or keyword.'),
  location: z.string().max(100, 'Location too long').default(''),
  perPage: z.coerce.number().min(1).max(50).default(15),
  contractType: z.enum(['all', 'permanent', 'contract', 'temporary']).default('all'),
  salaryMin: z.coerce.number().min(0).max(1_000_000).optional(),
  sortBy: z.enum(['relevance', 'date', 'salary_desc', 'salary_asc']).default('relevance'),
  sponsorship: z.enum(['all', 'offered', 'required', 'registered', 'exclude_no_sponsorship']).default('all'),
  experience: z.enum(['all', 'junior', 'mid', 'senior']).default('all'),
  remoteType: z.enum(['all', 'REMOTE', 'HYBRID', 'ONSITE']).default('all'),
  postedWithinDays: z.coerce.number().int().min(1).max(90).optional(),
  source: z.enum(['all', 'adzuna', 'reed', 'jooble']).default('all'),
  sessionId: z.string().uuid().optional(),
});