import { Document, ExternalHyperlink, Packer, Paragraph, Table, TabStopType, TextRun } from 'docx';
import type { CvBuildEntryV2, CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import { formatDateRangeStyled, type DateDisplayStyle } from '@/shared/utils/date';
import { formatLinkUrl } from './utils';

export interface V2TemplateTheme {
  accent: string;
  heading: string;
  body: string;
  font: string;
  dateStyle: DateDisplayStyle;
}

export function linkRuns(items: CvBuildEntryV2['links'] | CvBuildSpecV2['links'], theme: V2TemplateTheme): Array<ExternalHyperlink | TextRun> {
  return items.flatMap((item, index) => {
    const href = formatLinkUrl(item.url);
    const run = href
      ? new ExternalHyperlink({ link: href, children: [new TextRun({ text: item.label, color: theme.accent, underline: {}, size: 18, font: theme.font })] })
      : new TextRun({ text: item.label, size: 18, font: theme.font, color: theme.body });
    return [run, ...(index < items.length - 1 ? [new TextRun({ text: '  ·  ', size: 18, font: theme.font, color: theme.body })] : [])];
  });
}

export function metadataParagraphs(entry: CvBuildEntryV2, theme: V2TemplateTheme): Paragraph[] {
  return (entry.metadata ?? []).map((item) => new Paragraph({ keepNext: true, spacing: { after: 25 }, children: [
    new TextRun({ text: `${item.label}: `, bold: true, size: 18, font: theme.font, color: theme.heading }),
    new TextRun({ text: item.value, size: 18, font: theme.font, color: theme.body }),
  ] }));
}

export function entryParagraphs(entry: CvBuildEntryV2, theme: V2TemplateTheme, options?: { compact?: boolean; titleSize?: number; dateTabStopPosition?: number }): Paragraph[] {
  const dates = formatDateRangeStyled(entry.startDate, entry.endDate, theme.dateStyle);
  const result = [
    new Paragraph({ keepNext: true, spacing: { before: options?.compact ? 55 : 100, after: 20 }, children: [new TextRun({ text: entry.title, bold: true, size: options?.titleSize ?? 21, font: theme.font, color: theme.heading })] }),
  ];
  const meta = [entry.subtitle, !options?.dateTabStopPosition && dates].filter(Boolean).join(' · ');
  if (meta || (options?.dateTabStopPosition && dates)) result.push(new Paragraph({ keepNext: true, tabStops: options?.dateTabStopPosition ? [{ type: TabStopType.RIGHT, position: options.dateTabStopPosition }] : undefined, spacing: { after: 35 }, children: [
    ...(meta ? [new TextRun({ text: meta, italics: true, size: 18, font: theme.font, color: theme.body })] : []),
    ...(options?.dateTabStopPosition && dates ? [new TextRun({ text: '\t' }), new TextRun({ text: dates, italics: true, size: 18, font: theme.font, color: theme.body })] : []),
  ] }));
  result.push(...metadataParagraphs(entry, theme));
  result.push(...entry.lines.map((line) => new Paragraph({ keepLines: true, bullet: { level: 0 }, spacing: { after: options?.compact ? 25 : 45 }, children: [new TextRun({ text: line.text, size: 19, font: theme.font, color: theme.body })] })));
  if (entry.links.length) result.push(new Paragraph({ spacing: { after: 35 }, children: linkRuns(entry.links, theme) }));
  return result;
}

export async function packV2Document(spec: CvBuildSpecV2, font: string, children: Array<Paragraph | Table>, margins: { top: number; right: number; bottom: number; left: number }): Promise<Buffer> {
  const size = spec.presentation.density === 'COMPACT' ? 16 : spec.presentation.density === 'SPACIOUS' ? 20 : 18;
  return Packer.toBuffer(new Document({
    styles: { default: { document: { run: { font, size } } } },
    sections: [{ properties: { page: { margin: margins } }, children }],
  }));
}
