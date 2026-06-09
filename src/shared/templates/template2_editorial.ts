import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat
} from 'docx';
import type { RewrittenCVData } from './types';
import { formatPhone, buildLinkArray } from './utils';

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
const C_SUB     = "5C5C5C";
const C_MUTED   = "909090";
const C_RULE    = "D4B896";   // Warm tan rule

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function thinRule() {
  return new Paragraph({
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
      spacing: { before: 170, after: 0 },
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C_DARK }),
      ]
    }),
    new Paragraph({
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

// ─── DOCUMENT GENERATOR ─────────────────────────────────────────────────────────

export async function generateEditorialTemplate(data: RewrittenCVData): Promise<Buffer> {
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
            text: data.fullName,
            bold: true, size: 64, font: "Calibri", color: C_NAME
          })]
        }),
        new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: data.tagline,
            size: 20, font: "Calibri", color: C_ACCENT, bold: false
          })]
        }),
        thinRule(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 80 },
          children: [
            new TextRun({ 
              text: [formatPhone(data.contact.phone), data.contact.location, data.contact.visaStatus].filter(Boolean).join("  |  "), 
              size: 20, font: "Calibri", color: C_ACCENT, bold: true 
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: buildLinkArray([
            { url: data.contact.email, type: 'mail' },
            { url: data.contact.github, type: 'github' },
            { url: data.contact.linkedin, type: 'linkedin' },
            { url: data.contact.website, type: 'portfolio' }
          ], "  |  ", "Calibri", 20, C_ACCENT, C_ACCENT)
        }),
        thinRule(),

        // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────────
        ...(data.professionalSummary ? [
          ...sectionHead("Professional Summary"),
          bodyPara(data.professionalSummary, { justify: true, after: 80 }),
        ] : []),

        // ── EDUCATION ────────────────────────────────────────────────────────────
        ...(data.education && data.education.length > 0 ? [
          ...sectionHead("Education"),
          ...data.education.flatMap(edu => [
            ...entryHead(edu.degree, edu.university, `${edu.startDate} – ${edu.endDate}`),
            entryMeta(`${edu.grade}  ·  ${edu.description}`)
          ])
        ] : []),

        // ── KEY PROJECTS ─────────────────────────────────────────────────────────
        ...(data.projects && data.projects.length > 0 ? [
          ...sectionHead("Key Projects"),
          ...data.projects.flatMap(proj => [
            ...entryHead(proj.name, `Stack: ${proj.stack}`, `${proj.startDate} – ${proj.endDate}`),
            ...proj.achievements.map(ach => bullet(ach.label ? `${ach.label}:` : '', ach.body))
          ])
        ] : []),

        // ── PROFESSIONAL EXPERIENCE ───────────────────────────────────────────────
        ...(data.experience && data.experience.length > 0 ? [
          ...sectionHead("Professional Experience"),
          ...data.experience.flatMap(exp => [
            ...entryHead(exp.jobTitle, exp.location ? `${exp.company}  ·  ${exp.location}  ·  ${exp.type}` : `${exp.company}  ·  ${exp.type}`, `${exp.startDate} – ${exp.endDate}`),
            ...exp.achievements.map(ach => bullet(ach.label ? `${ach.label}:` : '', ach.body))
          ])
        ] : []),

        // ── CORE SKILLS ───────────────────────────────────────────────────────────
        ...(data.coreSkills && data.coreSkills.length > 0 ? [
          ...sectionHead("Core Skills"),
          ...data.coreSkills.map(cat => skillRow(cat.category, cat.skills))
        ] : []),

        // ── CERTIFICATIONS ────────────────────────────────────────────────────────
        ...(data.certifications && data.certifications.length > 0 ? [
          ...sectionHead("Certifications"),
          ...data.certifications.map(cert => new Paragraph({
            spacing: { before: 60, after: 40 },
            children: [
              new TextRun({ text: cert.name, bold: true, size: 19, font: "Calibri", color: C_DARK }),
              new TextRun({ text: `  ·  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C_MUTED })
            ]
          }))
        ] : []),

      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
