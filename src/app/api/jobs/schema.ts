import { z } from 'zod';

export const JobsQuerySchema = z.object({
  query: z.string().max(200, 'Query too long').default('software developer'),
  location: z.string().max(100, 'Location too long').default(''),
  page: z.coerce.number().min(1).max(100, 'Page cannot exceed 100').default(1),
  perPage: z.coerce.number().min(1).max(50).default(15),
  contractType: z.enum(['all', 'permanent', 'contract', 'temporary']).default('all'),
  salaryMin: z.coerce.number().min(0).max(1_000_000).optional(),
  salaryMax: z.coerce.number().min(0).max(1_000_000).optional(),
  sortBy: z.enum(['relevance', 'date', 'salary']).default('relevance'),
  sponsorship: z.enum(['all', 'offered', 'required']).default('all'),
  experience: z.enum(['all', 'junior', 'mid', 'senior', 'lead']).default('all'),
  tech: z.string().max(200, 'Tech filter too long').default(''),
  source: z.enum(['all', 'adzuna', 'reed', 'jooble']).default('all'),
});
