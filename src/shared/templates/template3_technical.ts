import { AlignmentType, BorderStyle, Paragraph, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import { entryParagraphs, linkRuns, packV2Document, type V2TemplateTheme } from './v2-shared';

const THEME: V2TemplateTheme = { accent: '087E8B', heading: '1F2933', body: '334155', font: 'Aptos', dateStyle: 'numeric_month_year' };

export async function generateTechnicalTemplate(spec: CvBuildSpecV2): Promise<Buffer> {
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location].filter(Boolean).join(' | ');
  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: spec.identity.fullName.toLocaleLowerCase('en-GB'), bold: true, size: 48, font: THEME.font, color: THEME.heading })] }),
    ...(spec.identity.headline ? [new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: spec.identity.headline.toUpperCase(), bold: true, size: 19, font: THEME.font, color: THEME.accent })] })] : []),
    ...(contact ? [new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: contact, size: 17, font: THEME.font, color: THEME.body })] })] : []),
    ...(spec.links.length ? [new Paragraph({ spacing: { after: 80 }, children: linkRuns(spec.links, THEME) })] : []),
  ];
  for (const section of spec.sections) {
    children.push(new Paragraph({ keepNext: true, alignment: AlignmentType.LEFT, border: { left: { style: BorderStyle.SINGLE, size: 20, color: THEME.accent, space: 8 }, bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B3E0E0', space: 2 } }, indent: { left: 120 }, spacing: { before: 120, after: 40 }, children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 19, font: THEME.font, color: THEME.accent })] }));
    children.push(...section.entries.flatMap((entry) => entryParagraphs(entry, THEME, { compact: true, titleSize: 20 })));
  }
  return packV2Document(spec, THEME.font, children, { top: 620, right: 720, bottom: 620, left: 720 });
}
