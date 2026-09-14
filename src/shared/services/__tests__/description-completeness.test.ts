import { describe, expect, it } from 'vitest';
import {
  assessDescriptionCompleteness,
  readableDescriptionText,
} from '@/shared/services/job-description-completeness';
import { classifyDescriptionAvailability, normaliseProviderJob } from '@/shared/services/job-normalisation';
import { getProviderCapabilities } from '@/shared/services/job-providers/capabilities';
import { SEARCH_JOB_PROVIDERS } from '@/shared/types/job';

/**
 * A body long enough and complete enough that only the PROVIDER CONTRACT can
 * decide against it. Kept above the teaser threshold deliberately, so a test
 * about contracts is never accidentally a test about length.
 */
const completeAdvert = [
  'About the role',
  'We are recruiting an IT support technician to join our Birmingham service desk team.',
  'You will be the first point of contact for around 400 colleagues across three sites.',
  '',
  'Responsibilities',
  '- Triage and resolve first-line incidents against agreed service levels.',
  '- Build and deploy standard Windows 11 laptop images.',
  '- Maintain accurate records in the ITSM tool.',
  '',
  'Requirements',
  'Essential: one year in a service desk role, and confident troubleshooting Windows and Microsoft 365.',
  'Desirable: exposure to Active Directory administration and Intune.',
  '',
  'Benefits',
  'We offer 25 days of annual leave, a matched pension and a professional development budget.',
].join('\n');

const shortAdvert = 'We are recruiting an IT support technician for our Birmingham service desk team.';

describe('provider contract is a ceiling on completeness', () => {
  it('never promotes a snippet provider to a full advert', () => {
    // Jooble's field is literally `snippet`, so no Jooble record is a full
    // advert however long it happens to be.
    expect(getProviderCapabilities('JOOBLE').descriptionSemantics).toBe('SNIPPET');
    expect(classifyDescriptionAvailability('JOOBLE', completeAdvert)).toBe('PARTIAL');
    expect(classifyDescriptionAvailability('JOOBLE', 'A'.repeat(5000))).toBe('PARTIAL');
  });

  it('never promotes a provider that declares partial search bodies', () => {
    // THE CORE REGRESSION. Adzuna and Reed both DECLARE `PARTIAL` semantics —
    // their search endpoints return a shortened body and the full advert needs a
    // per-job call this integration does not make. The previous classifier only
    // demoted SNIPPET and UNKNOWN, so both were persisted FULL on text of any
    // shape, and virtually every aggregator card claimed a complete description.
    for (const provider of ['ADZUNA', 'REED'] as const) {
      expect(getProviderCapabilities(provider).descriptionSemantics).toBe('PARTIAL');
      expect(classifyDescriptionAvailability(provider, completeAdvert)).toBe('PARTIAL');
    }
  });

  it('lets a provider that genuinely serves whole adverts be classified as full', () => {
    // Greenhouse, Lever and Ashby return the employer's own posting body.
    for (const provider of ['GREENHOUSE', 'LEVER', 'ASHBY'] as const) {
      expect(getProviderCapabilities(provider).descriptionSemantics).toBe('FULL');
      expect(classifyDescriptionAvailability(provider, completeAdvert)).toBe('FULL');
    }
  });

  it('treats an unestablished contract as partial rather than full', () => {
    expect(assessDescriptionCompleteness({ description: completeAdvert }).availability).toBe('PARTIAL');
  });

  it('classifies every search provider without a provider-name special case', () => {
    for (const provider of SEARCH_JOB_PROVIDERS) {
      expect(['FULL', 'PARTIAL', 'EXTERNAL_ONLY']).toContain(
        classifyDescriptionAvailability(provider, completeAdvert),
      );
    }
  });
});

describe('truncation signals force PARTIAL even on a full-contract provider', () => {
  const cases: Array<[string, string]> = [
    ['a literal three-dot ellipsis', `${completeAdvert}...`],
    ['a U+2026 ellipsis character', `${completeAdvert}…`],
    ['an HTML &hellip; entity', `${completeAdvert}&hellip;`],
    ['a numeric &#8230; entity', `${completeAdvert}&#8230;`],
    ['a hexadecimal &#x2026; entity', `${completeAdvert}&#x2026;`],
    ['a teaser followed by "read more"', `${shortAdvert} Read more`],
    ['an ellipsis followed by "read more"', `${completeAdvert}… read more`],
    ['a "view full job description" pointer', `${completeAdvert}\nView the full job description on our site.`],
    ['a "click to apply for full details" pointer', `${completeAdvert}\nClick to apply for full details.`],
    ['a "continue reading" pointer', `${completeAdvert}\nContinue reading`],
  ];

  for (const [label, text] of cases) {
    it(`treats ${label} as partial`, () => {
      const assessed = assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: text });
      expect(assessed.availability).toBe('PARTIAL');
    });
  }

  it('detects a truncation marker that only exists inside HTML', () => {
    // `&hellip;` survives sanitation as a character; an anchor-wrapped
    // "read more" does not. Both forms are inspected, before and after.
    const html = `<p>${completeAdvert.replace(/\n/g, '<br/>')}</p><p><a href="https://example.com">Read more</a></p>`;
    expect(assessDescriptionCompleteness({ provider: 'LEVER', description: html }).availability).toBe('PARTIAL');
  });

  it('treats a body that stops mid-sentence as partial', () => {
    const cut = `${completeAdvert}\nThe successful candidate will also be responsible for coordinating with the wider infrastructure team and`;
    expect(assessDescriptionCompleteness({ provider: 'ASHBY', description: cut }).availability).toBe('PARTIAL');
  });

  it('treats a short teaser as partial even with no marker at all', () => {
    expect(assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: shortAdvert }).availability).toBe(
      'PARTIAL',
    );
  });
});

describe('completeness is not over-eager', () => {
  it('does not treat an ordinary closing sentence as truncation', () => {
    // The whole risk of a truncation heuristic is flagging normal prose. A
    // complete advert ending in a full stop must stay FULL.
    const assessed = assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: completeAdvert });
    expect(assessed.availability).toBe('FULL');
    expect(assessed.signals).toEqual([]);
  });

  it('does not treat an unterminated final bullet as truncation', () => {
    const bulleted = `${completeAdvert}\n- A final responsibility with no full stop`;
    expect(assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: bulleted }).availability).toBe('FULL');
  });

  it('does not treat "read more about our benefits" mid-advert as truncation', () => {
    const midway = [
      'About the role',
      'Read more about our benefits on the careers page before you apply.',
      completeAdvert,
    ].join('\n');
    expect(assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: midway }).availability).toBe('FULL');
  });
});

describe('absent and unreadable descriptions', () => {
  it('reports an absent description as external-only rather than empty-but-full', () => {
    // EXTERNAL_ONLY means "go to the source". A FULL empty string would be
    // analysed as an advert with no content.
    expect(classifyDescriptionAvailability('REED', '')).toBe('EXTERNAL_ONLY');
    expect(classifyDescriptionAvailability('GREENHOUSE', '')).toBe('EXTERNAL_ONLY');
    expect(assessDescriptionCompleteness({ description: null }).availability).toBe('EXTERNAL_ONLY');
  });

  it('reports HTML that contains no readable text as external-only', () => {
    expect(
      assessDescriptionCompleteness({ provider: 'GREENHOUSE', description: '<div><span></span></div>' }).availability,
    ).toBe('EXTERNAL_ONLY');
  });

  it('marks a marker-only body unreadable so no Description tab is offered', () => {
    const assessed = assessDescriptionCompleteness({ provider: 'ADZUNA', description: 'Read more…' });
    expect(assessed.availability).toBe('PARTIAL');
    expect(assessed.hasReadableText).toBe(false);
  });

  it('keeps a meaningful excerpt readable so its Description tab still opens onto content', () => {
    const assessed = assessDescriptionCompleteness({ provider: 'ADZUNA', description: `${shortAdvert}...` });
    expect(assessed.availability).toBe('PARTIAL');
    expect(assessed.hasReadableText).toBe(true);
  });
});

describe('user-pasted descriptions', () => {
  it('bypasses the provider ceiling but not the truncation evidence', () => {
    expect(assessDescriptionCompleteness({ description: completeAdvert, userSupplied: true }).availability).toBe('FULL');
    expect(assessDescriptionCompleteness({ description: `${completeAdvert}...`, userSupplied: true }).availability).toBe(
      'PARTIAL',
    );
  });

  it('does not accept a pasted teaser as a complete advert', () => {
    // Pasting is not a promise of completeness. A user can paste back exactly the
    // teaser the provider gave us, and calling that FULL is how a partial
    // analysis gets presented as a reliable match.
    expect(assessDescriptionCompleteness({ description: shortAdvert, userSupplied: true }).availability).toBe('PARTIAL');
  });
});

describe('readable text conversion', () => {
  it('converts provider HTML into paragraphs rather than one collapsed line', () => {
    const { text } = readableDescriptionText('<p>First paragraph.</p><ul><li>One</li><li>Two</li></ul>');
    expect(text).toContain('First paragraph.');
    expect(text).toContain('• One');
    expect(text.split('\n').length).toBeGreaterThan(1);
  });

  it('normalises every ellipsis spelling to one character', () => {
    expect(readableDescriptionText('Ends&hellip;').text).toBe('Ends…');
    expect(readableDescriptionText('Ends&#8230;').text).toBe('Ends…');
  });
});

describe('classification through full provider normalisation', () => {
  const base = {
    title: 'IT Support Technician',
    company: 'Acme Ltd',
    location: 'Birmingham',
    salary: null,
    salaryMin: null,
    salaryMax: null,
    postedDate: '2026-07-28',
    contractType: null,
    isRemote: false,
    hasSponsorship: false,
  } as const;

  it('applies the same classification a direct call would', () => {
    const reed = normaliseProviderJob({
      ...base,
      id: 'reed-1',
      source: 'reed',
      description: completeAdvert,
      url: 'https://example.com/1',
    });
    const jooble = normaliseProviderJob({
      ...base,
      id: 'jooble-1',
      source: 'jooble',
      description: completeAdvert,
      url: 'https://example.com/2',
    });

    // Both aggregators are contractually partial; neither may claim FULL.
    expect(reed.descriptionAvailability).toBe('PARTIAL');
    expect(jooble.descriptionAvailability).toBe('PARTIAL');
  });

  it('stores readable multi-paragraph text rather than a single collapsed line', () => {
    const job = normaliseProviderJob({
      ...base,
      id: 'adzuna-1',
      source: 'adzuna',
      description: '<p>About the role.</p><p>Responsibilities follow.</p>',
      url: 'https://example.com/3',
    });
    expect(job.description).toContain('About the role.');
    expect(job.description).toContain('Responsibilities follow.');
  });
});
