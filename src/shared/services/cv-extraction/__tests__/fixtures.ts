import JSZip from 'jszip';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';

/**
 * Real .docx fixtures from two different producers.
 *
 * One producer is not enough to trust a DOCX extractor. Word, LibreOffice and
 * library writers all emit valid WordprocessingML with different part layouts,
 * different namespace declarations and different ways of expressing the same
 * list or table, and an extractor that only ever sees one of them passes its
 * tests while failing on half of real uploads. So:
 *
 *   - `docxFromDocxLibrary` is produced by the `docx` npm package (already a
 *     dependency, used for CV generation), giving genuinely library-shaped XML;
 *   - `docxFromHandBuiltOoxml` is assembled part-by-part in the shape a desktop
 *     word processor emits — a `w:` namespace declared on the root, a table with
 *     `w:tbl`/`w:tr`/`w:tc`, and numbered list paragraphs carrying `w:numPr`.
 *
 * Both are real ZIP archives with real OOXML inside, so the signature check, the
 * WordprocessingML probe and mammoth all see exactly what a browser upload sends.
 */

export async function docxFromDocxLibrary(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Amara Okafor', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Manchester, United Kingdom' }),
          new Paragraph({ text: 'amara.okafor@example.com | +44 7700 900123' }),
          new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            children: [
              new TextRun('Registered nurse with eight years of acute medical experience '),
              new TextRun('across NHS trusts in the North West.'),
            ],
          }),
          new Paragraph({ text: 'WORK EXPERIENCE', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Senior Staff Nurse at Manchester Royal Infirmary, Mar 2021 - Present' }),
          new Paragraph({ text: 'Led a bay of eight acute medical beds on night shifts.', bullet: { level: 0 } }),
          new Paragraph({ text: 'Mentored six newly qualified nurses through preceptorship.', bullet: { level: 0 } }),
          new Paragraph({ text: 'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021' }),
          new Paragraph({ text: 'Delivered care on a 28-bed respiratory ward.', bullet: { level: 0 } }),
          new Paragraph({ text: 'EDUCATION', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'BSc (Hons) Adult Nursing at University of Salford, 2014 - 2017' }),
          new Paragraph({ text: 'SKILLS', heading: HeadingLevel.HEADING_2 }),
          // A table, because plenty of CVs lay their skills out in one.
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Clinical: Venepuncture, Cannulation')] }),
                  new TableCell({ children: [new Paragraph('Systems: EPR, SystmOne')] }),
                ],
              }),
            ],
          }),
          new Paragraph({ text: 'LANGUAGES', heading: HeadingLevel.HEADING_2, alignment: AlignmentType.LEFT }),
          new Paragraph({ text: 'English (Native), Igbo (Fluent)' }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

/** A semantic DOCX fixture exercising the structures Mammoth exposes as HTML. */
export async function docxStructuredContent(): Promise<Buffer> {
  const document = new Document({
    numbering: {
      config: [
        {
          reference: 'ordered-items',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
            },
          ],
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ text: 'STRUCTURED CV', heading: HeadingLevel.HEADING_2 }),
          new Paragraph('Ordinary body paragraph'),
          new Paragraph({ children: [new TextRun({ text: 'Whole bold paragraph', bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: 'Whole italic paragraph', italics: true })] }),
          new Paragraph({ text: 'Parent bullet', bullet: { level: 0 } }),
          new Paragraph({ text: 'Nested bullet', bullet: { level: 1 } }),
          new Paragraph({ text: 'First numbered item', numbering: { reference: 'ordered-items', level: 0 } }),
          new Paragraph({ text: 'Second numbered item', numbering: { reference: 'ordered-items', level: 0 } }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Left cell')] }),
                  new TableCell({ children: [new Paragraph('Right cell')] }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new ExternalHyperlink({
                children: [new TextRun('Portfolio')],
                link: 'https://example.com/portfolio',
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

/**
 * A .docx whose contact details live in the page HEADER, with clickable labels.
 *
 * mammoth walks `word/document.xml` only, so before header support this document
 * extracted with no name, no phone and no links at all. It also puts a project in
 * a TABLE with its repository and demo links as separate labelled anchors, which
 * is the other layout that lost its URLs.
 */
export async function docxWithHeaderAndHyperlinks(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({ text: 'Priya Raman' }),
              // Email and phone on ONE line, with a bracketed trunk zero: the
              // most common contact layout there is, and the one the old
              // "skip any line with an email on it" rule read no phone from.
              new Paragraph({ text: 'priya.raman@example.com | +44 (0)7426 123456' }),
              new Paragraph({
                children: [
                  new ExternalHyperlink({
                    children: [new TextRun('LinkedIn')],
                    link: 'https://www.linkedin.com/in/priya-raman',
                  }),
                  new TextRun(' | '),
                  new ExternalHyperlink({
                    children: [new TextRun('GitHub')],
                    link: 'https://github.com/priyaraman',
                  }),
                  new TextRun(' | '),
                  new ExternalHyperlink({
                    children: [new TextRun('Portfolio')],
                    link: 'https://priyaraman.dev',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph('Confidential footer')] }),
        },
        children: [
          new Paragraph({ text: 'PROFESSIONAL SUMMARY', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            text: 'Backend engineer with six years building payment and reconciliation systems.',
          }),
          new Paragraph({ text: 'PROJECTS & PORTFOLIO', heading: HeadingLevel.HEADING_2 }),
          new Table({
            rows: [
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph('Ledger Reconciliation Tool')] }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new ExternalHyperlink({
                            children: [new TextRun('Repo')],
                            link: 'https://github.com/priyaraman/ledger-tool',
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun('Invoice Matcher '),
              new ExternalHyperlink({
                children: [new TextRun('Live demo')],
                link: 'https://invoice-matcher.example.com',
              }),
            ],
          }),
          new Paragraph({ text: 'Matched 40,000 invoices a day against bank statements.' }),
          new Paragraph({ text: 'WORK EXPERIENCE', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ text: 'Backend Engineer at Fintra Ltd, Jan 2019 - Dec 2023' }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function paragraph(text: string, options: { numbered?: boolean } = {}): string {
  const numbering = options.numbered
    ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
    : '';
  return `<w:p>${numbering}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function tableRow(cells: string[]): string {
  return `<w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr>`;
}

/** `<w:hyperlink r:id="…">label</w:hyperlink>` — the element form. */
function hyperlink(relationshipId: string, label: string): string {
  return `<w:hyperlink r:id="${relationshipId}"><w:r><w:t>${label}</w:t></w:r></w:hyperlink>`;
}

/**
 * A link stored as a FIELD rather than an element. Word writes these when a link
 * is inserted in certain ways, and they carry no relationship id — so nothing
 * that resolves `r:id` finds the address, even though it is in the XML.
 */
function fieldHyperlink(url: string, label: string): string {
  return (
    '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
    `<w:r><w:instrText xml:space="preserve"> HYPERLINK "${url}" </w:instrText></w:r>` +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
    `<w:r><w:t>${label}</w:t></w:r>` +
    '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
  );
}

/**
 * A .docx whose left-hand column is a TEXT BOX and whose portfolio link is a
 * field code.
 *
 * Both are invisible to a body-paragraph walk: two-column CV templates routinely
 * put the name, contact block and skills inside a floating text box, and a
 * field-code link has no `r:id` for an anchor handler to follow. Before this,
 * such a document extracted with no name, no contact details and no links.
 */
export async function docxWithTextBoxAndFieldLink(): Promise<Buffer> {
  const textBox =
    '<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>' +
    paragraph('Nadia Haddad') +
    paragraph('nadia.haddad@example.com') +
    `<w:p>${hyperlink('rId10', 'LinkedIn')}<w:r><w:t> | </w:t></w:r>${hyperlink('rId11', 'GitHub')}</w:p>` +
    '</w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>';

  const body = [
    textBox,
    // A field-code link still inside the contact area, so this also proves the
    // recovered address is classified — it has to become the personal website.
    `<w:p><w:r><w:t xml:space="preserve">Portfolio: </w:t></w:r>${fieldHyperlink('https://nadiahaddad.dev', 'see my work')}</w:p>`,
    paragraph('CORE SKILLS'),
    paragraph('Python, Django, PostgreSQL'),
    paragraph('PROFESSIONAL SUMMARY'),
    paragraph('Backend engineer with nine years in public-sector data platforms.'),
    paragraph('EXPERIENCE'),
    paragraph('Lead Engineer at Civic Data Ltd, Feb 2020 - Present'),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://www.linkedin.com/in/nadia-haddad" TargetMode="External"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://github.com/nadiahaddad" TargetMode="External"/>
</Relationships>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', ROOT_RELS);
  zip.folder('word')!.file('document.xml', documentXml);
  zip.folder('word')!.folder('_rels')!.file('document.xml.rels', documentRels);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export async function docxFromHandBuiltOoxml(): Promise<Buffer> {
  const body = [
    paragraph('Tomasz Nowak'),
    paragraph('Software Engineer'),
    paragraph('tomasz.nowak@example.com'),
    paragraph('EXPERIENCE'),
    paragraph('Backend Engineer — Fintra Ltd, January 2019 to December 2023'),
    paragraph('Rebuilt the payments ledger service.', { numbered: true }),
    paragraph('Cut median API latency from 400ms to 90ms.', { numbered: true }),
    paragraph('KEY PROJECTS'),
    paragraph('Ledger Reconciliation Tool, 2022'),
    paragraph('Reconciled 2m daily transactions against bank statements.', { numbered: true }),
    paragraph('TECHNICAL SKILLS'),
    `<w:tbl>${tableRow(['Languages: TypeScript, Go', 'Cloud: AWS, Terraform'])}</w:tbl>`,
    paragraph('CERTIFICATIONS'),
    paragraph('AWS Certified Solutions Architect — Amazon Web Services, 2022'),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

  const zip = new JSZip();
  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.folder('_rels')!.file('.rels', ROOT_RELS);
  zip.folder('word')!.file('document.xml', documentXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * A line of a PDF fixture. A `url` turns the whole line into a clickable link
 * whose visible text is the label — the shape a CV takes when it writes
 * "LinkedIn" or "Repository" rather than printing the address.
 */
export interface PdfLine {
  text: string;
  url?: string;
}

/** A minimal but genuinely valid PDF with a text layer, and optional link annotations. */
export function minimalPdf(lines: (string | PdfLine)[]): Buffer {
  const entries: PdfLine[] = lines.map((line) => (typeof line === 'string' ? { text: line } : line));
  const escaped = entries.map((line) => line.text.replace(/([()\\])/g, '\\$1'));
  const content =
    'BT /F1 12 Tf 72 720 Td 14 TL\n' +
    escaped.map((line) => `(${line}) Tj T*`).join('\n') +
    '\nET';

  // Text starts at y=720 and each `T*` steps down by the 14pt leading, so a
  // line's baseline is known exactly. The rectangle spans the full text column
  // rather than being fitted to the glyphs: pdf.js decides a link's overlaid
  // text by which text items fall inside the rect, and a rect measured from
  // assumed glyph widths would drift and make the fixture flaky.
  const annotations = entries
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.url)
    .map(({ line, index }) => {
      const baseline = 720 - 14 * index;
      return (
        `<< /Type /Annot /Subtype /Link /Rect [70 ${baseline - 3} 540 ${baseline + 11}] ` +
        `/Border [0 0 0] /A << /S /URI /URI (${line.url!.replace(/([()\\])/g, '\\$1')}) >> >>`
      );
    });

  // Object numbering: 1–5 are the fixed document objects, annotations follow.
  const annotRefs = annotations.map((_, index) => `${6 + index} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      (annotations.length ? `/Annots [${annotRefs}] ` : '') +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...annotations,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'binary');
}

interface PositionedPdfLine {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
}

function positionedPdf(lines: PositionedPdfLine[], annotations: string[] = []): Buffer {
  const content = lines
    .map(({ text, x, y, fontSize = 12 }) => {
      const escaped = text.replace(/([()\\])/g, '\\$1');
      return `BT /F1 ${fontSize} Tf 1 0 0 1 ${x} ${y} Tm (${escaped}) Tj ET`;
    })
    .join('\n');
  const annotationRefs = annotations.map((_, index) => `${6 + index} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      (annotations.length ? `/Annots [${annotationRefs}] ` : '') +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...annotations,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

/** Two recurring x bands whose content operators deliberately alternate right/left. */
export function twoColumnPdf(): Buffer {
  return positionedPdf([
    { text: 'Right one', x: 330, y: 720 },
    { text: 'Left one', x: 72, y: 720 },
    { text: 'Right two', x: 330, y: 700 },
    { text: 'Left two', x: 72, y: 700 },
    { text: 'Right three', x: 330, y: 680 },
    { text: 'Left three', x: 72, y: 680 },
    { text: 'Right four', x: 330, y: 660 },
    { text: 'Left four', x: 72, y: 660 },
  ]);
}

/** A valid one-page PDF with no text layer, matching a raster-only upload. */
export function emptyPdf(): Buffer {
  return positionedPdf([]);
}

/** A link annotation placed far away from the page's only text block. */
export function pdfWithUnplacedLink(): Buffer {
  return positionedPdf(
    [{ text: 'Visible text', x: 72, y: 720 }],
    [
      '<< /Type /Annot /Subtype /Link /Rect [500 40 590 60] /Border [0 0 0] ' +
        '/A << /S /URI /URI (https://example.com/unplaced) >> >>',
    ]
  );
}

/**
 * A fillable PDF: the contact details are AcroForm field VALUES and the text
 * layer holds only the blank labels.
 *
 * Application forms and a few CV templates are built this way, and everything
 * the person typed lives outside the text layer — so before form-field support
 * this document extracted as a page of empty prompts.
 */
export function pdfWithFormFields(): Buffer {
  const lines = ['Candidate details', 'Full name:', 'Email:', 'Phone:', 'WORK EXPERIENCE', 'Care Assistant at Ashwood House, Jan 2021 - Present'];
  const content =
    'BT /F1 12 Tf 72 720 Td 14 TL\n' + lines.map((line) => `(${line}) Tj T*`).join('\n') + '\nET';

  // Fields are declared out of reading order on purpose: the extractor sorts
  // them by page and position, so a dictionary that lists the phone first must
  // still produce name, email, phone.
  const fields = [
    { name: 'phone', value: '+44 7426 123456', rect: [200, 664, 400, 680] },
    { name: 'full name', value: 'Rosa Mehta', rect: [200, 692, 400, 708] },
    { name: 'email', value: 'rosa.mehta@example.com', rect: [200, 678, 400, 694] },
  ];

  const fieldRefs = fields.map((_, index) => `${6 + index} 0 R`).join(' ');
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${fieldRefs}] >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Annots [${fieldRefs}] ` +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...fields.map(
      (field) =>
        `<< /Type /Annot /Subtype /Widget /FT /Tx /T (${field.name}) /V (${field.value}) ` +
        `/Rect [${field.rect.join(' ')}] /F 4 >>`
    ),
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, 'binary');
}

/**
 * A sanitised regression fixture of the CV that exposed this whole class of
 * defect.
 *
 * Same shape, real details replaced. Every failure it caused is represented:
 * LinkedIn, GitHub and portfolio as clickable labels with no address in the text
 * layer; a "PROFILE" summary heading; an international phone written with a
 * hyphen inside the national part; and a project with no dates whose repository
 * link is an annotation. The original CV is a real person's and is not committed.
 */
export function realWorldPdfCv(): Buffer {
  return minimalPdf([
    'Jordan Reyes',
    'IT Support Technician | Service Desk | Technical Support',
    '+44 7737-853800 | Birmingham, United Kingdom',
    'jordan.reyes@example.com',
    { text: 'github/jordanreyes', url: 'https://github.com/jordanreyes' },
    { text: 'linkedIn/jordanreyes-dev', url: 'https://linkedin.com/in/jordan-reyes-dev' },
    { text: 'jordanreyes.me', url: 'https://jordanreyes.me/' },
    'PROFILE',
    'IT Support professional with an MSc in Computer Science and hands-on experience providing',
    'first-line technical support, troubleshooting hardware, software and network issues.',
    'TECHNICAL SKILLS',
    'Operating Systems: Windows 10/11, Ubuntu, Linux',
    'Networking: TCP/IP, DNS, DHCP, VPN',
    'EXPERIENCE',
    'Teaching Assistant at Ulster University, Oct 2024 - March 2025',
    'Provided first-line technical support to students during computing laboratories.',
    'EDUCATION',
    // Degree and dates on one line, institution and grade on the next — the
    // layout that produced two MISSING_REQUIRED_FIELD conflicts on a CV that
    // plainly names both universities.
    // ASCII only: `minimalPdf` writes its content stream as latin1 against the
    // base Helvetica font, so an en-dash or a middle dot would reach the text
    // layer as a control byte. The typographic spellings are covered by the
    // parser tests, which take text directly.
    'MSc Computer Science & Technology (AI) Sept 2024 - Oct 2025',
    'Ulster University, UK | Distinction, machine learning and intelligent systems',
    'BSc Software Engineering Sept 2019 - Jul 2023',
    'Northgate Institute of Technology, Pakistan | First Class Honours, 3.82/4.0 GPA',
    'KEY PROJECTS',
    'Kinetx - Distributed Video Streaming Platform | Node.js | Docker | PostgreSQL',
    { text: 'Repository', url: 'https://github.com/jordanreyes/kinetx' },
    'Deployed a distributed application on Azure Virtual Machines using Docker and Nginx.',
    'Configured networking, reverse proxy and PostgreSQL.',
  ]);
}

/** A genuine two-column CV: career history on the left, skills sidebar on the right. */
export function twoColumnSidebarCvPdf(): Buffer {
  return positionedPdf([
    { text: 'Rosa Mehta', x: 72, y: 740, fontSize: 16 },
    { text: 'PROFESSIONAL EXPERIENCE', x: 72, y: 710 },
    { text: 'Service Manager at Borough Support', x: 72, y: 690 },
    { text: 'Jan 2020 - Present', x: 72, y: 674 },
    { text: 'Reduced resident response times.', x: 72, y: 656 },
    { text: 'EDUCATION', x: 72, y: 626 },
    { text: 'BA Public Administration at North College, 2015 - 2018', x: 72, y: 606 },
    { text: 'REFERENCES', x: 72, y: 576 },
    { text: 'Available on request', x: 72, y: 556 },
    { text: 'CORE COMPETENCIES', x: 450, y: 710 },
    { text: 'Case Management', x: 450, y: 690 },
    { text: 'Stakeholder Liaison', x: 450, y: 670 },
    { text: 'Process Mapping', x: 450, y: 650 },
    { text: 'LANGUAGES', x: 450, y: 620 },
    { text: 'English (Native)', x: 450, y: 600 },
    { text: 'INTERESTS', x: 450, y: 570 },
    { text: 'Community gardening', x: 450, y: 550 },
  ]);
}

/** Employer-first layout plus a table-owned skills category. */
export async function employerFirstOperationsDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Morgan Ellis', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'CAREER HISTORY', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ children: [new TextRun({ text: 'National Archives Service', bold: true })] }),
        new Paragraph('Operations Manager'),
        new Paragraph('Apr 2018 - Dec 2023'),
        new Paragraph({ text: 'Coordinated three regional service teams.', bullet: { level: 0 } }),
        new Paragraph({ text: 'EDUCATIONAL BACKGROUND', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('BSc Operations Management at City University, 2014 - 2017'),
        new Paragraph({ text: 'AREAS OF EXPERTISE', heading: HeadingLevel.HEADING_2 }),
        new Table({ rows: [new TableRow({ children: [
          new TableCell({ children: [new Paragraph('Operations')] }),
          new TableCell({ children: [new Paragraph('Capacity Planning, Service Design')] }),
        ] })] }),
      ],
    }],
  });
  return Packer.toBuffer(document);
}

/** Unknown research section safety: publications remain reviewable evidence. */
export async function academicResearchDocx(): Promise<Buffer> {
  const document = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'Dr Noor Shah', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: 'RESEARCH EXPERIENCE', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Research Fellow at Coastal Institute, Sep 2019 - Aug 2024'),
        new Paragraph({ text: 'Synthesised evidence from 42 interviews.', bullet: { level: 0 } }),
        new Paragraph({ text: 'RESEARCH METHODS', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Thematic Analysis, Qualitative Interviews'),
        new Paragraph({ text: 'PUBLICATIONS', heading: HeadingLevel.HEADING_2 }),
        new Paragraph('Shah, N. (2023). Coastal resilience in regional planning.'),
      ],
    }],
  });
  return Packer.toBuffer(document);
}

const PARITY_LINES = [
  'Taylor Reed',
  'PROFESSIONAL SUMMARY',
  'Finance analyst specialising in reconciliations.',
  'WORK EXPERIENCE',
  'Finance Analyst at Northstar Bank, Jan 2021 - Dec 2023',
  'Reconciled monthly control accounts.',
  'EDUCATION',
  'BSc Accounting at Leeds City University, 2017 - 2020',
  'KEY PROJECTS',
  'Close Process Review | Excel | Power BI',
  'Reduced the month-end close by two days.',
  'SKILLS',
  'Analysis: Excel, Power BI',
] as const;

export function equivalentParityPdf(): Buffer {
  return minimalPdf([...PARITY_LINES]);
}

export async function equivalentParityDocx(): Promise<Buffer> {
  const headings = new Set(['PROFESSIONAL SUMMARY', 'WORK EXPERIENCE', 'EDUCATION', 'KEY PROJECTS', 'SKILLS']);
  const document = new Document({
    sections: [{
      children: PARITY_LINES.map((text) => new Paragraph(
        headings.has(text)
          ? { text, heading: HeadingLevel.HEADING_2 }
          : text
      )),
    }],
  });
  return Packer.toBuffer(document);
}
