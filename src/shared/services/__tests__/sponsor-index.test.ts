import { describe, expect, it } from 'vitest';

import {
  buildSponsorIndex,
  MAX_FUZZY_CANDIDATES,
  SponsorIndexStore,
} from '@/shared/services/sponsor-index';

const register = [
  { organisationName: 'Acme Technology Limited' },
  { organisationName: 'Acme Health UK Limited' },
  { organisationName: 'Acme Health Services Limited' },
  { organisationName: 'North Health Trust' },
  { organisationName: 'North Health Services Limited' },
  { organisationName: 'Collision LLP' },
  { organisationName: 'Collision Limited' },
];

describe('SponsorIndex', () => {
  const index = buildSponsorIndex('register-v1', register);

  it('matches a unique exact legal name across case, punctuation, whitespace and suffixes', () => {
    expect(index.matchEmployer('  ACME technology, ltd. ')).toMatchObject({
      status: 'EXACT', matchedOrganisationName: 'Acme Technology Limited', registerVersion: 'register-v1',
    });
  });

  it('returns ambiguity for an exact-key collision rather than choosing a row', () => {
    expect(index.matchEmployer('collision')).toMatchObject({
      status: 'AMBIGUOUS',
      candidateOrganisationNames: ['Collision LLP', 'Collision Limited'],
    });
  });

  it('makes conservative likely matches from narrowed identity evidence', () => {
    expect(index.matchEmployer('Acme Tech')).toMatchObject({ status: 'LIKELY', matchedOrganisationName: 'Acme Technology Limited' });
    expect(index.matchEmployer('Acme Technology London')).toMatchObject({ status: 'LIKELY', matchedOrganisationName: 'Acme Technology Limited' });
  });

  it('does not choose between plausible subsidiaries or generic names', () => {
    expect(index.matchEmployer('Acme Health')).toMatchObject({ status: 'AMBIGUOUS' });
    expect(index.matchEmployer('North Health')).toMatchObject({ status: 'AMBIGUOUS' });
    expect(index.matchEmployer('Services')).toMatchObject({ status: 'NONE' });
  });

  it('safely rejects unrelated and malformed employer names', () => {
    expect(index.matchEmployer('Unrelated Bakery')).toMatchObject({ status: 'NONE' });
    expect(index.matchEmployer('')).toMatchObject({ status: 'NONE' });
    expect(index.matchEmployer('---')).toMatchObject({ status: 'NONE' });
    expect(index.matchEmployer('https://example.com/company')).toMatchObject({ status: 'NONE' });
    expect(index.matchEmployer(`Acme\u0000Technology`)).toMatchObject({ status: 'NONE' });
    expect(index.matchEmployer('A'.repeat(257))).toMatchObject({ status: 'NONE' });
  });

  it('uses bounded inverted-index candidates rather than scanning every row per lookup', () => {
    const rows = Array.from({ length: 5_000 }, (_, id) => ({ organisationName: `Organisation ${id} Holdings Limited` }));
    rows.push({ organisationName: 'Pineapple Systems Limited' });
    const large = buildSponsorIndex('large-v1', rows);
    const match = large.matchEmployer('Pineapple Systems London');
    expect(match.status).toBe('LIKELY');
    expect(large.metrics.sourceRowCount).toBe(5_001);
    expect(large.metrics.tokenReferenceCount).toBeGreaterThan(5_000);
    expect(MAX_FUZZY_CANDIDATES).toBeLessThan(rows.length);
  });

  it('shares one construction promise per process/register version', async () => {
    const store = new SponsorIndexStore();
    const [first, second, third] = await Promise.all([
      store.getOrBuild('register-v2', register),
      store.getOrBuild('register-v2', register),
      store.getOrBuild('register-v2', register),
    ]);
    expect(first).toBe(second);
    expect(second).toBe(third);
    const refreshed = await store.getOrBuild('register-v3', register);
    expect(refreshed.registerVersion).toBe('register-v3');
    expect(refreshed).not.toBe(first);
  });
});
