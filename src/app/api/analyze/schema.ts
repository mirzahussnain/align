import { z } from 'zod';

export const AnalyzeRequestSchema = z.object({
  file: z.custom<File>((val) => val instanceof File, 'Must be a File')
    .refine((file) => file.name.endsWith('.pdf'), 'Only PDF files are supported')
    .refine((file) => file.size <= 10 * 1024 * 1024, 'File too large. Max 10MB'),
  mode: z.enum(['ats', 'job_match']).default('ats'),
  jobDescription: z.string().optional().default(''),
  /**
   * Career track to file the result under. Optional — omitting it falls back to
   * the user's default profile. Ownership is verified server-side, so a foreign
   * id is ignored rather than trusted.
   */
  profileId: z.string().optional(),
});
