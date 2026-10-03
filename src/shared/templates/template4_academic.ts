import { AlignmentType, BorderStyle, Paragraph, Table, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import { linkRuns, packV2Document, sectionParagraphs, type V2TemplateTheme } from './v2-shared';

const THEME: V2TemplateTheme = { accent: '000000', heading: '000000', body: '000000', font: 'Times New Roman', dateStyle: 'long_month_year' };

export async function generateAcademicTemplate(spec: CvBuildSpecV2): Promise<Buffer> {
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location].filter(Boolean).join(' · ');
  const children: Array<Paragraph | Table> = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: spec.identity.fullName, bold: true, size: 50, font: THEME.font, color: THEME.heading })] }),
    ...(spec.identity.headline ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: spec.identity.headline, italics: true, size: 21, font: THEME.font, color: THEME.body })] })] : []),
    ...(contact ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 20 }, children: [new TextRun({ text: contact, size: 18, font: THEME.font, color: THEME.body })] })] : []),
    ...(spec.links.length ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 90 }, children: linkRuns(spec.links, THEME) })] : []),
  ];
  for (const section of spec.sections) {
    children.push(new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: THEME.accent, space: 4 } }, spacing: { before: 170, after: 55 }, children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 21, font: THEME.font, color: THEME.heading })] }));
    children.push(...sectionParagraphs(section, THEME, { titleSize: 21 }));
  }
  return packV2Document(spec, THEME.font, children, { top: 780, right: 900, bottom: 780, left: 900 });
}
