import { describe, expect, it } from 'vitest';
import { describeStructuredEvidence, validateStructuredEvidence } from '@/shared/services/structured-evidence';

const cases: [string, Record<string, unknown>][] = [
  ['skill_tool', { name: 'Kafka', level: 'limited_exposure', contextType: 'project', linkedEvidenceId: '', activity: 'Configured local topics', period: '', outcome: '' }],
  ['employment', { employer: 'Acme', role: 'Engineer', startDate: '2024-01', endDate: '', responsibility: 'Supported releases', skillsTools: ['SQL'], outcome: '' }],
  ['project', { projectName: 'Portal', context: 'Personal', description: 'A portal', contribution: 'Built API', skillsTools: ['TypeScript'], startDate: '', endDate: '', outcomeOrLink: '' }],
  ['education', { qualification: 'BSc', institution: 'Uni', field: '', status: 'completed', startDate: '2020', endDate: '2023', result: '' }],
  ['training', { course: 'First aid', provider: 'Red Cross', field: '', status: 'completed', startDate: '2024', endDate: '', result: '' }],
  ['certification', { officialName: 'AWS', issuingBody: 'Amazon', issueDate: '2024', expiryDate: '', credentialNumber: '', status: 'active', verificationUrl: '', verificationStatus: 'user_confirmed_unverified' }],
  ['licence', { officialName: 'Forklift', issuingBody: 'RTITB', issueDate: '2024', expiryDate: '', credentialNumber: '', status: 'active', verificationUrl: '', verificationStatus: 'user_confirmed_unverified' }],
  ['registration', { officialName: 'NMC', issuingBody: 'NMC', issueDate: '2024', expiryDate: '', credentialNumber: '', status: 'active', verificationUrl: '', verificationStatus: 'user_confirmed_unverified' }],
  ['language', { language: 'French', speaking: 'professional_working', reading: 'professional_working', writing: 'elementary', professionalUseContext: '', formalTest: '' }],
  ['volunteering', { organisation: 'Shelter', role: 'Volunteer', startDate: '2024', endDate: '', contribution: 'Supported visitors', skillsTools: [], outcome: '' }],
  ['other', { title: 'Community event', context: 'Local', description: 'Organised event', period: '', outcome: '' }],
];

describe('structured evidence validation', () => {
  it.each(cases)('validates %s with its own required fields', (kind, details) => {
    expect(validateStructuredEvidence(kind, details).kind).toBe(kind);
  });

  it('rejects Other evidence that is clearly a duplicate canonical record', () => {
    expect(() => validateStructuredEvidence('other', { title: 'Skills', context: 'Technical skill', description: 'TypeScript', period: '', outcome: '' })).toThrow('matching profile section');
  });


  it('rejects unsupported controlled values and reversed date ranges', () => {
    expect(() => validateStructuredEvidence('language', { language: 'French', speaking: 'fluent', reading: 'elementary', writing: 'elementary' })).toThrow();
    expect(() => validateStructuredEvidence('licence', { officialName: 'Forklift', issuingBody: 'RTITB', issueDate: '2025-03', expiryDate: '2024-03', credentialNumber: '', status: 'active', verificationUrl: '', verificationStatus: 'verified' })).toThrow('End or expiry date');
  });
  it('permits a future completion date only for in-progress training', () => {
    expect(validateStructuredEvidence('training', {
      course: 'Professional diploma', provider: 'Provider', field: '', status: 'in_progress',
      startDate: '2026-01', endDate: '2027-06', result: '',
    }).kind).toBe('training');
    expect(() => validateStructuredEvidence('training', {
      course: 'Professional diploma', provider: 'Provider', field: '', status: 'completed',
      startDate: '2026-01', endDate: '2027-06', result: '',
    })).toThrow('End date cannot be in the future.');
  });
  it('does not upgrade limited exposure or unverified credentials in rendered wording', () => {
    expect(describeStructuredEvidence('skill_tool', cases[0][1]).text).toContain('limited exposure');
    expect(describeStructuredEvidence('certification', cases[5][1]).text).toContain('user-confirmed, unverified');
  });
  it('keeps canonical date precision in validation and formats only descriptions', () => {
    const details = { qualification: 'BSc', institution: 'Uni', startDate: '2023', endDate: '2024-12' };
    const parsed = validateStructuredEvidence('education', details);
    expect(parsed.details).toMatchObject({ startDate: '2023', endDate: '2024-12' });
    expect(describeStructuredEvidence('education', details).text).toContain('2023 – Dec 2024');
    expect(() => validateStructuredEvidence('education', { ...details, startDate: 'Dec 2023' })).toThrow('YYYY or YYYY-MM');
  });
});
