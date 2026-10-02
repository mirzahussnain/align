import { z } from 'zod';

export const CvRewritePatchSchema = z.strictObject({
  evidenceId: z.string().min(1),
  text: z.string().trim().min(1).max(2400),
  sourceEvidenceIds: z.array(z.string().min(1)).min(1),
});

export const CvRewritePatchSetSchema = z.strictObject({
  schemaVersion: z.literal(1),
  patches: z.array(CvRewritePatchSchema),
});

function makeStrictProviderSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(makeStrictProviderSchema);
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, makeStrictProviderSchema(child)])) as Record<string, unknown>;
  if (result.properties && typeof result.properties === 'object' && !Array.isArray(result.properties)) {
    result.required = Object.keys(result.properties as Record<string, unknown>);
    result.additionalProperties = false;
  }
  return result;
}

const generated = z.toJSONSchema(CvRewritePatchSetSchema, { io: 'input', reused: 'ref' });
delete generated.$schema;

export const CV_REWRITE_PATCH_CONTRACT = {
  name: 'cv_evidence_rewrite_patches',
  runtimeSchema: CvRewritePatchSetSchema,
  jsonSchema: makeStrictProviderSchema(generated) as Record<string, unknown>,
} as const;

export type CvRewritePatch = z.output<typeof CvRewritePatchSchema>;
export type CvRewritePatchSet = z.output<typeof CvRewritePatchSetSchema>;
