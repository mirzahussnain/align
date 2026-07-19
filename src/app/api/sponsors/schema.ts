import { z } from 'zod';

export const SponsorQuerySchema = z.object({
  query: z.string().max(200, 'Search query too long').default(''),
  route: z.string().max(100).default('all'),
  industry: z.string().max(100).default('all'),
  page: z.coerce.number().min(1).max(500, 'Page cannot exceed 500').default(1),
  perPage: z.coerce.number().min(1).max(100).default(50),
});
