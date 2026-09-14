import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import type { GoldenAutomatedCheck, GoldenCvFixture } from './types';

const REQUIRED_PARTS = [
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
  'word/styles.xml',
  'word/numbering.xml',
  'word/_rels/document.xml.rels',
] as const;

const LEAKAGE_PATTERNS: Array<[string, RegExp]> = [
  ['undefined', /\bundefined\b/iu],
  ['null', /\bnull\b/iu],
  ['object coercion', /\[object Object\]/iu],
  ['raw JSON object', /\{\s*"[A-Za-z][^"]*"\s*:/u],
  ['Markdown heading', /(^|\s)#{1,6}\s+[A-Za-z]/u],
  ['placeholder text', /\b(?:lorem ipsum|placeholder|todo|tbc)\b/iu],
  ['prompt instruction', /\b(?:system prompt|ignore previous instructions|prompt instructions)\b/iu],
  ['internal provenance field', /\b(?:claimSourceRefs|pageDensityDecision|plannedSectionOrder|unsupportedRequirementsNotAdded|evidenceSnapshot)\b/u],
  ['raw schema name', /\b(?:CvBuildSpec|StructuredCvRewriteOutput|JobMatchDataV2|RewriteSourceRef)\b/u],
];

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseXml(name: string, xml: string, errors: string[]): void {
  try {
    new SaxesParser({ xmlns: true }).write(xml).close();
  } catch (error) {
    errors.push(`${name} is not well-formed XML: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function extractVisibleDocxText(documentXml: string): string {
  return [...documentXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)]
    .map((match) => decodeXml(match[1]))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const source = haystack.toLocaleLowerCase();
  const target = needle.toLocaleLowerCase();
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(target, offset)) >= 0) {
    count += 1;
    offset += target.length;
  }
  return count;
}

function attributes(tag: string): Record<string, string> {
  return Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/gu)].map((match) => [match[1], decodeXml(match[2])])
  );
}

function hyperlinkTargets(relationshipsXml: string): string[] {
  return [...relationshipsXml.matchAll(/<Relationship\s+([^>]+?)\/?\s*>/gu)]
    .map((match) => attributes(match[1]))
    .filter((attrs) => attrs.Type?.endsWith('/hyperlink') && attrs.Target)
    .map((attrs) => attrs.Target);
}

function validateRelationships(documentXml: string, relationshipsXml: string, errors: string[]): void {
  const relationshipIds = new Set(
    [...relationshipsXml.matchAll(/<Relationship\s+([^>]+?)\/?\s*>/gu)]
      .map((match) => attributes(match[1]).Id)
      .filter(Boolean)
  );
  const referencedIds = new Set(
    [...documentXml.matchAll(/<w:hyperlink\b[^>]*\br:id="([^"]+)"/gu)].map((match) => match[1])
  );
  for (const id of referencedIds) {
    if (!relationshipIds.has(id)) errors.push(`Hyperlink relationship ${id} is missing.`);
  }
}

function validateNumbering(documentXml: string, numberingXml: string, errors: string[]): void {
  const defined = new Set(
    [...numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"/gu)].map((match) => match[1])
  );
  const referenced = new Set(
    [...documentXml.matchAll(/<w:numId\b[^>]*w:val="(\d+)"/gu)].map((match) => match[1])
  );
  for (const numId of referenced) {
    if (!defined.has(numId)) errors.push(`Numbering definition ${numId} is missing.`);
  }
}

function validateStyles(documentXml: string, stylesXml: string, errors: string[]): void {
  const defined = new Set(
    [...stylesXml.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"/gu)].map((match) => match[1])
  );
  const referenced = new Set(
    [...documentXml.matchAll(/<w:(?:pStyle|rStyle|tblStyle)\b[^>]*w:val="([^"]+)"/gu)].map((match) => match[1])
  );
  for (const styleId of referenced) {
    if (!defined.has(styleId)) errors.push(`Style definition ${styleId} is missing.`);
  }
}

function validateHeadingsAndOrder(
  fixture: GoldenCvFixture,
  documentXml: string,
  visibleText: string,
  errors: string[]
): void {
  const paragraphs = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)].map((match) => ({
    xml: match[0],
    text: extractVisibleDocxText(match[0]).trim(),
  }));
  let previous = -1;
  for (const heading of fixture.expected.headings) {
    const index = paragraphs.findIndex(
      (paragraph) => {
        const paragraphText = paragraph.text.toLocaleLowerCase();
        const headingText = heading.toLocaleLowerCase();
        return paragraphText === headingText || paragraphText.endsWith(` ${headingText}`);
      }
    );
    if (index < 0) errors.push(`Expected heading is missing: ${heading}`);
    else if (index <= previous) errors.push(`Heading order does not match CvBuildSpec at: ${heading}`);
    previous = Math.max(previous, index);

    const headingParagraph = paragraphs[index]?.xml;
    if (headingParagraph && !headingParagraph.includes('<w:keepNext')) {
      errors.push(`Section heading does not use keep-with-next: ${heading}`);
    }
  }
}

function validatePresentationSafety(documentXml: string, errors: string[], warnings: string[]): void {
  if (/<w:br\b[^>]*w:type="page"[^>]*\/>\s*<w:br\b[^>]*w:type="page"/u.test(documentXml)) {
    errors.push('Duplicate adjacent page breaks were emitted.');
  }

  const pointSizes = [...documentXml.matchAll(/<w:sz\b[^>]*w:val="(\d+)"/gu)].map((match) => Number(match[1]) / 2);
  if (pointSizes.length > 0 && Math.min(...pointSizes) < 9) {
    errors.push(`Text smaller than the 9pt safety floor was emitted (${Math.min(...pointSizes)}pt).`);
  }

  for (const paragraph of documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gu)) {
    if (/<w:t(?:\s[^>]*)?>\s*<\/w:t>/u.test(paragraph[0])) {
      warnings.push('An explicitly empty text run is present.');
      break;
    }
  }

  for (const widthMatch of documentXml.matchAll(/<w:(?:tblW|tcW)\b[^>]*w:w="(-?\d+)"[^>]*w:type="([^"]+)"/gu)) {
    const width = Number(widthMatch[1]);
    const type = widthMatch[2];
    if (width < 0 || !['dxa', 'pct', 'auto', 'nil'].includes(type)) {
      errors.push(`Invalid table width emitted: ${width} (${type}).`);
    }
  }
}

export async function validateGoldenDocx(
  buffer: Buffer,
  fixture: GoldenCvFixture
): Promise<GoldenAutomatedCheck> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (buffer.byteLength === 0) errors.push('DOCX is empty.');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch (error) {
    return {
      passed: false,
      errors: [`DOCX ZIP container is invalid: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
      fileSize: buffer.byteLength,
      visibleTextLength: 0,
      hyperlinkTargets: [],
      pageCount: null,
    };
  }

  for (const part of REQUIRED_PARTS) {
    if (!zip.file(part)) errors.push(`Required Word part is missing: ${part}`);
  }
  if (errors.some((error) => error.startsWith('Required Word part'))) {
    return { passed: false, errors, warnings, fileSize: buffer.byteLength, visibleTextLength: 0, hyperlinkTargets: [], pageCount: null };
  }

  const [documentXml, relationshipsXml, stylesXml, numberingXml, contentTypesXml] = await Promise.all([
    zip.file('word/document.xml')!.async('string'),
    zip.file('word/_rels/document.xml.rels')!.async('string'),
    zip.file('word/styles.xml')!.async('string'),
    zip.file('word/numbering.xml')!.async('string'),
    zip.file('[Content_Types].xml')!.async('string'),
  ]);
  for (const [name, xml] of [
    ['word/document.xml', documentXml],
    ['word/_rels/document.xml.rels', relationshipsXml],
    ['word/styles.xml', stylesXml],
    ['word/numbering.xml', numberingXml],
    ['[Content_Types].xml', contentTypesXml],
  ] as const) parseXml(name, xml, errors);

  const visibleText = extractVisibleDocxText(documentXml);
  const targets = hyperlinkTargets(relationshipsXml);
  validateRelationships(documentXml, relationshipsXml, errors);
  validateStyles(documentXml, stylesXml, errors);
  validateNumbering(documentXml, numberingXml, errors);
  validateHeadingsAndOrder(fixture, documentXml, visibleText, errors);
  validatePresentationSafety(documentXml, errors, warnings);

  if (occurrences(visibleText, fixture.structuredRewrite.identity.name ?? '') !== 1) {
    errors.push('Candidate name must appear exactly once.');
  }
  for (const field of fixture.expected.contactFields) {
    if (occurrences(visibleText, field) !== 1) errors.push(`Contact field must appear exactly once: ${field}`);
  }
  for (const claim of fixture.expected.claims) {
    const count = occurrences(visibleText, claim);
    if (count !== 1) errors.push(`Expected claim must appear exactly once (${count} found): ${claim}`);
  }
  for (const forbidden of fixture.expected.forbiddenClaims) {
    if (occurrences(visibleText, forbidden) > 0) errors.push(`Forbidden/internal claim leaked: ${forbidden}`);
  }
  for (const date of fixture.expected.dateStrings) {
    if (!visibleText.includes(date)) errors.push(`Expected semantic date is missing: ${date}`);
  }
  for (const expected of fixture.expected.links) {
    if (targets.filter((target) => target.toLocaleLowerCase() === expected.toLocaleLowerCase()).length !== 1) {
      errors.push(`Expected hyperlink must appear exactly once: ${expected}`);
    }
  }
  for (const absent of fixture.expected.absentLinks) {
    if (targets.some((target) => target.toLocaleLowerCase() === absent.toLocaleLowerCase())) {
      errors.push(`Malformed or unsupported hyperlink was emitted: ${absent}`);
    }
  }
  const normalizedTargets = targets.map((target) => target.toLocaleLowerCase());
  if (new Set(normalizedTargets).size !== normalizedTargets.length) errors.push('Duplicate hyperlink destinations were emitted.');

  for (const [label, pattern] of LEAKAGE_PATTERNS) {
    if (pattern.test(visibleText)) errors.push(`Internal leakage detected (${label}).`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
    fileSize: buffer.byteLength,
    visibleTextLength: visibleText.length,
    hyperlinkTargets: targets,
    pageCount: null,
  };
}
