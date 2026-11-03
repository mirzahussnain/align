import { describe, expect, it } from 'vitest';
import { authorityFor, selectAuthoritativeField } from '../presentation-authority';
import { fieldCandidate } from './fixtures/presentation-normalization';

const context = { currentProfileSnapshotId: 'profile-current', matchProfileSnapshotId: 'profile-match' };

describe('presentation field authority', () => {
  it('selects current canonical education fields over historical and extracted values', () => {
    const candidates = [
      fieldCandidate('extracted', 'BSc Data Engineering — Example University', 'SOURCE_CV'),
      fieldCandidate('historical', 'BSc Data', 'CAREER_PROFILE', { snapshotId: 'profile-match', canonicalEntityId: 'education-1' }),
      fieldCandidate('current', 'BSc Data Engineering', 'CAREER_PROFILE', { snapshotId: 'profile-current', canonicalEntityId: 'education-1' }),
    ];

    expect(selectAuthoritativeField(candidates, context)).toBe('BSc Data Engineering');
    expect(authorityFor(candidates[2], context)).toBe('CURRENT_PROFILE');
  });

  it('uses match-time canonical data when current data is absent', () => {
    expect(selectAuthoritativeField([
      fieldCandidate('extracted', 'Old qualification', 'SOURCE_CV'),
      fieldCandidate('match', 'BSc Data Engineering', 'CAREER_PROFILE', { snapshotId: 'profile-match', canonicalEntityId: 'education-1' }),
    ], context)).toBe('BSc Data Engineering');
  });

  it('ranks reusable HITL above application-only and extracted structural data', () => {
    const reusable = fieldCandidate('reusable', 'Principal Engineer', 'HITL', { canonicalEntityId: 'experience-1' });
    const application = fieldCandidate('application', 'Lead Engineer', 'APPLICATION_EVIDENCE');
    const extracted = fieldCandidate('extracted', 'Engineer', 'SOURCE_CV');

    expect(selectAuthoritativeField([extracted, application, reusable], context)).toBe('Principal Engineer');
  });

  it('prefers valid values and resolves equal-rank ties independently of input order', () => {
    const invalid = fieldCandidate('a-invalid', '2024-99', 'SOURCE_CV', { supportKeys: ['one', 'two'] });
    const valid = fieldCandidate('z-valid', '2024-01', 'SOURCE_CV', { supportKeys: ['one'] });
    const validation = { isValid: (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value) };

    expect(selectAuthoritativeField([invalid, valid], context, validation)).toBe('2024-01');

    const alpha = fieldCandidate('z-record', 'Alpha', 'SOURCE_CV');
    const beta = fieldCandidate('a-record', 'Beta', 'SOURCE_CV');
    expect(selectAuthoritativeField([beta, alpha], context)).toBe('Alpha');
    expect(selectAuthoritativeField([alpha, beta], context)).toBe('Alpha');
  });
});
