import { z } from 'zod';

export const RewriteRequestSchema = z.object({
  cvText: z.string().min(50, 'CV text must be at least 50 characters'),
  jobDescription: z.string().min(10, 'Job description must be provided'),
  jobMatchFeedback: z.any().optional(), // Can be string or JSON object
  templateId: z.enum(['architect', 'editorial_refined', 'technical_precision', 'academic_latex']).optional().default('architect'),
  hitlContext: z.record(z.string(), z.string()).optional().default({}),
  atsOptimizationData: z.any().optional(),
});
