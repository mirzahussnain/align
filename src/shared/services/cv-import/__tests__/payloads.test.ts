import { describe, expect, it } from 'vitest';
import { CvImportEntityType } from '@/generated/prisma/client';
import { validateImportPayload, parseStoredImportPayload } from '../payloads';
import { CvPipelineError } from '../../cv-extraction/errors';
import { mapLanguageProficiency } from '../canonical';

/**
 * Candidate payloads are edited by users before confirmation, so they arrive
 * from the client. Anything the confirmation path will write into a canonical
 * profile table has to be validated on the way in.
 */

const VALID_EXPERIENCE = {
  jobTitle: 'Staff Nurse',
  company: 'Salford Royal',
  startDate: '2017-09',
  endDate: '2021-02',
  current: false,
  achievements: ['Delivered ward care.'],
};

function code(run: () => unknown): string {
  try {
    run();
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof CvPipelineError ? error.code : 'WRONG_ERROR_TYPE';
  }
}

describe('payload validation', () => {
  it('accepts a well-formed experience payload', () => {
    expect(validateImportPayload(CvImportEntityType.EXPERIENCE, VALID_EXPERIENCE)).toMatchObject({
      jobTitle: 'Staff Nurse',
      company: 'Salford Royal',
    });
  });

  it('rejects arbitrary JSON', () => {
    expect(code(() => validateImportPayload(CvImportEntityType.EXPERIENCE, { anything: true }))).toBe(
      'INVALID_PARSER_OUTPUT'
    );
    expect(code(() => validateImportPayload(CvImportEntityType.SKILL, 'a skill'))).toBe(
      'INVALID_PARSER_OUTPUT'
    );
  });

  it('rejects a date that is not a profile date', () => {
    expect(
      code(() =>
        validateImportPayload(CvImportEntityType.EXPERIENCE, { ...VALID_EXPERIENCE, startDate: 'last summer' })
      )
    ).toBe('INVALID_PARSER_OUTPUT');
  });

  it('refuses provenance fields smuggled into an edit', () => {
    // Provenance lives on the row, out of an edit's reach. A payload carrying
    // its own excerpt is not the shape the confirmation path accepts.
    const parsed = validateImportPayload(CvImportEntityType.EXPERIENCE, {
      ...VALID_EXPERIENCE,
      excerpt: 'something the user typed',
      sourceLocation: { line: 999 },
    });
    expect(parsed).not.toHaveProperty('excerpt');
    expect(parsed).not.toHaveProperty('sourceLocation');
  });

  it('bounds the size of what it will accept', () => {
    expect(
      code(() =>
        validateImportPayload(CvImportEntityType.EXPERIENCE, {
          ...VALID_EXPERIENCE,
          jobTitle: 'x'.repeat(5000),
        })
      )
    ).toBe('INVALID_PARSER_OUTPUT');
  });

  it('returns null rather than throwing for stored payloads', () => {
    expect(parseStoredImportPayload(CvImportEntityType.SKILL, { name: 'Venepuncture' })).toMatchObject({
      name: 'Venepuncture',
    });
    expect(parseStoredImportPayload(CvImportEntityType.SKILL, { wrong: true })).toBeNull();
  });
});

describe('language proficiency mapping', () => {
  it('maps unambiguous wording onto the shared scale', () => {
    expect(mapLanguageProficiency('Native')).toBe('native_bilingual');
    expect(mapLanguageProficiency('fluent')).toBe('full_professional');
    expect(mapLanguageProficiency('Conversational')).toBe('limited_working');
    expect(mapLanguageProficiency('Basic')).toBe('elementary');
  });

  it('refuses to invent a level from wording that is not one', () => {
    // "Good German" is not an assessment, and recording it as one would put a
    // claim on the profile that nobody made.
    expect(mapLanguageProficiency('good')).toBeNull();
    expect(mapLanguageProficiency('spoken at home sometimes')).toBeNull();
    expect(mapLanguageProficiency(undefined)).toBeNull();
  });
});
