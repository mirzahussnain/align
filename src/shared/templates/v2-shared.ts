import { Document, ExternalHyperlink, Packer, Paragraph, Table, TabStopType, TextRun } from 'docx';
import type { CvBuildSectionV2, CvBuildSpecV2, CvPresentationLine, CvPresentationLink } from '@/shared/cv-generation/build-spec-types';
import { formatDateRangeStyled, type DateDisplayStyle } from '@/shared/utils/date';
import { formatLinkUrl } from './utils';

export interface V2TemplateTheme {
  accent: string;
  heading: string;
  body: string;
  font: string;
  dateStyle: DateDisplayStyle;
}

interface PresentationEntry {
  title: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
  technologies?: string[];
  lines: CvPresentationLine[];
  links: CvPresentationLink[];
}

export function linkRuns(items: CvPresentationLink[], theme: V2TemplateTheme): Array<ExternalHyperlink | TextRun> {
  return items.flatMap((item, index) => {
    const href = formatLinkUrl(item.url);
    const run = href
      ? new ExternalHyperlink({ link: href, children: [new TextRun({ text: item.label, color: theme.accent, underline: {}, size: 18, font: theme.font })] })
      : new TextRun({ text: item.label, size: 18, font: theme.font, color: theme.body });
    return [run, ...(index < items.length - 1 ? [new TextRun({ text: '  ·  ', size: 18, font: theme.font, color: theme.body })] : [])];
  });
}

function entryParagraphs(entry: PresentationEntry, theme: V2TemplateTheme, options?: { compact?: boolean; titleSize?: number; dateTabStopPosition?: number }): Paragraph[] {
  const dates = formatDateRangeStyled(entry.startDate, entry.endDate, theme.dateStyle);
  const result = [new Paragraph({ keepNext: true, spacing: { before: options?.compact ? 55 : 100, after: 20 }, children: [new TextRun({ text: entry.title, bold: true, size: options?.titleSize ?? 21, font: theme.font, color: theme.heading })] })];
  const meta = [entry.subtitle, !options?.dateTabStopPosition && dates].filter(Boolean).join(' · ');
  if (meta || (options?.dateTabStopPosition && dates)) result.push(new Paragraph({ keepNext: true, tabStops: options?.dateTabStopPosition ? [{ type: TabStopType.RIGHT, position: options.dateTabStopPosition }] : undefined, spacing: { after: 35 }, children: [
    ...(meta ? [new TextRun({ text: meta, italics: true, size: 18, font: theme.font, color: theme.body })] : []),
    ...(options?.dateTabStopPosition && dates ? [new TextRun({ text: '\t' }), new TextRun({ text: dates, italics: true, size: 18, font: theme.font, color: theme.body })] : []),
  ] }));
  if (entry.technologies?.length) result.push(new Paragraph({ keepNext: true, spacing: { after: 35 }, children: [new TextRun({ text: entry.technologies.join(' · '), size: 18, font: theme.font, color: theme.body })] }));
  result.push(...entry.lines.map((line) => new Paragraph({ keepLines: true, bullet: { level: 0 }, spacing: { after: options?.compact ? 25 : 45 }, children: [new TextRun({ text: line.text, size: 19, font: theme.font, color: theme.body })] })));
  if (entry.links.length) result.push(new Paragraph({ spacing: { after: 35 }, children: linkRuns(entry.links, theme) }));
  return result;
}

export function sectionParagraphs(section: CvBuildSectionV2, theme: V2TemplateTheme, options?: { compact?: boolean; titleSize?: number; dateTabStopPosition?: number }): Paragraph[] {
  switch (section.type) {
    case 'PROFILE': case 'EXECUTIVE_SUMMARY': case 'SELECTED_IMPACT':
      return section.lines.map((line) => new Paragraph({ keepLines: true, spacing: { after: 45 }, children: [new TextRun({ text: line.text, size: 19, font: theme.font, color: theme.body })] }));
    case 'CORE_EXPERTISE': case 'SKILLS':
      return section.items.map((group) => new Paragraph({ keepLines: true, spacing: { after: 35 }, children: [
        new TextRun({ text: group.category, bold: true, size: 19, font: theme.font, color: theme.heading }),
        new TextRun({ text: ` — ${group.skills.map(({ name }) => name).join(', ')}`, size: 19, font: theme.font, color: theme.body }),
      ] }));
    case 'EXPERIENCE':
      return section.items.flatMap((item) => entryParagraphs({ title: item.title, subtitle: [item.employer, item.location, item.employmentType].filter(Boolean).join(' · '), startDate: item.startDate, endDate: item.endDate, lines: item.lines, links: item.links }, theme, options));
    case 'PROJECTS':
      return section.items.flatMap((item) => entryParagraphs({ title: item.name, subtitle: item.subtitle, startDate: item.startDate, endDate: item.endDate, technologies: item.technologies, lines: item.lines, links: item.links }, theme, options));
    case 'EDUCATION':
      return section.items.flatMap((item) => entryParagraphs({ title: item.degree, subtitle: [item.institution, item.location, item.grade].filter(Boolean).join(' · '), startDate: item.startDate, endDate: item.endDate, lines: item.lines, links: item.links }, theme, options));
    case 'CERTIFICATIONS':
      return section.items.flatMap((item) => entryParagraphs({ title: item.name, subtitle: [item.issuer, item.credentialId].filter(Boolean).join(' · '), startDate: item.issueDate, endDate: item.expiryDate, lines: item.lines, links: item.credentialUrl ? [...item.links, { id: `${item.id}:credential`, label: 'Credential', url: item.credentialUrl, type: 'OTHER' }] : item.links }, theme, options));
    case 'TRAINING':
      return section.items.flatMap((item) => entryParagraphs({ title: item.course, subtitle: [item.provider, item.field, item.status, item.result].filter(Boolean).join(' · '), startDate: item.startDate, endDate: item.endDate, lines: item.lines, links: item.links }, theme, options));
    case 'VOLUNTEERING':
      return section.items.flatMap((item) => entryParagraphs({ title: item.role, subtitle: item.organisation, startDate: item.startDate, endDate: item.endDate, lines: item.lines, links: item.links }, theme, options));
    case 'OPEN_SOURCE':
      return section.items.flatMap((item) => entryParagraphs({ title: item.projectName, subtitle: [item.role, item.description].filter(Boolean).join(' · '), startDate: item.startDate, endDate: item.endDate, technologies: item.technologies, lines: item.lines, links: item.links }, theme, options));
    case 'OTHER':
      return section.items.flatMap((item) => entryParagraphs({ title: item.title, subtitle: [item.context, item.period].filter(Boolean).join(' · '), lines: item.lines, links: item.links }, theme, options));
    default: {
      const exhaustive: never = section;
      throw new Error(`Unsupported CV section: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export async function packV2Document(spec: CvBuildSpecV2, font: string, children: Array<Paragraph | Table>, margins: { top: number; right: number; bottom: number; left: number }): Promise<Buffer> {
  const size = spec.presentation.density === 'COMPACT' ? 16 : spec.presentation.density === 'SPACIOUS' ? 20 : 18;
  return Packer.toBuffer(new Document({ styles: { default: { document: { run: { font, size } } } }, sections: [{ properties: { page: { margin: margins } }, children }] }));
}
