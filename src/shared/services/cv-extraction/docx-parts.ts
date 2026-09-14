import JSZip from 'jszip';

/**
 * DOCX header and footer parts.
 *
 * mammoth walks `word/document.xml` and nothing else, which is correct for its
 * purpose and wrong for ours: plenty of CV templates put the whole contact block
 * — name, phone, LinkedIn, GitHub, portfolio — in a page header, and those
 * documents currently extract with no contact details at all.
 *
 * The archive is opened with JSZip, a mature ZIP implementation already in the
 * dependency tree, rather than by walking the container bytes by hand. The XML
 * inside is read with a deliberately narrow scan of the four elements a header
 * paragraph is made of (`w:p`, `w:hyperlink`, `w:t`, `w:tab`/`w:br`) plus the
 * relationship file that resolves a hyperlink id to its address. That is a
 * smaller surface than a general XML parse and it is bounded by what this file
 * claims to support — anything richer (fields, text boxes, drawings) is not read
 * and is documented as unsupported in ./docx.ts rather than half-read.
 *
 * Nothing here can fail an extraction. A header that defeats the scan yields no
 * paragraphs, and the body text still imports.
 */

export interface DocxParagraph {
  text: string;
  links: { url: string; visibleText?: string }[];
}

export interface DocxPart {
  /** Part name, e.g. `word/header1.xml`. */
  name: string;
  kind: 'header' | 'footer' | 'textbox';
  paragraphs: DocxParagraph[];
}

/** `word/header1.xml`, `word/footer2.xml`, … */
const PART_NAME = /^word\/(header|footer)\d*\.xml$/i;
/** One `<w:p>…</w:p>` paragraph, any namespace prefix. */
const PARAGRAPH = /<(\w+:)?p(?:\s[^>]*)?>([\s\S]*?)<\/(\w+:)?p>/g;
/** One `<w:hyperlink r:id="rIdN">…</w:hyperlink>`. */
const HYPERLINK = /<(\w+:)?hyperlink\s[^>]*?(?:r:id|relationshipId)="([^"]+)"[^>]*>([\s\S]*?)<\/(\w+:)?hyperlink>/g;
/**
 * A hyperlink written as a FIELD rather than an element:
 *
 *   <w:instrText> HYPERLINK "https://…" </w:instrText>
 *   … fldCharType="separate" … <w:t>LinkedIn</w:t> … fldCharType="end"
 *
 * Word produces these when a link is inserted in certain ways, and older
 * templates are full of them. They carry no `r:id`, so the relationship lookup
 * that finds every other hyperlink finds nothing here and the address is lost
 * even though it is sitting in plain sight in the XML.
 */
const FIELD_HYPERLINK =
  /HYPERLINK\s+"([^"]+)"[\s\S]*?fldCharType="separate"([\s\S]*?)fldCharType="end"/g;
/** One `<w:t>text</w:t>` run. */
const TEXT_RUN = /<(\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(\w+:)?t>/g;
/** Explicit breaks inside a paragraph, which read as spaces on one line. */
const BREAK = /<(\w+:)?(?:tab|br)\s*\/?>/g;
/** One `<Relationship Id="rIdN" … Target="…"/>` entry. */
const RELATIONSHIP = /<Relationship\s[^>]*\/?>/g;
/** The body of a text box or shape: `<w:txbxContent>…</w:txbxContent>`. */
const TEXT_BOX = /<(\w+:)?txbxContent(?:\s[^>]*)?>([\s\S]*?)<\/(\w+:)?txbxContent>/g;
/** Field instructions, which are markup and never visible text. */
const INSTR_TEXT = /<(\w+:)?instrText(?:\s[^>]*)?>[\s\S]*?<\/(\w+:)?instrText>/g;

const XML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
};

function decode(xml: string): string {
  return xml.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * The visible text of a run of WordprocessingML.
 *
 * Field instructions are stripped first. They live in `w:instrText`, which is
 * shaped exactly like a text run and is not text at all — leaving them in puts
 * ` HYPERLINK "https://…" ` into the middle of the user's contact line.
 */
function runText(xml: string): string {
  const withBreaks = xml.replace(INSTR_TEXT, '').replace(BREAK, ' ');
  let text = '';
  for (const match of withBreaks.matchAll(TEXT_RUN)) text += decode(match[2]);
  return text.replace(/\s+/g, ' ').trim();
}

/** `rId7` → `https://…`, from a part's own `_rels` file. */
function readRelationships(xml: string): Map<string, string> {
  const targets = new Map<string, string>();
  for (const match of xml.matchAll(RELATIONSHIP)) {
    const id = /\sId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\sTarget="([^"]+)"/.exec(match[0])?.[1];
    const mode = /\sTargetMode="([^"]+)"/.exec(match[0])?.[1];
    if (!id || !target) continue;
    // Only external targets are addresses. An internal one points at another
    // part of the same document and is not a link a reader can follow away.
    if (mode && mode.toLowerCase() !== 'external') continue;
    targets.set(id, decode(target));
  }
  return targets;
}

/**
 * A page number and nothing else. Word repeats these on every page and they are
 * not content — importing "2" as a line of a CV puts noise in front of the
 * parser's name and location heuristics.
 */
function isPageFurniture(text: string): boolean {
  return /^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(text);
}

/** Every link in one paragraph, from both the element form and the field form. */
function paragraphLinks(inner: string, relationships: Map<string, string>): DocxParagraph['links'] {
  const links: DocxParagraph['links'] = [];

  for (const anchor of inner.matchAll(HYPERLINK)) {
    const url = relationships.get(anchor[2]);
    if (!url) continue;
    const visibleText = runText(anchor[3]);
    links.push({ url, ...(visibleText ? { visibleText } : {}) });
  }

  for (const field of inner.matchAll(FIELD_HYPERLINK)) {
    const url = decode(field[1]).trim();
    if (!url) continue;
    const visibleText = runText(field[2]);
    links.push({ url, ...(visibleText ? { visibleText } : {}) });
  }

  return links;
}

function readPart(xml: string, relationships: Map<string, string>): DocxParagraph[] {
  const paragraphs: DocxParagraph[] = [];
  for (const match of xml.matchAll(PARAGRAPH)) {
    const inner = match[2];
    const text = runText(inner);
    if (!text || isPageFurniture(text)) continue;
    paragraphs.push({ text, links: paragraphLinks(inner, relationships) });
  }
  return paragraphs;
}

/**
 * Read every header and footer part of a .docx.
 *
 * Parts are returned in name order so two runs over the same document produce
 * the same text, and identical paragraphs across parts are dropped: Word emits a
 * separate header part for first/odd/even pages and a CV's contact header is
 * usually byte-identical in all three.
 */
export async function readDocxHeadersAndFooters(
  bytes: Buffer
): Promise<{ headers: DocxPart[]; footers: DocxPart[] }> {
  const empty = { headers: [] as DocxPart[], footers: [] as DocxPart[] };
  try {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter((name) => PART_NAME.test(name)).sort();
    if (names.length === 0) return empty;

    const headers: DocxPart[] = [];
    const footers: DocxPart[] = [];
    const seen = new Set<string>();

    for (const name of names) {
      const file = zip.file(name);
      if (!file) continue;
      const xml = await file.async('string');
      const relsName = name.replace(/^word\//, 'word/_rels/') + '.rels';
      const relsFile = zip.file(relsName);
      const relationships = relsFile ? readRelationships(await relsFile.async('string')) : new Map();

      const paragraphs = readPart(xml, relationships).filter((paragraph) => {
        const key = paragraph.text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (paragraphs.length === 0) continue;

      const kind = PART_NAME.exec(name)![1].toLowerCase() as 'header' | 'footer';
      (kind === 'header' ? headers : footers).push({ name, kind, paragraphs });
    }

    return { headers, footers };
  } catch (error) {
    console.warn(
      '[cv-extraction] DOCX header/footer parts unavailable:',
      error instanceof Error ? error.message : error
    );
    return empty;
  }
}

/**
 * What `word/document.xml` holds that mammoth's walk does not surface.
 *
 * Two things, both common in CV templates:
 *
 *   - TEXT BOXES and shapes (`w:txbxContent`). A great many two-column CV
 *     templates are a text box down the left with the name, contact details and
 *     skills in it, and the whole column is invisible to a body-paragraph walk;
 *   - FIELD-CODE hyperlinks anywhere in the body. mammoth emits an anchor for
 *     `w:hyperlink` elements; a link Word stored as a field has no `r:id` and
 *     produces no anchor, so its address is lost while its label survives.
 *
 * Text-box paragraphs are returned as their own part so the caller can place
 * them, and body field links are returned separately because they belong on
 * lines mammoth already produced.
 */
export async function readDocxBodyExtras(bytes: Buffer): Promise<{
  textBoxes: DocxPart[];
  /** Field-code links from ordinary body paragraphs, with their paragraph text. */
  fieldLinks: { url: string; visibleText?: string; paragraphText: string }[];
}> {
  const empty = { textBoxes: [] as DocxPart[], fieldLinks: [] as never[] };
  try {
    const zip = await JSZip.loadAsync(bytes);
    const document = zip.file('word/document.xml');
    if (!document) return empty;
    const xml = await document.async('string');

    const relsFile = zip.file('word/_rels/document.xml.rels');
    const relationships = relsFile ? readRelationships(await relsFile.async('string')) : new Map();

    // Text boxes first, and their XML is then REMOVED from the body before the
    // field-link scan. Otherwise a link inside a text box is reported twice —
    // once against the text box's own paragraph and once against the body — and
    // the second copy carries the wrong line.
    const textBoxes: DocxPart[] = [];
    let body = xml;
    let index = 0;
    for (const match of xml.matchAll(TEXT_BOX)) {
      const paragraphs = readPart(match[2], relationships);
      if (paragraphs.length > 0) {
        textBoxes.push({ name: `word/document.xml#txbx${index}`, kind: 'textbox', paragraphs });
      }
      body = body.replace(match[0], '');
      index += 1;
    }

    const fieldLinks: { url: string; visibleText?: string; paragraphText: string }[] = [];
    for (const paragraph of body.matchAll(PARAGRAPH)) {
      const inner = paragraph[2];
      if (!inner.includes('HYPERLINK')) continue;
      const paragraphText = runText(inner);
      for (const field of inner.matchAll(FIELD_HYPERLINK)) {
        const url = decode(field[1]).trim();
        if (!url) continue;
        const visibleText = runText(field[2]);
        fieldLinks.push({ url, ...(visibleText ? { visibleText } : {}), paragraphText });
      }
    }

    return { textBoxes, fieldLinks };
  } catch (error) {
    console.warn(
      '[cv-extraction] DOCX body extras unavailable:',
      error instanceof Error ? error.message : error
    );
    return empty;
  }
}
