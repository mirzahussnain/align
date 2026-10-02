import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, TextRun } from 'docx';
import type { CvBuildEntryV2, CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import { formatLinkUrl } from './utils';

const THEMES = {
  architect: { accent: '1B5EA6', heading: '0D2240', body: '2E3A47', font: 'Calibri' },
  editorial_refined: { accent: '8B5E3C', heading: '302A27', body: '403A36', font: 'Aptos' },
  technical_precision: { accent: '087E8B', heading: '1F2933', body: '334155', font: 'Aptos' },
  academic_latex: { accent: '222222', heading: '111111', body: '222222', font: 'Cambria' },
} as const;

function link(label: string, url: string, theme: (typeof THEMES)[keyof typeof THEMES]) {
  const href = formatLinkUrl(url);
  return href ? new ExternalHyperlink({ link: href, children: [new TextRun({ text: label, color: theme.accent, underline: {}, size: 18, font: theme.font })] }) : new TextRun({ text: label, size: 18, font: theme.font, color: theme.body });
}

function entryParagraphs(entry: CvBuildEntryV2, theme: (typeof THEMES)[keyof typeof THEMES]): Paragraph[] {
  const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' – ');
  const result = [
    new Paragraph({ keepNext: true, spacing: { before: 100, after: 20 }, children: [new TextRun({ text: entry.title, bold: true, size: 21, font: theme.font, color: theme.heading })] }),
  ];
  const meta = [entry.subtitle, dates].filter(Boolean).join(' · ');
  if (meta) result.push(new Paragraph({ keepNext: true, spacing: { after: 35 }, children: [new TextRun({ text: meta, italics: true, size: 18, font: theme.font, color: theme.body })] }));
  result.push(...entry.lines.map((line) => new Paragraph({ keepLines: true, bullet: { level: 0 }, spacing: { after: 45 }, children: [new TextRun({ text: line.text, size: 19, font: theme.font, color: theme.body })] })));
  if (entry.links.length) result.push(new Paragraph({ spacing: { after: 35 }, children: entry.links.flatMap((item, index) => [link(item.label, item.url, theme), ...(index < entry.links.length - 1 ? [new TextRun({ text: '  ·  ', size: 18, font: theme.font, color: theme.body })] : [])]) }));
  return result;
}

export async function generateV2Template(spec: CvBuildSpecV2): Promise<Buffer> {
  const theme = THEMES[spec.presentation.templateId];
  const density = spec.presentation.density === 'COMPACT' ? 16 : spec.presentation.density === 'SPACIOUS' ? 20 : 18;
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location].filter(Boolean).join(' · ');
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: spec.identity.fullName, bold: true, size: 56, font: theme.font, color: theme.heading })] }),
    ...(spec.identity.headline ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: spec.identity.headline, size: 22, font: theme.font, color: theme.accent })] })] : []),
    ...(contact ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: contact, size: 18, font: theme.font, color: theme.body })] })] : []),
    ...(spec.links.length ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: spec.links.flatMap((item, index) => [link(item.label, item.url, theme), ...(index < spec.links.length - 1 ? [new TextRun({ text: '  ·  ', size: 18, font: theme.font, color: theme.body })] : [])]) })] : []),
  ];
  for (const section of spec.sections) {
    children.push(new Paragraph({ keepNext: true, border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: theme.accent, space: 3 } }, spacing: { before: 160, after: 55 }, children: [new TextRun({ text: section.heading.toUpperCase(), bold: true, size: 21, font: theme.font, color: theme.accent })] }));
    children.push(...section.entries.flatMap((entry) => entryParagraphs(entry, theme)));
  }
  const document = new Document({ styles: { default: { document: { run: { font: theme.font, size: density } } } }, sections: [{ properties: { page: { margin: { top: 720, right: 820, bottom: 720, left: 820 } } }, children }] });
  return Packer.toBuffer(document);
}
