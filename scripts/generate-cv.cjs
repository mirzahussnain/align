const {
  Document, Packer, Paragraph, TextRun,
  TabStopType, AlignmentType, BorderStyle, LevelFormat
} = require('docx');
const fs = require('fs');
const path = require('path');

const A4_W = 11906, A4_H = 16838, MAR = 1080;
const CW = A4_W - MAR * 2;

const C_ACCENT = "1B3A6B";
const C_DARK   = "111111";
const C_BODY   = "333333";
const C_SUB    = "555555";
const C_MUTED  = "888888";

function rule(color = C_ACCENT, size = 8) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size, color, space: 1 } },
    spacing: { before: 0, after: 65 }
  });
}

function sectionHead(label) {
  return [
    new Paragraph({
      spacing: { before: 170, after: 32 },
      children: [new TextRun({
        text: label.toUpperCase(),
        bold: true, size: 20, font: "Calibri", color: C_ACCENT
      })]
    }),
    rule()
  ];
}

function entryHead(title, subtitle, dates) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CW }],
    spacing: { before: 130, after: 22 },
    keepNext: true,
    children: [
      new TextRun({ text: title, bold: true, size: 20, font: "Calibri", color: C_DARK }),
      ...(subtitle ? [
        new TextRun({ text: "  |  ", size: 19, font: "Calibri", color: C_MUTED }),
        new TextRun({ text: subtitle, size: 19, font: "Calibri", color: C_SUB })
      ] : []),
      new TextRun({ text: "\t", size: 19 }),
      new TextRun({ text: dates, size: 17, font: "Calibri", color: C_MUTED, italics: true })
    ]
  });
}

function entryMeta(text) {
  return new Paragraph({
    spacing: { before: 0, after: 30 },
    keepNext: true,
    children: [new TextRun({ text, size: 17, font: "Calibri", color: C_MUTED, italics: true })]
  });
}

function bullet(label, body) {
  return new Paragraph({
    numbering: { reference: "cv-bullets", level: 0 },
    spacing: { after: 46 },
    children: [
      ...(label ? [new TextRun({ text: label + " ", bold: true, size: 19, font: "Calibri", color: C_DARK })] : []),
      new TextRun({ text: body, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function skillRow(category, skills) {
  return new Paragraph({
    spacing: { before: 0, after: 44 },
    children: [
      new TextRun({ text: category + ":  ", bold: true, size: 19, font: "Calibri", color: C_DARK }),
      new TextRun({ text: skills, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

function achievementItem(title, detail) {
  return new Paragraph({
    numbering: { reference: "cv-bullets", level: 0 },
    spacing: { after: 44 },
    children: [
      new TextRun({ text: title + " ", bold: true, size: 19, font: "Calibri", color: C_DARK }),
      new TextRun({ text: detail, size: 19, font: "Calibri", color: C_BODY })
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [{
      reference: "cv-bullets",
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: "\u2013",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 360, hanging: 240 } } }
      }]
    }]
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 19, color: C_BODY } } }
  },
  sections: [{
    properties: {
      page: {
        size: { width: A4_W, height: A4_H },
        margin: { top: 860, right: MAR, bottom: 860, left: MAR }
      }
    },
    children: [

      // NAME
      new Paragraph({
        spacing: { before: 0, after: 22 },
        children: [new TextRun({
          text: "Hussnain Ali",
          bold: true, size: 50, font: "Calibri", color: C_ACCENT
        })]
      }),
      new Paragraph({
        spacing: { before: 0, after: 36 },
        children: [new TextRun({
          text: "Forward Deployed Engineer  |  AI-Assisted Development  |  End-to-End Product Delivery",
          size: 19, font: "Calibri", color: C_SUB
        })]
      }),
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: CW }],
        spacing: { before: 0, after: 46 },
        children: [
          new TextRun({ text: "hussnainalix01@gmail.com  |  +44 (0)7737 853800  |  Birmingham, UK  |  Willing to travel to XPS sites", size: 17, font: "Calibri", color: C_MUTED }),
          new TextRun({ text: "\t" }),
          new TextRun({ text: "hussnainali.me  |  github.com/mirzahussnain  |  Right to Work: Graduate Route Visa", size: 17, font: "Calibri", color: C_MUTED })
        ]
      }),
      rule(C_ACCENT, 14),

      // PROFESSIONAL SUMMARY
      ...sectionHead("Professional Summary"),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 46, after: 70 },
        children: [new TextRun({
          text: "Software engineer with development experience spanning BSc Software Engineering (First Class Honours, 2023) through to MSc Computer Science (Distinction, AI, 2025), with open-source contributions, formal employment, and four independently shipped live AI platforms. Works across Python, TypeScript, and Java with deep AI toolchain fluency including RAG pipelines, LLM integration, and AI-assisted development using Claude Code and Cursor. Comfortable working solo with minimal supervision, translating ambiguous business requirements into concrete deployed solutions, and communicating directly with non-technical stakeholders across the full project lifecycle.",
          size: 19, font: "Calibri", color: C_BODY
        })]
      }),

      // PROFESSIONAL EXPERIENCE
      ...sectionHead("Professional Experience"),

      entryHead("Freelance AI Engineer", "Self-Employed", "Oct 2025 \u2013 Present"),
      bullet("Solo End-to-End Delivery:", "Scoped and delivered complete production AI systems independently for non-technical clients \u2014 managing requirements gathering, architecture, implementation, testing, and cloud deployment across the full lifecycle with no senior oversight."),
      bullet("AI-Assisted Development:", "Built production systems using Claude Code and Cursor throughout, combining AI toolchains with Python, FastAPI, Next.js, and Docker to accelerate delivery and focus engineering effort on architecture and business logic."),
      bullet("Stakeholder Translation:", "Translated ambiguous client requirements into concrete technical specifications, communicating complex system decisions in plain language to non-technical business owners and managing revision cycles through to delivery."),

      entryHead("Software Engineer", "NextPak Agile Solutions", "Dec 2023 \u2013 May 2024"),
      bullet("API Performance:", "Implemented RTK Query caching strategy eliminating 30% of redundant API calls and refactored multi-join database queries with Prisma ORM cutting average response time by 20%."),
      bullet("UI Architecture:", "Designed reusable TypeScript component libraries with strict typing reducing UI defect rate by 40% across a 5-developer Agile team."),
      bullet("Security:", "Architected RBAC system securing sensitive client workflows across three distinct user roles with full data isolation."),

      entryHead("Open Source Contributor", "Unicenta POS System", "2021 \u2013 2023"),
      bullet("System Engineering:", "Built a Double Entry Accounting System and custom Report Generator as reusable Java/Maven components integrated into a global open-source POS platform, applying SOLID principles throughout."),
      bullet("Refactoring:", "Reverse-engineered and refactored a legacy Library Management System applying the Factory Design Pattern, improving code maintainability and extensibility."),

      entryHead("Associate Web Developer", "Cosmic365 AI", "Aug 2022 \u2013 Oct 2022"),
      bullet("Backend Debugging:", "Diagnosed and resolved data-fetching race conditions causing a 30% production bug rate and contributed to schema refactoring improving query efficiency by 25%."),

      // KEY PROJECTS
      ...sectionHead("Key Projects"),

      entryHead("Vystra  |  AI-Powered Semantic Search Platform", "", "Nov 2025 \u2013 Feb 2026"),
      entryMeta("Stack: FastAPI  |  Next.js  |  TypeScript  |  pgvector  |  Groq LLM  |  Redis  |  Docker  |  Stripe  |  Cloudflare R2"),
      bullet("End-to-End Delivery:", "Scoped, built, and shipped a full SaaS product independently \u2014 architecture, AI pipeline, Stripe billing, and live deployment with real user traffic and tiered subscriptions, using Claude Code throughout the build."),
      bullet("AI Pipeline:", "Built production RAG pipelines with LLM-generated embeddings and pgvector semantic retrieval, with decoupled ingestion, embedding, and search services as independent deployable modules."),

      entryHead("GreenLedger  |  Compliance-Grade Carbon Accounting Platform", "", "Oct 2025 \u2013 Jan 2026"),
      entryMeta("Stack: FastAPI  |  PostgreSQL  |  Tesseract OCR  |  Pydantic  |  SQLAlchemy  |  Alembic  |  Docker  |  Azure"),
      bullet("Regulated-Adjacent Pipeline:", "Built an OCR-driven extraction pipeline converting unstructured operational documents into structured, audit-ready ESG metrics using UK Government DEFRA emission factors, with full audit trail for compliance \u2014 directly analogous to data governance work in financial services."),
      bullet("Cloud Deployment:", "Containerised with Docker and deployed to Microsoft Azure with UK data residency, demonstrating Azure deployment in a compliance-sensitive context."),

      entryHead("CereSafe  |  Clinical Risk Prediction Platform", "", "Mar 2025 \u2013 Oct 2025"),
      entryMeta("Stack: FastAPI  |  Python (scikit-learn, CatBoost)  |  Next.js  |  Supabase  |  Docker"),
      bullet("Production AI System:", "Trained and deployed ML classification models delivering real-time risk predictions with confidence scores, with RBAC-protected dashboards enabling practitioners to review and override outputs."),

      entryHead("CogniBeat  |  AI-Powered Deep Work Engine", "", "2026"),
      entryMeta("Stack: Next.js  |  TypeScript  |  Python  |  Prototype \u2014 active development"),
      bullet("Concept and Build:", "Designing an AI system that orchestrates real-time context-aware auditory environments to maximise focus, combining Python audio processing with a Next.js frontend. Currently in prototype stage with plans for live deployment."),

      entryHead("NEXUS  |  Intelligent Property Management Platform", "", "Jan 2026 \u2013 Feb 2026"),
      entryMeta("Stack: React Native  |  Next.js  |  Spring Boot (Java)  |  FastAPI  |  SpaCy  |  NeonDB"),
      bullet("NLP Automation:", "Built SpaCy-powered ticket triage system auto-classifying maintenance requests by category and urgency, eliminating manual administrative overhead and demonstrating applied NLP for business process automation."),

      // EDUCATION
      ...sectionHead("Education"),
      entryHead("MSc Computer Science and Technology (AI Focused)", "Ulster University, UK", "Sept 2024 \u2013 Oct 2025"),
      new Paragraph({
        spacing: { before: 0, after: 34 },
        children: [
          new TextRun({ text: "Distinction", bold: true, size: 19, font: "Calibri", color: C_DARK }),
          new TextRun({ text: "  |  AI-focused programme covering machine learning, data engineering, and intelligent systems. Independently built and shipped four production-grade AI platforms during the programme.", size: 19, font: "Calibri", color: C_BODY })
        ]
      }),
      entryHead("BSc Software Engineering", "Capital University of Science and Technology, Pakistan", "Sept 2019 \u2013 Jul 2023"),
      new Paragraph({
        spacing: { before: 0, after: 70 },
        children: [
          new TextRun({ text: "First Class Honours, 3.82/4.0 GPA", bold: true, size: 19, font: "Calibri", color: C_DARK }),
          new TextRun({ text: "  |  UK equivalent: First Class Honours. Software architecture, algorithms, OOP, and database design. Open-source Java/Maven contributions to Unicenta POS.", size: 19, font: "Calibri", color: C_BODY })
        ]
      }),

      // CORE SKILLS
      ...sectionHead("Core Skills"),
      skillRow("AI and Dev Tooling", "Claude Code, Cursor, RAG pipelines, LLM integration (Groq), pgvector, LangChain, scikit-learn, CatBoost, SpaCy, OCR (Tesseract)"),
      skillRow("Languages", "Python, TypeScript, JavaScript, Java, SQL"),
      skillRow("Backend and Data", "FastAPI, Node.js, Spring Boot (Java), REST APIs, WebSockets, Redis, RabbitMQ, SQLAlchemy, Prisma"),
      skillRow("Cloud and DevOps", "Microsoft Azure, Docker, CI/CD, Vercel, Cloudflare R2, Git, GitHub, Agile and Scrum"),
      skillRow("Frontend", "React.js, Next.js (App Router), React Native, Tailwind CSS, Redux, RTK Query"),
      skillRow("Databases", "PostgreSQL, pgvector, MongoDB, MySQL, Supabase, NeonDB, Azure CosmosDB"),

      // ACHIEVEMENTS
      ...sectionHead("Achievements and Extracurriculars"),
      achievementItem("First Place \u2014 D.I.E Project Award:", "Led the web development workstream on a team project building reusable plug-and-play business domain components for open-source software integration, winning first position in a component-based development competition during BSc at CUST."),
      achievementItem("Web Development Lead \u2014 Google Student Developer Club:", "Served as Web Development Team Lead, planning and conducting technical workshops for student developers at CUST alongside core team members."),

      // CERTIFICATIONS
      ...sectionHead("Certifications"),
      new Paragraph({
        spacing: { before: 46, after: 32 },
        children: [
          new TextRun({ text: "Meta Front-End Developer Professional Certificate", bold: true, size: 19, font: "Calibri", color: C_DARK }),
          new TextRun({ text: "  |  Coursera (Meta), 2023", size: 17, font: "Calibri", color: C_MUTED })
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new TextRun({ text: "Developing Front-End Apps with React", bold: true, size: 19, font: "Calibri", color: C_DARK }),
          new TextRun({ text: "  |  Coursera (IBM), 2023", size: 17, font: "Calibri", color: C_MUTED })
        ]
      }),
    ]
  }]
});

const outDir = path.join(__dirname, '..', 'output');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'hussnain_ali_cv_xps_v2.docx');

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log('CV written to: ' + outPath);
});
