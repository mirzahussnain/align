import { describe, expect, it } from 'vitest';
import { classifyCompanyUkScope, COMPANY_UK_SCOPE_DEFAULT } from '@/shared/services/job-board-api';

/**
 * UK relevance for an EMPLOYER, which is a different question from sponsor
 * evidence and a different question again from "does this company use a global
 * ATS product". The directory was answering the third and presenting it as the
 * first, so every Greenhouse/Lever/Ashby customer on earth qualified.
 */
describe('company UK relevance', () => {
  it('does not qualify a company merely for having a verified ATS board', () => {
    // No UK identity, no UK vacancies, but vacancies do exist — a positive
    // finding that this employer is not currently hiring in the UK.
    expect(
      classifyCompanyUkScope({ ukVacancyCount: 0, totalVacancyCount: 120 }),
    ).toBe('NOT_CURRENTLY_UK_RELEVANT');
  });

  it('does not qualify a company on a sponsor-register name match', () => {
    // The classifier is not given sponsor status at all, by construction: a
    // register match says a NAME appears on a Home Office list and says nothing
    // about whether this employer is hiring in the UK.
    expect(
      classifyCompanyUkScope({ ukVacancyCount: 0, totalVacancyCount: 5 }),
    ).toBe('NOT_CURRENTLY_UK_RELEVANT');
  });

  it('qualifies a company with a UK country record and current UK vacancies', () => {
    expect(
      classifyCompanyUkScope({ country: 'GB', ukVacancyCount: 4, totalVacancyCount: 90 }),
    ).toBe('UK_RELEVANT');
  });

  it('qualifies a company with a .uk careers presence', () => {
    expect(
      classifyCompanyUkScope({
        careersUrl: 'https://careers.example.co.uk/jobs',
        ukVacancyCount: 2,
        totalVacancyCount: 2,
      }),
    ).toBe('UK_RELEVANT');
  });

  it('keeps a UK employer relevant while it happens to have no open vacancies', () => {
    expect(
      classifyCompanyUkScope({ country: 'GB', ukVacancyCount: 0, totalVacancyCount: 0 }),
    ).toBe('UK_RELEVANT');
  });

  it('admits a global employer that currently has UK vacancies', () => {
    expect(
      classifyCompanyUkScope({
        websiteUrl: 'https://example.com',
        ukVacancyCount: 3,
        totalVacancyCount: 400,
      }),
    ).toBe('GLOBAL_WITH_UK_JOBS');
  });

  it('reports unknown rather than guessing when there is nothing to go on', () => {
    expect(classifyCompanyUkScope({ ukVacancyCount: 0, totalVacancyCount: 0 })).toBe('UNKNOWN');
  });

  it('lists UK-relevant and global-with-UK-jobs by default, and nothing else', () => {
    expect([...COMPANY_UK_SCOPE_DEFAULT]).toEqual(['UK_RELEVANT', 'GLOBAL_WITH_UK_JOBS']);
    expect(COMPANY_UK_SCOPE_DEFAULT).not.toContain('NOT_CURRENTLY_UK_RELEVANT');
    expect(COMPANY_UK_SCOPE_DEFAULT).not.toContain('UNKNOWN');
  });

  it('does not let a single historic foreign vacancy define an employer', () => {
    // A UK employer with one Dublin requisition is still a UK employer.
    expect(
      classifyCompanyUkScope({
        country: 'GB',
        ukVacancyCount: 12,
        totalVacancyCount: 13,
      }),
    ).toBe('UK_RELEVANT');
  });
});
