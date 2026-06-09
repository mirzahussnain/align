import { z } from 'zod';

export const SponsorQuerySchema = z.object({
  query: z.string().default(''),
  route: z.string().default('all'),
  industry: z.string().default('all'),
  page: z.coerce.number().min(1).default(1),
  perPage: z.coerce.number().min(1).max(100).default(50),
});
