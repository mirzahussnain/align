import { BorderStyle, Paragraph, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import { entryParagraphs, linkRuns, packV2Document, type V2TemplateTheme } from './v2-shared';

const THEME: V2TemplateTheme = { accent: '8B4513', heading: '302A27', body: '403A36', font: 'Calibri', dateStyle: 'long_month_year' };

export async function generateEditorialTemplate(spec: CvBuildSpecV2): Promise<Buffer> {
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location].filter(Boolean).join(' · ');
  const children: Paragraph[] = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: spec.identity.fullName, bold: true, size: 54, font: THEME.font, color: THEME.heading })] }),
    ...(spec.identity.headline ? [new Paragraph({ spacing: { after: 35 }, children: [new TextRun({ text: spec.identity.headline, italics: true, size: 23, font: THEME.font, color: THEME.accent })] })] : []),
    ...(contact ? [new Paragraph({ spacing: { after: 25 }, children: [new TextRun({ text: contact, size: 18, font: THEME.font, color: THEME.body })] })] : []),
    ...(spec.links.length ? [new Paragraph({ spacing: { after: 110 }, children: linkRuns(spec.links, THEME) })] : []),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: THEME.accent, space: 1 } } }),
  ];
  for (const section of spec.sections) {
    children.push(new Paragraph({ keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D4B896', space: 3 } }, spacing: { before: 180, after: 65 }, children: [new TextRun({ text: '▪  ', size: 22, font: THEME.font, color: THEME.accent }), new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 22, font: THEME.font, color: THEME.heading })] }));
    children.push(...section.entries.flatMap((entry) => entryParagraphs(entry, THEME, { titleSize: 22 })));
  }
  return packV2Document(spec, THEME.font, children, { top: 800, right: 900, bottom: 800, left: 900 });
}
