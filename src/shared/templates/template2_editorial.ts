import { BorderStyle, Paragraph, TextRun } from 'docx';
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
  accent: '8B4513',
  heading: '302A27',
  body: '403A36',
  font: CV_TEMPLATE_DEFINITIONS.editorial_refined.font,
  dateStyle: 'long_month_year',
};

export async function generateEditorialTemplate(
  spec: CvBuildSpecV2,
  options: CvTemplateRenderOptions = {},
): Promise<Buffer> {
  const layout = layoutFor(
    'editorial_refined',
    spec.presentation.density,
    options.profile ?? 'preferred',
  );
  const contact = [spec.identity.email, spec.identity.phone, spec.identity.location]
    .filter(Boolean)
    .join(' · ');
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
                text: spec.identity.headline,
                italics: true,
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
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 14, color: THEME.accent, space: 1 },
      },
    }),
  ];
  for (const section of spec.sections) {
    children.push(
      new Paragraph({
        keepNext: true,
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D4B896', space: 3 },
        },
        spacing: {
          before: layout.spacing.sectionBefore,
          after: layout.spacing.sectionAfter,
          line: 240,
        },
        children: [
          new TextRun({
            text: '▪  ',
            size: layout.type.sectionHeading,
            font: THEME.font,
            color: THEME.accent,
          }),
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
