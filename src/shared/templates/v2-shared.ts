import {
  Document,
  ExternalHyperlink,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TabStopType,
  TextRun,
} from 'docx';
import type {
  CvBuildSectionV2,
  CvBuildSpecV2,
  CvPresentationLine,
  CvPresentationLink,
} from '@/shared/cv-generation/build-spec-types';
import { formatDateRangeStyled, type DateDisplayStyle } from '@/shared/utils/date';
import { formatLinkUrl } from './utils';
import { employmentTypeLabel } from '@/shared/constants/employment-type';
import type { TemplateLayout } from './layout';

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
  current?: boolean;
  technologies?: string[];
  lines: CvPresentationLine[];
  links: CvPresentationLink[];
}

const singleLine = 240;

export function linkRuns(
  items: CvPresentationLink[],
  theme: V2TemplateTheme,
  layout: TemplateLayout,
): Array<ExternalHyperlink | TextRun> {
  return items.flatMap((item, index) => {
    const href = formatLinkUrl(item.url);
    const run = href
      ? new ExternalHyperlink({
          link: href,
          children: [
            new TextRun({
              text: item.label,
              color: theme.accent,
              underline: {},
              size: layout.type.link,
              font: theme.font,
            }),
          ],
        })
      : new TextRun({
          text: item.label,
          size: layout.type.link,
          font: theme.font,
          color: theme.body,
        });
    return [
      run,
      ...(index < items.length - 1
        ? [
            new TextRun({
              text: '  ·  ',
              size: layout.type.link,
              font: theme.font,
              color: theme.body,
            }),
          ]
        : []),
    ];
  });
}

function entryParagraphs(
  entry: PresentationEntry,
  theme: V2TemplateTheme,
  layout: TemplateLayout,
): Paragraph[] {
  const dates = formatDateRangeStyled(
    entry.startDate,
    entry.endDate,
    theme.dateStyle,
    entry.current,
  );
  const result = [
    new Paragraph({
      keepNext: true,
      spacing: {
        before: layout.spacing.entryBefore,
        after: layout.spacing.entryAfter,
        line: singleLine,
      },
      children: [
        new TextRun({
          text: entry.title,
          bold: true,
          size: layout.type.entryTitle,
          font: theme.font,
          color: theme.heading,
        }),
      ],
    }),
  ];
  const meta = [entry.subtitle, !layout.dateTabStopPosition && dates]
    .filter(Boolean)
    .join(' · ');
  if (meta || (layout.dateTabStopPosition && dates)) {
    result.push(
      new Paragraph({
        keepNext: true,
        tabStops: layout.dateTabStopPosition
          ? [{ type: TabStopType.RIGHT, position: layout.dateTabStopPosition }]
          : undefined,
        spacing: { after: layout.spacing.metadataAfter, line: singleLine },
        children: [
          ...(meta
            ? [
                new TextRun({
                  text: meta,
                  italics: true,
                  size: layout.type.metadata,
                  font: theme.font,
                  color: theme.body,
                }),
              ]
            : []),
          ...(layout.dateTabStopPosition && dates
            ? [
                new TextRun({ text: '\t' }),
                new TextRun({
                  text: dates,
                  italics: true,
                  size: layout.type.metadata,
                  font: theme.font,
                  color: theme.body,
                }),
              ]
            : []),
        ],
      }),
    );
  }
  if (entry.technologies?.length) {
    result.push(
      new Paragraph({
        keepNext: true,
        spacing: { after: layout.spacing.technologyAfter, line: singleLine },
        children: [
          new TextRun({
            text: entry.technologies.join(' · '),
            size: layout.type.metadata,
            font: theme.font,
            color: theme.body,
          }),
        ],
      }),
    );
  }
  result.push(
    ...entry.lines.map(
      (line) =>
        new Paragraph({
          keepLines: true,
          bullet: { level: 0 },
          spacing: { after: layout.spacing.bulletAfter, line: singleLine },
          children: [
            new TextRun({
              text: line.text,
              size: layout.type.body,
              font: theme.font,
              color: theme.body,
            }),
          ],
        }),
    ),
  );
  if (entry.links.length) {
    result.push(
      new Paragraph({
        spacing: { after: layout.spacing.linkAfter, line: singleLine },
        children: linkRuns(entry.links, theme, layout),
      }),
    );
  }
  return result;
}

export function sectionParagraphs(
  section: CvBuildSectionV2,
  theme: V2TemplateTheme,
  layout: TemplateLayout,
): Paragraph[] {
  switch (section.type) {
    case 'PROFILE':
    case 'EXECUTIVE_SUMMARY':
      return section.lines.map(
        (line) =>
          new Paragraph({
            keepLines: true,
            spacing: { after: layout.spacing.profileAfter, line: singleLine },
            children: [
              new TextRun({
                text: line.text,
                size: layout.type.body,
                font: theme.font,
                color: theme.body,
              }),
            ],
          }),
      );
    case 'SELECTED_IMPACT':
      return section.items.flatMap((item) =>
        entryParagraphs(
          { title: item.heading, lines: item.lines, links: [] },
          theme,
          layout,
        ),
      );
    case 'CORE_EXPERTISE':
    case 'SKILLS':
      return section.items.map(
        (group) =>
          new Paragraph({
            keepLines: true,
            spacing: { after: layout.spacing.skillAfter, line: singleLine },
            children: [
              new TextRun({
                text: group.category,
                bold: true,
                size: layout.type.body,
                font: theme.font,
                color: theme.heading,
              }),
              new TextRun({
                text: ` — ${group.skills.map(({ name }) => name).join(', ')}`,
                size: layout.type.body,
                font: theme.font,
                color: theme.body,
              }),
            ],
          }),
      );
    case 'EXPERIENCE':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.title,
            subtitle: [
              item.employer,
              item.location,
              employmentTypeLabel(item.employmentType),
            ]
              .filter(Boolean)
              .join(' · '),
            startDate: item.startDate,
            endDate: item.endDate,
            current: item.current,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'PROJECTS':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.name,
            subtitle: item.subtitle,
            startDate: item.startDate,
            endDate: item.endDate,
            technologies: item.technologies,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'EDUCATION':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.degree,
            subtitle: [item.institution, item.location, item.grade].filter(Boolean).join(' · '),
            startDate: item.startDate,
            endDate: item.endDate,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'CERTIFICATIONS':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.name,
            subtitle: [item.issuer, item.credentialId].filter(Boolean).join(' · '),
            startDate: item.issueDate,
            endDate: item.expiryDate,
            lines: item.lines,
            links: item.credentialUrl
              ? [
                  ...item.links,
                  {
                    id: `${item.id}:credential`,
                    label: 'Credential',
                    url: item.credentialUrl,
                    type: 'OTHER',
                  },
                ]
              : item.links,
          },
          theme,
          layout,
        ),
      );
    case 'TRAINING':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.course,
            subtitle: [item.provider, item.field, item.status, item.result]
              .filter(Boolean)
              .join(' · '),
            startDate: item.startDate,
            endDate: item.endDate,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'VOLUNTEERING':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.role,
            subtitle: item.organisation,
            startDate: item.startDate,
            endDate: item.endDate,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'OPEN_SOURCE':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.projectName,
            subtitle: [item.role, item.description].filter(Boolean).join(' · '),
            startDate: item.startDate,
            endDate: item.endDate,
            technologies: item.technologies,
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    case 'OTHER':
      return section.items.flatMap((item) =>
        entryParagraphs(
          {
            title: item.title,
            subtitle: [item.context, item.period].filter(Boolean).join(' · '),
            lines: item.lines,
            links: item.links,
          },
          theme,
          layout,
        ),
      );
    default: {
      const exhaustive: never = section;
      throw new Error(`Unsupported CV section: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export async function packV2Document(
  _spec: CvBuildSpecV2,
  layout: TemplateLayout,
  children: Array<Paragraph | Table>,
): Promise<Buffer> {
  return Packer.toBuffer(
    new Document({
      styles: {
        default: {
          document: {
            run: { font: layout.font, size: layout.type.documentDefault },
            paragraph: { spacing: { line: Math.round(240 * layout.lineSpacing) } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: layout.page.width,
                height: layout.page.height,
                orientation: PageOrientation.PORTRAIT,
              },
              margin: layout.margins,
            },
          },
          children,
        },
      ],
    }),
  );
}
