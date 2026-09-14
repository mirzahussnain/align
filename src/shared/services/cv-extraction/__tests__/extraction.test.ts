import { describe, expect, it } from 'vitest';
import { docxFromDocxLibrary, docxFromHandBuiltOoxml, minimalPdf } from './fixtures';
import { extractStoredCv } from '../index';
import { CvPipelineError } from '../errors';
import {
  detectFormatFromBytes,
  validateUploadBytes,
  MAX_CV_UPLOAD_BYTES,
} from '../formats';
import { normaliseExtractedText, sourceExcerpt, hasUsableText } from '../text';
import { parseCvDateRange, parseCvDateToken, findDateRange } from '../dates';
import { matchSectionHeading, sectionCv } from '../sections';
import { parseCvStructure } from '../structured';

const PDF_CV = [
  'Amara Okafor',
  'Registered Nurse',
  'amara.okafor@example.com',
  '+44 7700 900123',
  'WORK EXPERIENCE',
  'Staff Nurse at Salford Royal, Sep 2017 - Feb 2021',
  'Delivered care on a 28-bed respiratory ward.',
  'EDUCATION',
  'BSc Adult Nursing at University of Salford, 2014 - 2017',
];

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof CvPipelineError ? error.code : 'WRONG_ERROR_TYPE';
  }
}

describe('format detection and upload validation', () => {
  it('detects a PDF from its bytes', () => {
    expect(detectFormatFromBytes(minimalPdf(['x']))).toBe('pdf');
  });

  it('detects a DOCX from both producers', async () => {
    expect(detectFormatFromBytes(await docxFromDocxLibrary())).toBe('docx');
    expect(detectFormatFromBytes(await docxFromHandBuiltOoxml())).toBe('docx');
  });

  it('rejects a zip that is not a Word document, even though it is a valid zip', async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file('hello.txt', 'not a cv');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    expect(detectFormatFromBytes(bytes)).toBeNull();
    expect(await code(async () => validateUploadBytes('notes.zip', bytes))).toBe('UNSUPPORTED_FORMAT');
  });

  it('rejects a file whose signature contradicts its extension', async () => {
    const pdfBytes = minimalPdf(['x']);
    expect(await code(async () => validateUploadBytes('cv.docx', pdfBytes))).toBe('SIGNATURE_MISMATCH');
  });

  it('rejects an unsupported extension outright', async () => {
    expect(await code(async () => validateUploadBytes('cv.txt', Buffer.from('plain text cv')))).toBe(
      'UNSUPPORTED_FORMAT'
    );
  });

  it('rejects an empty file and an oversized file', async () => {
    expect(await code(async () => validateUploadBytes('cv.pdf', Buffer.alloc(0)))).toBe('FILE_EMPTY');
    const oversized = Buffer.concat([minimalPdf(['x']), Buffer.alloc(MAX_CV_UPLOAD_BYTES)]);
    expect(await code(async () => validateUploadBytes('cv.pdf', oversized))).toBe('FILE_TOO_LARGE');
  });

  it('reports the canonical MIME type, not the caller-supplied one', async () => {
    const validated = validateUploadBytes('cv.pdf', minimalPdf(['x']));
    expect(validated.mimeType).toBe('application/pdf');
  });
});

describe('text normalisation', () => {
  it('collapses line endings, blank runs and trailing spaces', () => {
    expect(normaliseExtractedText('a  \r\n\r\n\r\n\r\nb   c \n')).toBe('a\n\nb c');
  });

  it('strips soft hyphens and zero-width characters that break keyword matching', () => {
    const softHyphen = String.fromCharCode(0xad);
    const zeroWidth = String.fromCharCode(0x200b);
    expect(normaliseExtractedText(`man${softHyphen}agement${zeroWidth} skills`)).toBe('management skills');
  });

  it('converts non-breaking spaces to ordinary spaces', () => {
    expect(normaliseExtractedText(`Nurse${String.fromCharCode(0xa0)}Practitioner`)).toBe('Nurse Practitioner');
  });

  it('treats unicode line separators as line breaks', () => {
    expect(normaliseExtractedText(`first${String.fromCharCode(0x2028)}second`)).toBe('first\nsecond');
  });

  it('requires a minimum amount of text to call a document readable', () => {
    expect(hasUsableText('too short')).toBe(false);
    expect(hasUsableText('x'.repeat(50))).toBe(true);
  });

  it('quotes excerpts verbatim and only truncates at length', () => {
    expect(sourceExcerpt('Led a bay of eight beds')).toBe('Led a bay of eight beds');
    const long = 'word '.repeat(100);
    const excerpt = sourceExcerpt(long, 40);
    expect(excerpt.length).toBeLessThanOrEqual(41);
    expect(excerpt.endsWith('…')).toBe(true);
  });
});

describe('date reading', () => {
  it('reads the shapes CVs actually use', () => {
    expect(parseCvDateToken('Mar 2021')).toBe('2021-03');
    expect(parseCvDateToken('March 2021')).toBe('2021-03');
    expect(parseCvDateToken('03/2021')).toBe('2021-03');
    expect(parseCvDateToken('2021-03')).toBe('2021-03');
    expect(parseCvDateToken('2021')).toBe('2021');
  });

  it('declines tokens it cannot read rather than guessing', () => {
    expect(parseCvDateToken('13/2021')).toBeNull();
    expect(parseCvDateToken('sometime in 2021')).toBeNull();
    expect(parseCvDateToken('Winter')).toBeNull();
  });

  it('marks a role current only when the CV wrote a present-tense word', () => {
    expect(parseCvDateRange('Mar 2021 - Present')).toEqual({ start: '2021-03', end: null, current: true });
    expect(parseCvDateRange('Mar 2021 -')).toEqual({ start: '2021-03', end: null, current: false });
  });

  it('never infers an end date, and never infers "current" from a missing one', () => {
    const parsed = parseCvDateRange('Jan 2019 - somewhen');
    expect(parsed.start).toBe('2019-01');
    expect(parsed.end).toBeNull();
    expect(parsed.current).toBe(false);
  });

  it('returns nothing at all when the start cannot be read', () => {
    expect(parseCvDateRange('unknown - Mar 2021')).toEqual({ start: null, end: null, current: false });
  });

  it('finds a range inside a longer line and reports what it matched', () => {
    const found = findDateRange('Staff Nurse at Salford Royal, Sep 2017 - Feb 2021');
    expect(found?.start).toBe('2017-09');
    expect(found?.end).toBe('2021-02');
    expect(found?.matched).toContain('Sep 2017');
  });
});

describe('section detection', () => {
  it('recognises headings by vocabulary, in several wordings', () => {
    expect(matchSectionHeading('WORK EXPERIENCE')).toBe('experience');
    expect(matchSectionHeading('Employment History:')).toBe('experience');
    expect(matchSectionHeading('Education & Qualifications')).toBe('education');
    expect(matchSectionHeading('Core Skills')).toBe('skills');
  });

  it('does not treat prose that mentions a section word as a heading', () => {
    expect(matchSectionHeading('I have ten years of experience.')).toBeNull();
    expect(matchSectionHeading('Experience, education and skills')).toBeNull();
  });

  it('keeps everything before the first heading as the contact block', () => {
    const sectioned = sectionCv('Amara Okafor\namara@example.com\nSKILLS\nVenepuncture');
    expect(sectioned.head.map((entry) => entry.text)).toEqual(['Amara Okafor', 'amara@example.com']);
    expect(sectioned.sections).toHaveLength(1);
  });
});

describe('structured parsing', () => {
  it('reads a DOCX produced by the docx library', async () => {
    const result = await extractStoredCv(await docxFromDocxLibrary());
    const { structured } = result;

    expect(result.format).toBe('docx');
    expect(structured.identity.fullName).toBe('Amara Okafor');
    expect(structured.identity.email).toBe('amara.okafor@example.com');
    expect(structured.identity.location).toBe('Manchester, United Kingdom');

    expect(structured.experience).toHaveLength(2);
    expect(structured.experience[0]).toMatchObject({
      jobTitle: 'Senior Staff Nurse',
      company: 'Manchester Royal Infirmary',
      startDate: '2021-03',
      endDate: null,
      current: true,
    });
    // List items carry no bullet character in DOCX text, so this asserts the
    // buffered-line rule rather than a bullet-prefix rule.
    expect(structured.experience[0].achievements).toEqual([
      'Led a bay of eight acute medical beds on night shifts.',
      'Mentored six newly qualified nurses through preceptorship.',
    ]);
    expect(structured.experience[1]).toMatchObject({
      jobTitle: 'Staff Nurse',
      company: 'Salford Royal',
      startDate: '2017-09',
      endDate: '2021-02',
      current: false,
    });

    expect(structured.education[0]).toMatchObject({
      degree: 'BSc (Hons) Adult Nursing',
      university: 'University of Salford',
      startDate: '2014',
      endDate: '2017',
    });

    // Table cell text is extracted — this is the verified DOCX table claim.
    expect(structured.skills.map((skill) => skill.name)).toEqual([
      'Venepuncture',
      'Cannulation',
      'EPR',
      'SystmOne',
    ]);
    expect(structured.skills[0].category).toBe('Clinical');

    expect(structured.languages).toEqual([
      expect.objectContaining({ language: 'English', proficiency: 'Native' }),
      expect.objectContaining({ language: 'Igbo', proficiency: 'Fluent' }),
    ]);
  });

  it('reads a DOCX assembled as a desktop word processor emits it', async () => {
    const { structured, format } = await extractStoredCv(await docxFromHandBuiltOoxml());

    expect(format).toBe('docx');
    expect(structured.identity.fullName).toBe('Tomasz Nowak');
    expect(structured.headline).toBe('Software Engineer');
    expect(structured.experience[0]).toMatchObject({
      jobTitle: 'Backend Engineer',
      company: 'Fintra Ltd',
      startDate: '2019-01',
      endDate: '2023-12',
      current: false,
    });
    expect(structured.experience[0].achievements).toEqual([
      'Rebuilt the payments ledger service.',
      'Cut median API latency from 400ms to 90ms.',
    ]);
    expect(structured.projects[0]).toMatchObject({ name: 'Ledger Reconciliation Tool', startDate: '2022' });
    expect(structured.certifications[0]).toMatchObject({
      officialName: 'AWS Certified Solutions Architect',
      issuingBody: 'Amazon Web Services',
      issueDate: '2022',
    });
    expect(structured.skills.map((skill) => skill.name)).toContain('Terraform');
  });

  it('reads a PDF', async () => {
    const { structured, format, pageCount } = await extractStoredCv(minimalPdf(PDF_CV));
    expect(format).toBe('pdf');
    expect(pageCount).toBe(1);
    expect(structured.identity.fullName).toBe('Amara Okafor');
    expect(structured.headline).toBe('Registered Nurse');
    expect(structured.experience[0]).toMatchObject({ jobTitle: 'Staff Nurse', company: 'Salford Royal' });
  });

  it('carries an immutable verbatim excerpt and a source line for every proposal', async () => {
    const { structured } = await extractStoredCv(await docxFromDocxLibrary());
    for (const item of [...structured.experience, ...structured.education, ...structured.skills]) {
      expect(item.excerpt.length).toBeGreaterThan(0);
      expect(item.sourceLocation.line).toBeGreaterThanOrEqual(0);
    }
    expect(structured.experience[0].excerpt).toContain('Senior Staff Nurse');
    expect(structured.experience[0].sourceLocation.section).toBe('WORK EXPERIENCE');
  });

  it('invents nothing for a CV with no recognisable sections', () => {
    const structured = parseCvStructure('Just some free text about my career with no headings at all.');
    expect(structured.experience).toEqual([]);
    expect(structured.education).toEqual([]);
    expect(structured.skills).toEqual([]);
    expect(structured.detectedSections).toEqual([]);
  });

  it('proposes an experience without an employer rather than inventing one', () => {
    const structured = parseCvStructure(
      ['WORK EXPERIENCE', 'Warehouse Operative', 'Jan 2020 - Mar 2021', 'Picked and packed orders.'].join('\n')
    );
    expect(structured.experience).toHaveLength(1);
    expect(structured.experience[0].jobTitle).toBe('Warehouse Operative');
    expect(structured.experience[0].company).toBeUndefined();
  });

  it('never records a date the CV did not state', () => {
    const structured = parseCvStructure(
      ['EXPERIENCE', 'Cleaner at Brightwell Services', 'Kept communal areas to standard.'].join('\n')
    );
    // No date line at all, so there is no entry to attribute dates to.
    expect(structured.experience.every((entry) => entry.startDate === null)).toBe(true);
  });
});

describe('extraction failures', () => {
  it('rejects a document with no usable text instead of importing nothing', async () => {
    // A valid PDF whose text layer is below the readable threshold — the shape a
    // scanned CV takes once the image is ignored.
    expect(await code(() => extractStoredCv(minimalPdf(['Hi'])))).toBe('EMPTY_TEXT');
  });

  it('reports a damaged document with a stable code, not a library message', async () => {
    const damaged = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('not really a pdf')]);
    expect(await code(() => extractStoredCv(damaged))).toBe('CORRUPT_DOCUMENT');
  });

  it('rejects an unsupported container before any extractor runs', async () => {
    expect(await code(() => extractStoredCv(Buffer.from('hello world')))).toBe('UNSUPPORTED_FORMAT');
  });
});
