import { describe, expect, it } from 'vitest';
import { describeStructuredEvidence, validateStructuredEvidence } from '@/shared/services/structured-evidence';

/**
 * Canonical profile contract: a valid record must save with only its genuine
 * minimum fields, a missing optional qualifier means "not provided" (never
 * expired/inactive/inferred), and invalid controlled values are still rejected
 * server-side rather than trusted from the client.
 */
describe('canonical evidence contract — record minimums', () => {
  it('education needs only an exact qualification title and institution', () => {
    const parsed = validateStructuredEvidence('education', { qualification: 'BSc Nursing', institution: 'University of Leeds' });
    expect(parsed.kind).toBe('education');
    expect((parsed.details as Record<string, string>).startDate).toBe('');
  });

  it('training needs only a course title (provider and status optional)', () => {
    expect(validateStructuredEvidence('training', { course: 'Manual handling' }).kind).toBe('training');
  });

  it('licence needs only a licence name (issuer, status, verification optional)', () => {
    expect(validateStructuredEvidence('licence', { officialName: 'Counterbalance forklift licence' }).kind).toBe('licence');
  });

  it('certification needs only a name', () => {
    expect(validateStructuredEvidence('certification', { officialName: 'AWS Solutions Architect' }).kind).toBe('certification');
  });

  it('volunteering needs only organisation and role (contribution optional)', () => {
    expect(validateStructuredEvidence('volunteering', { organisation: 'Shelter', role: 'Support volunteer' }).kind).toBe('volunteering');
  });

  it('other evidence needs only a title and description (context optional)', () => {
    expect(validateStructuredEvidence('other', { title: 'Duke of Edinburgh', description: 'Completed the Gold award' }).kind).toBe('other');
  });

  it('a language needs only one of the three abilities, and omitted abilities stay unset (never inferred)', () => {
    const parsed = validateStructuredEvidence('language', { language: 'French', speaking: 'professional_working' });
    const details = parsed.details as Record<string, string>;
    expect(details.speaking).toBe('professional_working');
    expect(details.reading).toBe('');
    expect(details.writing).toBe('');
  });
});

describe('canonical evidence contract — server-side rejection of invalid controlled values', () => {
  it('rejects a language with no ability at all', () => {
    expect(() => validateStructuredEvidence('language', { language: 'French' })).toThrow(/at least one/i);
  });

  it('rejects an invalid proficiency even though the ability field is optional', () => {
    expect(() => validateStructuredEvidence('language', { language: 'French', speaking: 'fluent' })).toThrow();
  });

  it('rejects an invalid lifecycle status even though status is optional', () => {
    expect(() => validateStructuredEvidence('licence', { officialName: 'Forklift', status: 'totally-made-up' })).toThrow();
  });

  it('still rejects Other evidence that duplicates a canonical category', () => {
    expect(() => validateStructuredEvidence('other', { title: 'My certifications', description: 'AWS, Azure' })).toThrow(/matching profile section/);
  });

  it('still rejects reversed date ranges', () => {
    expect(() => validateStructuredEvidence('training', { course: 'X', startDate: '2025-01', endDate: '2024-01' })).toThrow(/before/i);
  });
});

describe('canonical formatter — human-readable, no inference, no dangling separators', () => {
  it('maps a proficiency code to its label and omits abilities that were not provided', () => {
    const { text } = describeStructuredEvidence('language', { language: 'French', speaking: 'native_bilingual' });
    expect(text).toContain('Native / Bilingual');
    expect(text).not.toContain('native_bilingual');
    expect(text).not.toContain('reading:');
    expect(text).not.toContain('writing:');
  });

  it('omits a missing issuer with no dangling separator and never overstates verification', () => {
    const { text } = describeStructuredEvidence('licence', { officialName: 'Forklift licence' });
    expect(text).toBe('Forklift licence (user-confirmed, unverified)');
  });

  it('never emits the legacy mojibake separator', () => {
    const { text } = describeStructuredEvidence('training', { course: 'First aid', provider: 'Red Cross' });
    expect(text).not.toContain(' ? ');
    expect(text).toContain('First aid — Red Cross');
  });
});
