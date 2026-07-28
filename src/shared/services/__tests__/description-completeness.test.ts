import { describe, expect, it } from 'vitest';
import { classifyDescriptionAvailability, normaliseProviderJob } from '@/shared/services/job-normalisation';
import { getProviderCapabilities } from '@/shared/services/job-providers/capabilities';
import { SEARCH_JOB_PROVIDERS } from '@/shared/types/job';

const advert = 'We are recruiting an IT support technician to join our Birmingham service desk team.';

describe('description completeness is driven by the provider contract', () => {
  it('never promotes a snippet provider to a full advert', () => {
    // Jooble's field is literally `snippet`, so no Jooble record is a full
    // advert however long it happens to be. The outcome matches the previous
    // behaviour; the reason is now a declared capability rather than a
    // hardcoded provider name in the middle of an expression.
    expect(getProviderCapabilities('JOOBLE').descriptionSemantics).toBe('SNIPPET');
    expect(classifyDescriptionAvailability('JOOBLE', advert)).toBe('PARTIAL');
    expect(classifyDescriptionAvailability('JOOBLE', 'A'.repeat(5000))).toBe('PARTIAL');
  });

  it('lets providers that can supply a whole advert be classified as full', () => {
    expect(classifyDescriptionAvailability('REED', advert)).toBe('FULL');
    expect(classifyDescriptionAvailability('ADZUNA', advert)).toBe('FULL');
  });

  it('marks a visibly truncated advert partial regardless of provider', () => {
    expect(classifyDescriptionAvailability('REED', `${advert}...`)).toBe('PARTIAL');
    expect(classifyDescriptionAvailability('ADZUNA', `${advert}...`)).toBe('PARTIAL');
  });

  it('reports an absent description as external-only rather than empty-but-full', () => {
    // The distinction matters downstream: EXTERNAL_ONLY means "go to the source",
    // whereas a FULL empty string would be analysed as an advert with no content.
    expect(classifyDescriptionAvailability('REED', '')).toBe('EXTERNAL_ONLY');
    expect(classifyDescriptionAvailability('JOOBLE', '')).toBe('EXTERNAL_ONLY');
  });

  it('classifies every search provider without a provider-name special case', () => {
    // Adding a provider must not require remembering to edit a conditional; a
    // declared capability exists for each, so each classifies.
    for (const provider of SEARCH_JOB_PROVIDERS) {
      expect(['FULL', 'PARTIAL', 'EXTERNAL_ONLY']).toContain(classifyDescriptionAvailability(provider, advert));
    }
  });

  it('applies the same classification through full provider normalisation', () => {
    const reed = normaliseProviderJob({ id: 'reed-1', source: 'reed', title: 'IT Support Technician', company: 'Acme Ltd', location: 'Birmingham', salary: null, salaryMin: null, salaryMax: null, description: advert, url: 'https://example.com/1', postedDate: '2026-07-28', contractType: null, isRemote: false, hasSponsorship: false });
    const jooble = normaliseProviderJob({ id: 'jooble-1', source: 'jooble', title: 'IT Support Technician', company: 'Acme Ltd', location: 'Birmingham', salary: null, salaryMin: null, salaryMax: null, description: advert, url: 'https://example.com/2', postedDate: '2026-07-28', contractType: null, isRemote: false, hasSponsorship: false });

    expect(reed.descriptionAvailability).toBe('FULL');
    expect(jooble.descriptionAvailability).toBe('PARTIAL');
  });
});
