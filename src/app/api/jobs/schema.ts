import { z } from 'zod';

export const JobsQuerySchema = z.object({
  query: z.string().default('software developer'),
  location: z.string().default(''),
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(50).default(15),
  contractType: z.enum(['all', 'permanent', 'contract', 'full_time', 'part_time']).default('all'),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
  sortBy: z.enum(['relevance', 'date', 'salary']).default('relevance'),
  sponsorship: z.enum(['all', 'offered', 'required']).default('all'),
  experience: z.enum(['all', 'junior', 'mid', 'senior', 'lead']).default('all'),
  tech: z.string().default(''),
  source: z.enum(['all', 'adzuna', 'reed', 'jooble']).default('all'),
});
