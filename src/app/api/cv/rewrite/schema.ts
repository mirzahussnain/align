import { z } from 'zod';

export const RewriteRequestSchema = z.object({
  cvText: z.string().min(50, 'CV text must be at least 50 characters').max(50_000, 'CV text too large (max 50,000 characters)'),
  jobDescription: z.string().min(10, 'Job description must be provided').max(20_000, 'Job description too large'),
  jobMatchFeedback: z.string().optional(), // Serialized JSON string from the analysis step
  templateId: z.enum(['architect', 'editorial_refined', 'technical_precision', 'academic_latex']).optional().default('architect'),
  hitlContext: z.record(z.string(), z.string()).optional().default({}),
  atsOptimizationData: z.string().optional(), // Serialized JSON string
});
