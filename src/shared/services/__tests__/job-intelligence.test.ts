import { describe, expect, it } from 'vitest';
import {
  assessDescription,
  assessVacancySponsorship,
  calculateDiscoveryRelevance,
  compareCandidateToVacancy,
  extractVacancyRequirements,
} from '@/shared/services/job-intelligence';

describe('focused vacancy intelligence', () => {
  it('classifies complete, snippet, truncated, external and pasted descriptions conservatively', () => {
    const full = assessDescription({ providerAvailability: 'FULL', providerText: 'About the role. Responsibilities include delivery. Requirements include TypeScript. Benefits include pension.', providerSemantics: 'FULL' });
    expect(full.availability).toBe('FULL');
    expect(assessDescription({ providerAvailability: 'FULL', providerText: 'A short, complete advert.', providerSemantics: 'SNIPPET' }).availability).toBe('PARTIAL');
    expect(assessDescription({ providerAvailability: 'FULL', providerText: 'Responsibilities include building services...', providerSemantics: 'FULL' }).availability).toBe('PARTIAL');
    expect(assessDescription({ providerAvailability: 'EXTERNAL_ONLY' }).availability).toBe('EXTERNAL_ONLY');
    const pasted = assessDescription({ providerAvailability: 'PARTIAL', providerText: 'Provider teaser...', userText: 'A complete advert with no truncation marker.' });
    expect(pasted.source).toBe('USER_PASTED');
    expect(pasted.availability).toBe('FULL');
  });

  it('extracts sponsorship wording, including contradictions without claiming the positive result', () => {
    expect(assessVacancySponsorship('Visa sponsorship is available.').signal).toBe('AVAILABLE');
    expect(assessVacancySponsorship('Sponsorship may be considered.').signal).toBe('MAY_BE_CONSIDERED');
    expect(assessVacancySponsorship('We cannot offer visa sponsorship.').signal).toBe('NOT_AVAILABLE');
    expect(assessVacancySponsorship('Applicants must already have the right to work in the UK.').signal).toBe('RIGHT_TO_WORK_REQUIRED');
    expect(assessVacancySponsorship('An inclusive employer.').signal).toBe('NOT_MENTIONED');
    const conflict = assessVacancySponsorship('Visa sponsorship is available. We cannot offer sponsorship for this role.');
    expect(conflict.signal).toBe('NOT_AVAILABLE');
    expect(conflict.evidence).toHaveLength(2);
  });

  it('extracts only explicit practical requirements', () => {
    const requirements = extractVacancyRequirements('Five years continuous UK residency is required for vetting. Must already hold SC clearance. Enhanced DBS check required. NMC registration required. Full UK driving licence required. Own vehicle required. Hybrid two days per week. Travel across regional sites.');
    expect(requirements.map((item) => item.category)).toEqual(expect.arrayContaining(['UK_RESIDENCY', 'SECURITY_CLEARANCE', 'DBS', 'PROFESSIONAL_REGISTRATION', 'DRIVING_LICENCE', 'OWN_VEHICLE', 'ONSITE', 'TRAVEL']));
    expect(extractVacancyRequirements('Eligible to obtain SC clearance.')[0]).toMatchObject({ category: 'SECURITY_CLEARANCE', requirement: 'MENTIONED' });
    expect(extractVacancyRequirements('A rewarding role.')).toEqual([]);
  });

  it('keeps missing candidate facts unknown and never emits legal-certainty wording', () => {
    const requirements = extractVacancyRequirements('No visa sponsorship. Full UK driving licence required.');
    const assessment = compareCandidateToVacancy(requirements, { requiresSponsorshipNow: true, professionalRegistrations: [] });
    expect(assessment.overall).toBe('POTENTIAL_ISSUE');
    expect(assessment.findings.some((finding) => finding.status === 'MISSING_INFORMATION')).toBe(true);
    expect(JSON.stringify(assessment)).not.toMatch(/eligible|ineligible|guaranteed/i);
  });

  it('computes discovery relevance without a percentage or CV matching', () => {
    expect(calculateDiscoveryRelevance({ title: 'Software Engineer', locationText: 'Birmingham', workStyle: 'HYBRID', seniority: 'senior' }, { targetRoleTitle: 'Software Engineer', preferredLocation: 'Birmingham', workStyle: 'HYBRID', seniority: 'senior' })).toMatchObject({ level: 'HIGH' });
    expect(calculateDiscoveryRelevance({ title: 'Nurse', locationText: 'London' }, { targetRoleTitle: 'Software Engineer' }).level).toBe('LOW');
    expect(calculateDiscoveryRelevance({ title: 'Engineer' }, undefined).reasons.join(' ')).not.toMatch(/%|score/i);
  });
});
