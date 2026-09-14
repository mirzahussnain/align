import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat
} from 'docx';
import { buildLinkArray, contactDetailParts, flattenSkills } from './utils';
import { formatDateRangeStyled, type DateDisplayStyle } from '@/shared/utils/date';
import type { CvBuildSpec, CvSectionSpec } from '@/shared/services/cv-build-spec/types';

// ── PALETTE ────────────────────────────────────────────────
const C = {
  navy: "0D2240",   // deep navy — headings, name
  accent: "1B5EA6", // mid blue — section labels, bold labels
  rule: "1B5EA6",   // rule lines
  body: "2E3A47",   // body text
  muted: "5A6673",  // dates, locations, subtitles
  white: "FFFFFF",
};

const CONTENT_W = 9026; // A4 1" margins DXA

// ── HELPERS ────────────────────────────────────────────────
const sp = (before = 0, after = 0) => ({ before, after });

function rule(spaceAfter = 60) {
  return new Paragraph({
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: C.rule, space: 1 } },
    spacing: sp(0, spaceAfter),
  });
}

function nameBlock(name: string, tagline: string) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: sp(0, 30),
      children: [new TextRun({ text: name, bold: true, size: 64, font: "Calibri", color: C.navy })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: sp(0, 50),
      children: [new TextRun({ text: tagline, size: 21, font: "Calibri", color: C.muted, italics: true })]
    }),
  ];
}

function sectionHead(text: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: sp(220, 30),
      children: [
        new TextRun({ text: text.toUpperCase(), bold: true, size: 22, font: "Calibri", color: C.accent })
      ]
    }),
    rule(80),
  ];
}

function roleHeader(title: string, org: string, dateStr: string, locationStr: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: sp(140, 0),
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C.navy })
      ]
    }),
    new Paragraph({
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: sp(20, 30),
      children: [
        new TextRun({ text: locationStr ? `${org}  ·  ${locationStr}` : org, size: 19, font: "Calibri", color: C.accent }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: dateStr, size: 19, font: "Calibri", color: C.muted, italics: true }),
      ]
    })
  ];
}

function projHead(title: string, skills: string, dateStr: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: sp(140, 0),
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C.navy })
      ]
    }),
    new Paragraph({
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: sp(20, 28),
      children: [
        new TextRun({ text: "Skills: ", bold: true, size: 19, font: "Calibri", color: C.muted }),
        new TextRun({ text: skills, size: 19, font: "Calibri", color: C.muted, italics: true }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: dateStr, size: 19, font: "Calibri", color: C.muted, italics: true }),
      ]
    }),
  ];
}

function bul(label: string, body: string) {
  return new Paragraph({
    keepLines: true,
    numbering: { reference: "bul", level: 0 },
    spacing: sp(0, 55),
    children: [
      ...(label ? [new TextRun({ text: label + " ", bold: true, size: 19, font: "Calibri", color: C.navy })] : []),
      new TextRun({ text: body, size: 19, font: "Calibri", color: C.body }),
    ]
  });
}

function skillRow(label: string, value: string) {
  return new Paragraph({
    spacing: sp(0, 40),
    children: [
      new TextRun({ text: label + "  ", bold: true, size: 19, font: "Calibri", color: C.navy }),
      new TextRun({ text: value, size: 19, font: "Calibri", color: C.body }),
    ]
  });
}

// ── SECTION RENDERERS ────────────────────────────────────────────────
// Each renderer lays out ONE planned section using this template's visual
// language. The section's presence, order and heading were decided by the
// content planner — the template only presents.
function renderSection(section: CvSectionSpec, dateStyle: DateDisplayStyle): Paragraph[] {
  switch (section.type) {
    case 'summary':
      return [
        ...sectionHead(section.heading),
        new Paragraph({
          spacing: sp(60, 80),
          alignment: AlignmentType.JUSTIFIED,
          children: [new TextRun({ text: section.text, size: 19, font: "Calibri", color: C.body })],
        }),
      ];
    case 'education':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(edu => [
          ...roleHeader(edu.degree, edu.university, formatDateRangeStyled(edu.startDate, edu.endDate, dateStyle), ""),
          new Paragraph({
            spacing: sp(0, 30),
            children: [
              new TextRun({ text: edu.grade, bold: true, size: 19, font: "Calibri", color: C.navy }),
              new TextRun({ text: `  ·  ${edu.description}`, size: 19, font: "Calibri", color: C.body }),
            ],
          }),
        ]),
      ];
    case 'projects':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(proj => [
          ...projHead(proj.name, proj.skills, formatDateRangeStyled(proj.startDate, proj.endDate, dateStyle)),
          ...proj.achievements.map(ach => bul(ach.label ? `${ach.label}:` : '', ach.body)),
        ]),
      ];
    case 'experience':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(exp => [
          ...roleHeader(exp.jobTitle, exp.company, formatDateRangeStyled(exp.startDate, exp.endDate, dateStyle), exp.location ? `${exp.location}  ·  ${exp.type}` : exp.type),
          ...exp.achievements.map(ach => bul(ach.label ? `${ach.label}:` : '', ach.body)),
        ]),
      ];
    case 'skills':
      return [
        ...sectionHead(section.heading),
        ...(section.layout === 'flat'
          ? [skillRow('Skills:', flattenSkills(section.groups))]
          : section.groups.map(cat => skillRow(`${cat.category}:`, cat.skills))),
      ];
    case 'certifications':
      return [
        ...sectionHead(section.heading),
        ...section.entries.map(cert => new Paragraph({
          spacing: sp(60, 36),
          children: [
            new TextRun({ text: cert.name, size: 19, font: "Calibri", color: C.navy }),
            new TextRun({ text: `  ·  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C.muted }),
          ],
        })),
      ];
  }
}

// ── DOCUMENT GENERATOR ───────────────────────────────────────────────
export async function generateArchitectTemplate(spec: CvBuildSpec): Promise<Buffer> {
  const { identity } = spec;
  const doc = new Document({
    numbering: {
      config: [{
        reference: "bul",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2013",   // en-dash bullet — reads cleanly in ATS
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 480, hanging: 280 } } }
        }]
      }]
    },
    styles: {
      default: { document: { run: { font: "Calibri", size: 19, color: C.body } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1080, right: 1134, bottom: 1080, left: 1134 }
        }
      },
      children: [
        // ── HEADER ──────────────────────────────────────────
        ...nameBlock(identity.fullName, identity.headline),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [
            new TextRun({
              text: contactDetailParts(identity.contact).join(" • "),
              size: 20, font: "Calibri", color: C.muted
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: buildLinkArray([
            { url: identity.contact.email, type: 'mail' },
            { url: identity.contact.github, type: 'github' },
            { url: identity.contact.linkedin, type: 'linkedin' },
            { url: identity.contact.website, type: 'portfolio' }
          ], " • ", "Calibri", 20, C.muted)
        }),
        rule(40),

        // ── PLANNED SECTIONS (order & headings decided by the planner) ──
        ...spec.sections.flatMap((section) => renderSection(section, spec.presentation.dateStyle)),
      ]
    }]
  });

  // Generate buffer
  return await Packer.toBuffer(doc);
}
