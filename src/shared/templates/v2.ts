import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import type { TemplateId } from '@/shared/constants/templates';
import { generateArchitectTemplate } from './template1_architect';
import { generateEditorialTemplate } from './template2_editorial';
import { generateTechnicalTemplate } from './template3_technical';
import { generateAcademicTemplate } from './template4_academic';

export type CvTemplateRenderer = (spec: CvBuildSpecV2) => Promise<Buffer>;

export const CV_TEMPLATE_RENDERERS: Record<TemplateId, CvTemplateRenderer> = {
  architect: generateArchitectTemplate,
  editorial_refined: generateEditorialTemplate,
  technical_precision: generateTechnicalTemplate,
  academic_latex: generateAcademicTemplate,
};

export async function generateV2Template(spec: CvBuildSpecV2): Promise<Buffer> {
  const renderer = (CV_TEMPLATE_RENDERERS as Partial<Record<string, CvTemplateRenderer>>)[spec.presentation.templateId];
  if (!renderer) throw new Error(`Unknown template ID: ${spec.presentation.templateId}`);
  return renderer(spec);
}
