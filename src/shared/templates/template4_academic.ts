import { AlignmentType, BorderStyle, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import { entryParagraphs, linkRuns, packV2Document, type V2TemplateTheme } from './v2-shared';

const THEME: V2TemplateTheme = { accent: '000000', heading: '000000', body: '000000', font: 'Times New Roman', dateStyle: 'long_month_year' };

function academicMetadataTable(entry: CvBuildSpecV2['sections'][number]['entries'][number]): Table[] {
  if (!(entry.metadata ?? []).length) return [];
  const none = { style: BorderStyle.NONE, size: 0, color: 'auto' };
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none },
    rows: (entry.metadata ?? []).map((item) => new TableRow({ children: [
      new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: item.label, bold: true, size: 20, font: THEME.font })] })] }),
      new TableCell({ width: { size: 72, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: item.value, size: 20, font: THEME.font })] })] }),
    ] })),
  })];
}

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
    for (const entry of section.entries) {
      const paragraphs = entryParagraphs({ ...entry, metadata: [] }, THEME, { titleSize: 21 });
      children.push(...paragraphs.slice(0, 2), ...academicMetadataTable(entry), ...paragraphs.slice(2));
    }
  }
  return packV2Document(spec, THEME.font, children, { top: 780, right: 900, bottom: 780, left: 900 });
}
