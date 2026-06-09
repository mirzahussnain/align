import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat, Table, TableRow, TableCell, WidthType
} from 'docx';
import type { RewrittenCVData } from './types';
import { formatPhone, buildLinkArray } from './utils';

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const A4_WIDTH  = 11906;
const A4_HEIGHT = 16838;
const MARGIN_H  = 1080;   // 0.75 inch
const MARGIN_V  = 1080;   // 0.75 inch
const CONTENT_W = A4_WIDTH - (MARGIN_H * 2); // 9746 DXA

const FONT = "Times New Roman";
const SIZE_BODY = 20; // 10pt
const SIZE_HEAD = 22; // 11pt
const SIZE_NAME = 40; // 20pt

const C_TEXT = "000000";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function sectionRule() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C_TEXT, space: 1 } },
    spacing: { before: 0, after: 60 }
  });
}

function sectionHead(label: string) {
  return [
    new Paragraph({
      spacing: { before: 160, after: 20 },
      children: [
        new TextRun({
          text: label.toUpperCase(),
          bold: true, size: SIZE_HEAD, font: FONT, color: C_TEXT
        })
      ]
    }),
    sectionRule()
  ];
}

function entryLine1(title: string, dates: string) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    spacing: { before: 80, after: 20 },
    children: [
      new TextRun({ text: title, bold: true, size: SIZE_BODY, font: FONT, color: C_TEXT }),
      new TextRun({ text: "\t" }),
      new TextRun({ text: dates, italics: true, size: SIZE_BODY, font: FONT, color: C_TEXT })
    ]
  });
}

function entryLine2(company: string, location: string) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    spacing: { before: 0, after: 40 },
    children: [
      new TextRun({ text: company, italics: true, size: SIZE_BODY, font: FONT, color: C_TEXT }),
      new TextRun({ text: "\t" }),
      new TextRun({ text: location, italics: false, size: SIZE_BODY, font: FONT, color: C_TEXT })
    ]
  });
}

function bullet(body: string, label?: string) {
  return new Paragraph({
    numbering: { reference: "cv-bullets-academic", level: 0 },
    spacing: { after: 40 },
    children: [
      ...(label ? [new TextRun({ text: label + " ", bold: true, size: SIZE_BODY, font: FONT, color: C_TEXT })] : []),
      new TextRun({ text: body, size: SIZE_BODY, font: FONT, color: C_TEXT })
    ]
  });
}

function skillRow(category: string, skills: string) {
  return new Table({
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "auto" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
      left: { style: BorderStyle.NONE, size: 0, color: "auto" },
      right: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
    },
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 40, left: 0, right: 100 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: category, bold: true, size: SIZE_BODY, font: FONT, color: C_TEXT })
                ]
              })
            ]
          }),
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            margins: { top: 0, bottom: 40, left: 0, right: 0 },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: skills, size: SIZE_BODY, font: FONT, color: C_TEXT })
                ]
              })
            ]
          })
        ]
      })
    ]
  });
}

function bodyPara(text: string, opts: { justify?: boolean; before?: number; after?: number; bold?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    alignment: opts.justify ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 80 },
    children: [new TextRun({
      text, size: SIZE_BODY, font: FONT, color: C_TEXT,
      bold: opts.bold || false,
      italics: opts.italics || false
    })]
  });
}

// ─── DOCUMENT GENERATOR ─────────────────────────────────────────────────────────

export async function generateAcademicTemplate(data: RewrittenCVData): Promise<Buffer> {
  const doc = new Document({
    numbering: {
      config: [{
        reference: "cv-bullets-academic",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } }
        }]
      }]
    },
    styles: {
      default: { document: { run: { font: FONT, size: SIZE_BODY, color: C_TEXT } } }
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
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 120 },
          children: [new TextRun({
            text: data.fullName.toUpperCase(),
            bold: true, size: SIZE_NAME, font: FONT, color: C_TEXT
          })]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [
            new TextRun({ 
              text: [formatPhone(data.contact.phone), data.contact.location].filter(Boolean).join(" ⋄ "), 
              size: SIZE_BODY, font: FONT, color: C_TEXT 
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 160 },
          children: buildLinkArray([
            { url: data.contact.email, type: 'mail' },
            { url: data.contact.github, type: 'github' },
            { url: data.contact.linkedin, type: 'linkedin' },
            { url: data.contact.website, type: 'portfolio' }
          ], " ⋄ ", FONT, SIZE_BODY, "0000FF", C_TEXT)
        }),

        // ── PROFESSIONAL SUMMARY ─────────────────────────────────────────────────
        ...(data.professionalSummary ? [
          ...sectionHead("Professional Summary"),
          bodyPara(data.professionalSummary, { justify: true, after: 120 }),
        ] : []),

        // ── EDUCATION ────────────────────────────────────────────────────────────
        ...(data.education && data.education.length > 0 ? [
          ...sectionHead("Education"),
          ...data.education.flatMap(edu => [
            entryLine1(edu.degree, `${edu.startDate} – ${edu.endDate}`),
            entryLine2(edu.university, ""),
            ...(edu.grade || edu.description ? [bodyPara(`Achieved: ${edu.grade} - ${edu.description}`, { after: 120 })] : [])
          ])
        ] : []),

        // ── PROFESSIONAL EXPERIENCE ───────────────────────────────────────────────
        ...(data.experience && data.experience.length > 0 ? [
          ...sectionHead("Professional Experience"),
          ...data.experience.flatMap(exp => [
            entryLine1(exp.jobTitle, `${exp.startDate} - ${exp.endDate}`),
            entryLine2(exp.company, exp.location || ""),
            ...exp.achievements.map(ach => bullet(ach.body, ach.label ? `${ach.label}:` : ''))
          ])
        ] : []),

        // ── SKILLS ───────────────────────────────────────────────────────────
        ...(data.coreSkills && data.coreSkills.length > 0 ? [
          ...sectionHead("Skills"),
          ...data.coreSkills.map(cat => skillRow(cat.category, cat.skills))
        ] : []),

        // ── KEY PROJECTS ─────────────────────────────────────────────────────────
        ...(data.projects && data.projects.length > 0 ? [
          ...sectionHead("Projects"),
          ...data.projects.flatMap(proj => [
            entryLine1(proj.name, `${proj.startDate} – ${proj.endDate}`),
            entryLine2("Personal Project", ""),
            ...proj.achievements.map(ach => bullet(ach.body, ach.label ? `${ach.label}:` : '')),
            bodyPara(`Skills: ${proj.stack}`, { italics: true, after: 160 })
          ])
        ] : []),

        // ── CERTIFICATIONS ────────────────────────────────────────────────────────
        ...(data.certifications && data.certifications.length > 0 ? [
          ...sectionHead("Certifications"),
          ...data.certifications.map(cert => new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
            spacing: { before: 40, after: 120 },
            children: [
              new TextRun({ text: "• ", bold: true, size: SIZE_BODY, font: FONT, color: C_TEXT }),
              new TextRun({ text: cert.name, bold: true, size: SIZE_BODY, font: FONT, color: C_TEXT }),
              new TextRun({ text: ` [${cert.year}]`, size: SIZE_BODY, font: FONT, color: C_TEXT }),
              new TextRun({ text: "\t" }),
              new TextRun({ text: `${cert.issuer}`, italics: true, size: SIZE_BODY, font: FONT, color: C_TEXT })
            ]
          }))
        ] : []),

      ]
    }]
  });

  return await Packer.toBuffer(doc);
}
