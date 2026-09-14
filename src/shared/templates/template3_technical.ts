import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat
} from 'docx';
import { buildLinkArray, contactDetailParts, flattenSkills } from './utils';
import { formatDateRangeStyled, type DateDisplayStyle } from '@/shared/utils/date';
import type { CvBuildSpec, CvSectionSpec } from '@/shared/services/cv-build-spec/types';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const A4_WIDTH  = 11906;
const A4_HEIGHT = 16838;
const MARGIN_H  = 1134;    // ~0.79 inch
const MARGIN_V  = 1008;
const CONTENT_W = A4_WIDTH - (MARGIN_H * 2); // 9638 DXA

const C_ACCENT  = "006D6D";   // Deep teal — technical, calm, distinctive
const C_ACCENT2 = "00A3A3";   // Lighter teal for secondary accents
const C_DARK    = "0F0F0F";
const C_BODY    = "2D2D2D";
const C_SUB     = "4A4A4A";
const C_MUTED   = "808080";
const C_RULE    = "B3E0E0";   // Pale teal rule

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function rule(color = C_RULE, size = 6) {
  return new Paragraph({
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } },
    spacing: { before: 0, after: 80 }
  });
}

function sectionHead(label: string) {
  return [
    new Paragraph({
      keepNext: true,
      border: {
        left: { style: BorderStyle.SINGLE, size: 20, color: C_ACCENT, space: 8 }
      },
      spacing: { before: 260, after: 60 },
      indent: { left: 120 },
      children: [new TextRun({
        text: label.toUpperCase(),
        bold: true, size: 22, font: "Calibri",
        color: C_ACCENT
      })]
    }),
    rule()
  ];
}

function entryHead(title: string, subtitle: string, dates: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 160, after: 0 },
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C_DARK }),
      ]
    }),
    new Paragraph({
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: { before: 20, after: 30 },
      children: [
        ...(subtitle ? [new TextRun({ text: subtitle, size: 19, font: "Calibri", color: C_ACCENT2 })] : []),
        new TextRun({ text: "\t" }),
        new TextRun({ text: dates, size: 19, font: "Calibri", color: C_MUTED })
      ]
    })
  ];
}

function bullet(label: string, body: string) {
  return new Paragraph({
    keepLines: true,
    numbering: { reference: "cv-bullets-3", level: 0 },
    spacing: { after: 65 },
    children: [
      ...(label ? [new TextRun({ text: label + " ", bold: true, size: 19, font: "Calibri", color: C_DARK })] : []),
      new TextRun({ text: body, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function skillRow(category: string, skills: string) {
  return new Paragraph({
    spacing: { before: 0, after: 55 },
    children: [
      new TextRun({ text: category + ":", size: 19, font: "Calibri", color: C_ACCENT, bold: true }),
      new TextRun({ text: "  " + skills, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function bodyPara(text: string, opts: { justify?: boolean; before?: number; after?: number; color?: string; bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 160 },
    children: [new TextRun({
      text, size: 19, font: "Calibri",
      color: opts.color || C_BODY
    })]
  });
}

// ─── SECTION RENDERERS ──────────────────────────────────────────────────────────
// Presentation only: order, presence and headings were decided by the planner.
function renderSection(section: CvSectionSpec, dateStyle: DateDisplayStyle): Paragraph[] {
  switch (section.type) {
    case 'summary':
      return [
        ...sectionHead(section.heading),
        bodyPara(section.text, { justify: true, after: 80 }),
      ];
    case 'education':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(edu => [
          ...entryHead(edu.degree, edu.university, formatDateRangeStyled(edu.startDate, edu.endDate, dateStyle)),
          ...entryHead(edu.grade, edu.description, ""),
        ]),
      ];
    case 'projects':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(proj => [
          ...entryHead(proj.name, `Skills: ${proj.skills}`, formatDateRangeStyled(proj.startDate, proj.endDate, dateStyle)),
          ...proj.achievements.map(ach => bullet(ach.label ? `${ach.label}:` : '', ach.body)),
        ]),
      ];
    case 'experience':
      return [
        ...sectionHead(section.heading),
        ...section.entries.flatMap(exp => [
          ...entryHead(exp.jobTitle, exp.location ? `${exp.company}  ·  ${exp.location}  ·  ${exp.type}` : `${exp.company}  ·  ${exp.type}`, formatDateRangeStyled(exp.startDate, exp.endDate, dateStyle)),
          ...exp.achievements.map(ach => bullet(ach.label ? `${ach.label}:` : '', ach.body)),
        ]),
      ];
    case 'skills':
      return [
        ...sectionHead(section.heading),
        ...(section.layout === 'flat'
          ? [skillRow('skills', flattenSkills(section.groups))]
          : section.groups.map(cat => skillRow(cat.category.toLowerCase(), cat.skills))),
      ];
    case 'certifications':
      return [
        ...sectionHead(section.heading),
        ...section.entries.map(cert => new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({ text: cert.name, bold: true, size: 19, font: "Calibri", color: C_DARK }),
            new TextRun({ text: `  /  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C_MUTED })
          ]
        })),
      ];
  }
}

// ─── DOCUMENT GENERATOR ─────────────────────────────────────────────────────────

export async function generateTechnicalTemplate(spec: CvBuildSpec): Promise<Buffer> {
  const { identity } = spec;
  const doc = new Document({
    numbering: {
      config: [{
        reference: "cv-bullets-3",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u203A",   // › single right-pointing angle — clean, technical
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 380, hanging: 240 } } }
        }]
      }]
    },
    styles: {
      default: { document: { run: { font: "Calibri", size: 19, color: C_BODY } } }
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH, height: A4_HEIGHT },
          margin: { top: MARGIN_V, right: MARGIN_H, bottom: MARGIN_V, left: MARGIN_H }
        }
      },
      children: [
        // ── HEADER ───────────────────────────────────────────────────────────────
        new Paragraph({
          spacing: { before: 0, after: 20 },
          children: [
            new TextRun({ text: identity.fullName.toLowerCase(), bold: true, size: 64, font: "Calibri", color: C_DARK }),
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 50 },
          children: [new TextRun({
            text: identity.headline,
            size: 20, font: "Calibri", color: C_ACCENT
          })]
        }),

        rule(C_ACCENT, 10),

        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [
            new TextRun({
              text: contactDetailParts(identity.contact).join("   //   "),
              size: 19, font: "Calibri", color: C_SUB
            })
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: buildLinkArray([
            { url: identity.contact.email, type: 'mail' },
            { url: identity.contact.github, type: 'github' },
            { url: identity.contact.linkedin, type: 'linkedin' },
            { url: identity.contact.website, type: 'portfolio' }
          ], "   //   ", "Calibri", 19, C_MUTED, C_MUTED)
        }),
        rule(C_RULE, 4),

        // ── PLANNED SECTIONS (order & headings decided by the planner) ──
        ...spec.sections.flatMap((section) => renderSection(section, spec.presentation.dateStyle)),

      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
