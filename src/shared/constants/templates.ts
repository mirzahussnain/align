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

export interface CvTemplateDefinition {
  name: string;
  description: string;
  purpose: string;
  font: string;
  version: string;
}

export const CV_TEMPLATE_DEFINITIONS: Record<TemplateId, CvTemplateDefinition> = {
  architect: {
    name: 'Classic ATS',
    description: 'A conservative single-column CV with conventional rules and right-aligned dates.',
    purpose: 'General UK applications',
    font: 'Arial',
    version: '2',
  },
  editorial_refined: {
    name: 'Modern Professional',
    description: 'An editorial hierarchy with a restrained warm accent and open, readable spacing.',
    purpose: 'Software, business, and professional roles',
    font: 'Georgia',
    version: '2',
  },
  technical_precision: {
    name: 'Project-Focused',
    description: 'A compact technical hierarchy that gives project titles and technology lines clear emphasis.',
    purpose: 'Portfolio, project, and technical contribution-led candidates',
    font: 'Trebuchet MS',
    version: '2',
  },
  academic_latex: {
    name: 'Academic / Graduate',
    description: 'A monochrome, education-friendly hierarchy suited to qualifications, awards, and research.',
    purpose: 'Education, qualifications, awards, research, and early-career evidence',
    font: 'Times New Roman',
    version: '2',
  },
};

/** The template used when a request omits one. */
export const DEFAULT_TEMPLATE_ID: TemplateId = 'architect';

/** Zod enum over the canonical ids, defaulting to the architect template. */
export const TemplateIdSchema = z.enum(TEMPLATE_IDS).default(DEFAULT_TEMPLATE_ID);

/** Narrow an arbitrary string to a known template id. */
export function isTemplateId(value: string): value is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(value);
}
