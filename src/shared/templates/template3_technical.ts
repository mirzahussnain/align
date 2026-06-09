import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat
} from 'docx';
import type { RewrittenCVData } from './types';
import { formatPhone, buildLinkArray } from './utils';

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
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } },
    spacing: { before: 0, after: 80 }
  });
}

function sectionHead(label: string) {
  return [
    new Paragraph({
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
      spacing: { before: 160, after: 0 },
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C_DARK }),
      ]
    }),
    new Paragraph({
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

function entryMeta(text: string) {
  return new Paragraph({
    spacing: { before: 0, after: 50 },
    children: [new TextRun({ text, size: 18, font: "Consolas", color: C_ACCENT2, italics: false })]
  });
}

function bullet(label: string, body: string) {
  return new Paragraph({
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

// ─── DOCUMENT GENERATOR ─────────────────────────────────────────────────────────

export async function generateTechnicalTemplate(data: RewrittenCVData): Promise<Buffer> {
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
            new TextRun({ text: data.fullName.toLowerCase(), bold: true, size: 64, font: "Calibri", color: C_DARK }),
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 50 },
          children: [new TextRun({
            text: data.tagline,
            size: 20, font: "Calibri", color: C_ACCENT
          })]
        }),

        rule(C_ACCENT, 10),

        new Paragraph({
          spacing: { before: 200, after: 60 },
          children: [
            new TextRun({ 
              text: [formatPhone(data.contact.phone), data.contact.location, data.contact.visaStatus].filter(Boolean).join("   //   "), 
              size: 19, font: "Calibri", color: C_SUB 
            })
          ]
        }),
        new Paragraph({
          spacing: { before: 0, after: 120 },
          children: buildLinkArray([
            { url: data.contact.email, type: 'mail' },
            { url: data.contact.github, type: 'github' },
            { url: data.contact.linkedin, type: 'linkedin' },
            { url: data.contact.website, type: 'portfolio' }
          ], "   //   ", "Calibri", 19, C_MUTED, C_MUTED)
        }),
        rule(C_RULE, 4),

        // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────────
        ...(data.professionalSummary ? [
          ...sectionHead("Profile"),
          bodyPara(data.professionalSummary, { justify: true, after: 80 }),
        ] : []),

        // ── EDUCATION ────────────────────────────────────────────────────────────
        ...(data.education && data.education.length > 0 ? [
          ...sectionHead("Education"),
          ...data.education.flatMap(edu => [
            ...entryHead(edu.degree, edu.university, `${edu.startDate} – ${edu.endDate}`),
            ...entryHead(edu.grade, edu.description, "")
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
          ...sectionHead("Experience"),
          ...data.experience.flatMap(exp => [
            ...entryHead(exp.jobTitle, exp.location ? `${exp.company}  ·  ${exp.location}  ·  ${exp.type}` : `${exp.company}  ·  ${exp.type}`, `${exp.startDate} – ${exp.endDate}`),
            ...exp.achievements.map(ach => bullet(ach.label ? `${ach.label}:` : '', ach.body))
          ])
        ] : []),

        // ── CORE SKILLS ───────────────────────────────────────────────────────────
        ...(data.coreSkills && data.coreSkills.length > 0 ? [
          ...sectionHead("Technical Skills"),
          ...data.coreSkills.map(cat => skillRow(cat.category.toLowerCase(), cat.skills))
        ] : []),

        // ── CERTIFICATIONS ────────────────────────────────────────────────────────
        ...(data.certifications && data.certifications.length > 0 ? [
          ...sectionHead("Certifications"),
          ...data.certifications.map(cert => new Paragraph({
            spacing: { before: 60, after: 40 },
            children: [
              new TextRun({ text: cert.name, bold: true, size: 19, font: "Calibri", color: C_DARK }),
              new TextRun({ text: `  /  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C_MUTED })
            ]
          }))
        ] : []),

      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
