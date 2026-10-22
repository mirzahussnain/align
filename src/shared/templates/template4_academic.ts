import { AlignmentType, BorderStyle, Paragraph, Table, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import { CV_TEMPLATE_DEFINITIONS } from '@/shared/constants/templates';
import { layoutFor, type CvTemplateRenderOptions } from './layout';
import {
  linkRuns,
  packV2Document,
  sectionParagraphs,
  type V2TemplateTheme,
} from './v2-shared';
import { formatPhone } from './utils';

const THEME: V2TemplateTheme = {
  accent: '000000',
  heading: '000000',
  body: '000000',
  font: CV_TEMPLATE_DEFINITIONS.academic_latex.font,
  dateStyle: 'long_month_year',
};

export async function generateAcademicTemplate(
  spec: CvBuildSpecV2,
  options: CvTemplateRenderOptions = {},
): Promise<Buffer> {
  const layout = layoutFor(
    'academic_latex',
    spec.presentation.density,
    options.profile ?? 'preferred',
  );
  const contact = [spec.identity.email, formatPhone(spec.identity.phone ?? ''), spec.identity.location]
    .filter(Boolean)
    .join(' · ');
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: layout.spacing.nameAfter, line: 240 },
      children: [
        new TextRun({
          text: spec.identity.fullName,
          bold: true,
          size: layout.type.name,
          font: THEME.font,
          color: THEME.heading,
        }),
      ],
    }),
    ...(spec.identity.headline
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: layout.spacing.headlineAfter, line: 240 },
            children: [
              new TextRun({
                text: spec.identity.headline,
                italics: true,
                size: layout.type.headline,
                font: THEME.font,
                color: THEME.body,
              }),
            ],
          }),
        ]
      : []),
    ...(contact
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: layout.spacing.contactAfter, line: 240 },
            children: [
              new TextRun({
                text: contact,
                size: layout.type.metadata,
                font: THEME.font,
                color: THEME.body,
              }),
            ],
          }),
        ]
      : []),
    ...(spec.links.length
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: layout.spacing.headerAfter, line: 240 },
            children: linkRuns(spec.links, THEME, layout),
          }),
        ]
      : []),
  ];
  for (const section of spec.sections) {
    children.push(
      new Paragraph({
        keepNext: true,
        alignment: AlignmentType.CENTER,
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: THEME.accent, space: 4 },
        },
        spacing: {
          before: layout.spacing.sectionBefore,
          after: layout.spacing.sectionAfter,
          line: 240,
        },
        children: [
          new TextRun({
            text: section.heading.toUpperCase(),
            bold: true,
            size: layout.type.sectionHeading,
            font: THEME.font,
            color: THEME.heading,
          }),
        ],
      }),
    );
    children.push(...sectionParagraphs(section, THEME, layout));
  }
  return packV2Document(spec, layout, children);
}
