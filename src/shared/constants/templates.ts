import { z } from 'zod';

/**
 * The single source of truth for DOCX template identifiers.
 *
 * Every generate path (rewrite/regenerate, from-profile), their request
 * schemas, the renderer switch, and the template-picker UI resolve against this
 * one list, so adding a template is a single edit here plus its render branch.
 */
export const TEMPLATE_IDS = [
  'architect',
  'editorial_refined',
  'technical_precision',
  'academic_latex',
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

/** The template used when a request omits one. */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'architect';

/** Zod enum over the canonical ids, defaulting to the architect template. */
export const TemplateIdSchema = z.enum(TEMPLATE_IDS).default(DEFAULT_TEMPLATE_ID);

/** Narrow an arbitrary string to a known template id. */
export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}
