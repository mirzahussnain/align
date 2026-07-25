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
const MARGIN_H  = 1260;   // ~0.875 inch sides
const MARGIN_V  = 1080;
const CONTENT_W = A4_WIDTH - (MARGIN_H * 2); // 9386 DXA

const C_NAME    = "2C2C2C";   // Near-black for name
const C_ACCENT  = "8B4513";   // Warm sienna — distinctive, professional
const C_DARK    = "1E1E1E";
const C_BODY    = "3A3A3A";
const C_MUTED   = "909090";
const C_RULE    = "D4B896";   // Warm tan rule

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function thinRule() {
  return new Paragraph({
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C_RULE, space: 1 } },
    spacing: { before: 0, after: 100 }
  });
}

function thickRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: C_ACCENT, space: 1 } },
    spacing: { before: 0, after: 0 }
  });
}

function sectionHead(label: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 260, after: 60 },
      children: [
        new TextRun({ text: "\u25AA  ", size: 22, font: "Calibri", color: C_ACCENT }),
        new TextRun({
          text: label.toUpperCase(),
          bold: true, size: 22, font: "Calibri", color: C_DARK
        })
      ]
    }),
    thinRule()
  ];
}

function entryHead(title: string, subtitle: string, dates: string) {
  return [
    new Paragraph({
      keepNext: true,
      spacing: { before: 170, after: 0 },
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C_DARK }),
      ]
    }),
    new Paragraph({
      keepNext: true,
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: { before: 20, after: 30 },
      children: [
        ...(subtitle ? [new TextRun({ text: subtitle, size: 19, font: "Calibri", color: C_ACCENT })] : []),
        new TextRun({ text: "\t" }),
        new TextRun({ text: dates, size: 19, font: "Calibri", color: C_MUTED, italics: true })
      ]
    })
  ];
}

function entryMeta(text: string) {
  return new Paragraph({
    spacing: { before: 0, after: 50 },
    children: [new TextRun({ text, size: 19, font: "Calibri", color: C_MUTED, italics: true })]
  });
}

function bullet(label: string, body: string) {
  return new Paragraph({
    keepLines: true,
    numbering: { reference: "cv-bullets-2", level: 0 },
    spacing: { after: 65 },
    children: [
      ...(label ? [new TextRun({ text: label + " ", bold: true, size: 19, font: "Calibri", color: C_ACCENT })] : []),
      new TextRun({ text: body, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function skillRow(category: string, skills: string) {
  return new Paragraph({
    spacing: { before: 0, after: 55 },
    children: [
      new TextRun({ text: category + ":  ", bold: true, size: 19, font: "Calibri", color: C_DARK }),
      new TextRun({ text: skills, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function bodyPara(text: string, opts: { justify?: boolean; before?: number; after?: number; color?: string; bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 160 },
    children: [new TextRun({
      text, size: 19, font: "Calibri",
      color: opts.color || C_BODY,
      bold: opts.bold || false,
      italics: opts.italics || false
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
          entryMeta(`${edu.grade}  ·  ${edu.description}`),
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
          ? [skillRow('Skills', flattenSkills(section.groups))]
          : section.groups.map(cat => skillRow(cat.category, cat.skills))),
      ];
    case 'certifications':
      return [
        ...sectionHead(section.heading),
        ...section.entries.map(cert => new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({ text: cert.name, bold: true, size: 19, font: "Calibri", color: C_DARK }),
            new TextRun({ text: `  ·  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C_MUTED })
          ]
        })),
      ];
  }
}

// ─── DOCUMENT GENERATOR ─────────────────────────────────────────────────────────

export async function generateEditorialTemplate(spec: CvBuildSpec): Promise<Buffer> {
  const { identity } = spec;
  const doc = new Document({
    numbering: {
      config: [{
        reference: "cv-bullets-2",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u25AA",   // small square — editorial feel, ATS safe
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 420, hanging: 280 } } }
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
        thickRule(),
        new Paragraph({ spacing: { before: 100, after: 0 }, children: [] }),

        new Paragraph({
          spacing: { before: 0, after: 20 },
          children: [new TextRun({
            text: identity.fullName,
            bold: true, size: 64, font: "Calibri", color: C_NAME
          })]
        }),
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: identity.headline,
            size: 20, font: "Calibri", color: C_ACCENT, bold: false
          })]
        }),
        thinRule(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 80 },
          children: [
            new TextRun({
              text: contactDetailParts(identity.contact).join("  |  "),
              size: 20, font: "Calibri", color: C_ACCENT, bold: true
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: buildLinkArray([
            { url: identity.contact.email, type: 'mail' },
            { url: identity.contact.github, type: 'github' },
            { url: identity.contact.linkedin, type: 'linkedin' },
            { url: identity.contact.website, type: 'portfolio' }
          ], "  |  ", "Calibri", 20, C_ACCENT, C_ACCENT)
        }),
        thinRule(),

        // ── PLANNED SECTIONS (order & headings decided by the planner) ──
        ...spec.sections.flatMap((section) => renderSection(section, spec.presentation.dateStyle)),
      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
