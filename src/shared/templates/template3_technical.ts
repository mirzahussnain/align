import { AlignmentType, BorderStyle, Paragraph, TextRun } from 'docx';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import { CV_TEMPLATE_DEFINITIONS } from '@/shared/constants/templates';
import { layoutFor, type CvTemplateRenderOptions } from './layout';
import {
  linkRuns,
  packV2Document,
  sectionParagraphs,
  type V2TemplateTheme,
} from './v2-shared';

const THEME: V2TemplateTheme = {
  accent: '087E8B',
  heading: '1F2933',
  body: '334155',
  font: CV_TEMPLATE_DEFINITIONS.technical_precision.font,
  dateStyle: 'numeric_month_year',
};

export async function generateTechnicalTemplate(
  spec: CvBuildSpecV2,
  options: CvTemplateRenderOptions = {},
): Promise<Buffer> {
  const layout = layoutFor(
    'technical_precision',
    spec.presentation.density,
    options.profile ?? 'preferred',
  );
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location]
    .filter(Boolean)
    .join(' | ');
  const children: Paragraph[] = [
    new Paragraph({
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
            spacing: { after: layout.spacing.headlineAfter, line: 240 },
            children: [
              new TextRun({
                text: spec.identity.headline.toUpperCase(),
                bold: true,
                size: layout.type.headline,
                font: THEME.font,
                color: THEME.accent,
              }),
            ],
          }),
        ]
      : []),
    ...(contact
      ? [
          new Paragraph({
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
        alignment: AlignmentType.LEFT,
        border: {
          left: { style: BorderStyle.SINGLE, size: 20, color: THEME.accent, space: 8 },
          bottom: { style: BorderStyle.SINGLE, size: 6, color: 'B3E0E0', space: 2 },
        },
        indent: { left: layout.sectionIndent },
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
            color: THEME.accent,
          }),
        ],
      }),
    );
    children.push(...sectionParagraphs(section, THEME, layout));
  }
  return packV2Document(spec, layout, children);
}
