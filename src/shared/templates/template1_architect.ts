import { AlignmentType, BorderStyle, Paragraph, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import { linkRuns, packV2Document, sectionParagraphs, type V2TemplateTheme } from './v2-shared';

const THEME: V2TemplateTheme = { accent: '1B5EA6', heading: '0D2240', body: '2E3A47', font: 'Calibri', dateStyle: 'short_month_year' };

export async function generateArchitectTemplate(spec: CvBuildSpecV2): Promise<Buffer> {
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location].filter(Boolean).join(' · ');
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: spec.identity.fullName, bold: true, size: 56, font: THEME.font, color: THEME.heading })] }),
    ...(spec.identity.headline ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: spec.identity.headline, size: 22, font: THEME.font, color: THEME.accent })] })] : []),
    ...(contact ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: contact, size: 18, font: THEME.font, color: THEME.body })] })] : []),
    ...(spec.links.length ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: linkRuns(spec.links, THEME) })] : []),
  ];
  for (const section of spec.sections) {
    children.push(new Paragraph({ keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: THEME.accent, space: 3 } }, spacing: { before: 160, after: 55 }, children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 21, font: THEME.font, color: THEME.accent })] }));
    children.push(...sectionParagraphs(section, THEME, { dateTabStopPosition: 9026 }));
  }
  return packV2Document(spec, THEME.font, children, { top: 720, right: 820, bottom: 720, left: 820 });
}
