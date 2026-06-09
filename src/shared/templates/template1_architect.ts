import {
  Document, Packer, Paragraph, TextRun, TabStopType,
  AlignmentType, BorderStyle, LevelFormat, ExternalHyperlink
} from 'docx';
import type { RewrittenCVData } from './types';
import { formatPhone, buildLinkArray } from './utils';

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
      spacing: sp(140, 0),
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C.navy })
      ]
    }),
    new Paragraph({
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

function projHead(title: string, stack: string, dateStr: string) {
  return [
    new Paragraph({
      spacing: sp(140, 0),
      children: [
        new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C.navy })
      ]
    }),
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
      spacing: sp(20, 28),
      children: [
        new TextRun({ text: "Stack: ", bold: true, size: 19, font: "Calibri", color: C.muted }),
        new TextRun({ text: stack, size: 19, font: "Calibri", color: C.muted, italics: true }),
        new TextRun({ text: "\t" }),
        new TextRun({ text: dateStr, size: 19, font: "Calibri", color: C.muted, italics: true }),
      ]
    }),
  ];
}

function bul(label: string, body: string) {
  return new Paragraph({
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

// ── DOCUMENT GENERATOR ───────────────────────────────────────────────
export async function generateArchitectTemplate(data: RewrittenCVData): Promise<Buffer> {
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
        ...nameBlock(data.fullName, data.tagline),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [
            new TextRun({ 
              text: [formatPhone(data.contact.phone), data.contact.location, data.contact.visaStatus].filter(Boolean).join(" • "), 
              size: 20, font: "Calibri", color: C.muted 
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
          ], " • ", "Calibri", 20, C.muted)
        }),
        rule(40),

        // ── PROFESSIONAL SUMMARY ────────────────────────────
        ...(data.professionalSummary ? [
          ...sectionHead("Professional Summary"),
          new Paragraph({
            spacing: sp(60, 80),
            alignment: AlignmentType.JUSTIFIED,
            children: [new TextRun({
              text: data.professionalSummary,
              size: 19, font: "Calibri", color: C.body
            })]
          })
        ] : []),

        // ── EDUCATION ───────────────────────────────────────
        ...(data.education && data.education.length > 0 ? [
          ...sectionHead("Education"),
          ...data.education.flatMap(edu => [
            ...roleHeader(edu.degree, edu.university, `${edu.startDate} – ${edu.endDate}`, ""),
            new Paragraph({
              spacing: sp(0, 30),
              children: [
                new TextRun({ text: edu.grade, bold: true, size: 19, font: "Calibri", color: C.navy }),
                new TextRun({ text: `  ·  ${edu.description}`, size: 19, font: "Calibri", color: C.body }),
              ]
            })
          ])
        ] : []),

        // ── KEY PROJECTS ─────────────────────────────────────
        ...(data.projects && data.projects.length > 0 ? [
          ...sectionHead("Key Projects"),
          ...data.projects.flatMap(proj => [
            ...projHead(proj.name, proj.stack, `${proj.startDate} – ${proj.endDate}`),
            ...proj.achievements.map(ach => bul(ach.label ? `${ach.label}:` : '', ach.body))
          ])
        ] : []),

        // ── PROFESSIONAL EXPERIENCE ──────────────────────────
        ...(data.experience && data.experience.length > 0 ? [
          ...sectionHead("Professional Experience"),
          ...data.experience.flatMap(exp => [
            ...roleHeader(exp.jobTitle, exp.company, `${exp.startDate} – ${exp.endDate}`, exp.location ? `${exp.location}  ·  ${exp.type}` : exp.type),
            ...exp.achievements.map(ach => bul(ach.label ? `${ach.label}:` : '', ach.body))
          ])
        ] : []),

        // ── CORE SKILLS ──────────────────────────────────────
        ...(data.coreSkills && data.coreSkills.length > 0 ? [
          ...sectionHead("Core Skills"),
          ...data.coreSkills.map(cat => skillRow(`${cat.category}:`, cat.skills))
        ] : []),

        // ── CERTIFICATIONS ───────────────────────────────────
        ...(data.certifications && data.certifications.length > 0 ? [
          ...sectionHead("Certifications"),
          ...data.certifications.map(cert => new Paragraph({
            spacing: sp(60, 36),
            children: [
              new TextRun({ text: cert.name, size: 19, font: "Calibri", color: C.navy }),
              new TextRun({ text: `  ·  ${cert.issuer}, ${cert.year}`, size: 19, font: "Calibri", color: C.muted }),
            ]
          }))
        ] : []),
      ]
    }]
  });

  // Generate buffer
  return await Packer.toBuffer(doc);
}
