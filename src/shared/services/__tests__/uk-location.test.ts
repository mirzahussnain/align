import { describe, expect, it } from 'vitest';
import { assessUkLocation, isUkDiscoverable } from '@/shared/services/uk-location';

const verdict = (input: Parameters<typeof assessUkLocation>[0]) =>
  assessUkLocation(input).eligibility;

describe('UK vacancies are admitted', () => {
  it('admits an explicit country term', () => {
    expect(verdict({ locationText: 'London, United Kingdom' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Cardiff, UK' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Glasgow, Scotland' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Belfast, Northern Ireland' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Swansea, Wales' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Manchester, England' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Leeds, Great Britain' })).toBe('CONFIRMED_UK');
  });

  it('admits an unambiguous UK city on its own', () => {
    // Birmingham is the brief's own example, and is deliberately treated as
    // AMBIGUOUS (Birmingham, Alabama) — so it needs corroboration.
    expect(verdict({ locationText: 'Birmingham, West Midlands' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Sheffield' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Edinburgh' })).toBe('CONFIRMED_UK');
  });

  it('admits a UK postcode', () => {
    expect(verdict({ locationText: 'B3 2TA' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Service desk, LS1 4AP' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'EC1A 1BB' })).toBe('CONFIRMED_UK');
  });

  it('admits a remote role that explicitly accepts UK candidates', () => {
    expect(verdict({ locationText: 'Remote - UK', remote: true })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'United Kingdom Remote', remote: true })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Remote (United Kingdom)', remote: true })).toBe('CONFIRMED_UK');
  });

  it('admits an explicit GB country field even when the text is unhelpful', () => {
    expect(verdict({ locationText: 'Head office', country: 'GB' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Head office', providerCountryCode: 'GB' })).toBe('CONFIRMED_UK');
  });

  it('marks an ambiguous city LIKELY_UK rather than confirmed', () => {
    expect(verdict({ locationText: 'Birmingham' })).toBe('LIKELY_UK');
    expect(verdict({ locationText: 'London' })).toBe('LIKELY_UK');
    expect(verdict({ locationText: 'Manchester' })).toBe('LIKELY_UK');
  });
});

describe('non-UK vacancies are excluded', () => {
  it('excludes the United States', () => {
    expect(verdict({ locationText: 'San Francisco, USA' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'New York, United States' })).toBe('NOT_UK');
  });

  it('excludes a "City, ST" United States suffix', () => {
    expect(verdict({ locationText: 'Birmingham, AL' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Cambridge, MA' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Mountain View, CA' })).toBe('NOT_UK');
  });

  it('excludes Spain, Germany and India', () => {
    expect(verdict({ locationText: 'Madrid, Spain' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Barcelona' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Berlin, Germany' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Bengaluru, India' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Gurugram' })).toBe('UNKNOWN');
  });

  it('excludes a remote role fenced to another country', () => {
    expect(verdict({ locationText: 'Remote - US only', remote: true })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Remote (Canada)', remote: true })).toBe('NOT_UK');
  });

  it('lets non-UK evidence beat a shared city name', () => {
    // "London, Ontario" is not a UK vacancy, however strong the word London is.
    expect(verdict({ locationText: 'London, Ontario' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'London, Ontario, Canada' })).toBe('NOT_UK');
  });

  it('lets an explicit non-GB provider country beat UK-looking text', () => {
    // The employer having a UK office is not evidence about THIS vacancy.
    expect(verdict({ locationText: 'London', providerCountryCode: 'US' })).toBe('NOT_UK');
  });

  it('does not read the UK city York inside the US city New York', () => {
    // MEASURED REGRESSION. A bare word match on "york" classified every New
    // York requisition as CONFIRMED_UK, and these strings were observed reaching
    // live Discover results. The foreign-place list is checked before any UK
    // place name precisely so an embedded namesake cannot carry the decision.
    expect(verdict({ locationText: 'New York City' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'New York City, New York' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'New York, New York, United States' })).toBe('NOT_UK');
    // The real York still resolves.
    expect(verdict({ locationText: 'York' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'York, North Yorkshire' })).toBe('CONFIRMED_UK');
  });

  it('recognises US state names, not only the country name', () => {
    expect(verdict({ locationText: 'Boston, Massachusetts' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Bellevue, Washington' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Mountain View, California (HQ)' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Austin, Texas' })).toBe('NOT_UK');
  });

  it('rejects a multi-site listing where every site is abroad', () => {
    expect(
      verdict({
        locationText:
          'Bellevue, Washington; Chicago, Illinois; New York, New York; San Francisco, California; Washington, DC',
      }),
    ).toBe('NOT_UK');
    expect(verdict({ locationText: 'San Francisco, CA; New York, NY' })).toBe('NOT_UK');
  });
});

describe('a UK nation name inside a foreign place name', () => {
  it('does not read Wales inside New South Wales', () => {
    // MEASURED REGRESSION, and the second of its kind. A bare word match on the
    // UK nation names read "New South Wales" as an explicit statement that the
    // vacancy was British, which admitted every Sydney requisition to UK
    // Discover. Whenever a country term is added, ask what larger place name
    // contains it.
    expect(verdict({ locationText: 'Sydney, New South Wales, Australia' })).toBe('NOT_UK');
    expect(verdict({ locationText: 'Sydney, New South Wales' })).toBe('NOT_UK');
  });

  it('still resolves the real Wales, including its compass regions', () => {
    expect(verdict({ locationText: 'Cardiff, Wales' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Swansea, South Wales' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Bangor, North Wales' })).toBe('CONFIRMED_UK');
  });

  it('does not read Ireland inside Northern Ireland, nor admit the Republic', () => {
    expect(verdict({ locationText: 'Belfast, Northern Ireland' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Dublin, Ireland' })).toBe('NOT_UK');
  });

  it('admits a multi-site listing that includes a genuine UK site', () => {
    // A vacancy that names a UK office IS available in the UK, whatever else it
    // also lists.
    expect(verdict({ locationText: 'London, United Kingdom; Paris, France' })).toBe('CONFIRMED_UK');
    expect(
      verdict({ locationText: 'Remote, Canada; Remote, India; Remote, United Kingdom' }),
    ).toBe('CONFIRMED_UK');
  });
});

describe('explicit UK evidence outranks a foreign namesake', () => {
  it('keeps a UK town that shares its name with a US city', () => {
    // Washington in Tyne and Wear, and Boston in Lincolnshire, are real UK
    // vacancies. Naming the country is what distinguishes them, so that check
    // has to run before the foreign-place list rather than after it.
    expect(verdict({ locationText: 'Washington, Tyne and Wear, United Kingdom' })).toBe('CONFIRMED_UK');
    expect(verdict({ locationText: 'Boston, Lincolnshire, UK' })).toBe('CONFIRMED_UK');
  });

  it('keeps a UK vacancy identified only by its postcode', () => {
    expect(verdict({ locationText: 'Boston PE21 6JF' })).toBe('CONFIRMED_UK');
  });

  it('still lets structured provider country metadata overrule the text', () => {
    // Provider metadata is structured data ABOUT the vacancy; a string that
    // mentions a place is not. The metadata wins.
    expect(
      verdict({ locationText: 'London, United Kingdom', providerCountryCode: 'US' }),
    ).toBe('NOT_UK');
  });
});

describe('unknown geography is excluded from launch Discover', () => {
  it('treats a bare "Remote" as unknown, not UK', () => {
    // "Remote" says where the desk is, not which labour market it serves.
    expect(verdict({ locationText: 'Remote', remote: true })).toBe('UNKNOWN');
    expect(verdict({ locationText: 'Distributed', remote: true })).toBe('UNKNOWN');
  });

  it('treats an empty or contentless location as unknown', () => {
    expect(verdict({})).toBe('UNKNOWN');
    expect(verdict({ locationText: '' })).toBe('UNKNOWN');
    expect(verdict({ locationText: 'Hybrid' })).toBe('UNKNOWN');
  });

  it('excludes UNKNOWN and NOT_UK from the launch policy, admitting the rest', () => {
    expect(isUkDiscoverable('CONFIRMED_UK')).toBe(true);
    expect(isUkDiscoverable('LIKELY_UK')).toBe(true);
    expect(isUkDiscoverable('NOT_UK')).toBe(false);
    expect(isUkDiscoverable('UNKNOWN')).toBe(false);
  });
});

describe('normalised output', () => {
  it('reports GB and a normalised location for an admitted vacancy', () => {
    const assessment = assessUkLocation({ locationText: '  Birmingham,   West Midlands ' });
    expect(assessment.countryCode).toBe('GB');
    expect(assessment.countryConfidence).toBe('HIGH');
    expect(assessment.normalisedLocation).toBe('Birmingham, West Midlands');
  });

  it('reports the excluding country for a rejected vacancy', () => {
    expect(assessUkLocation({ locationText: 'Madrid, Spain' }).countryCode).toBe('ES');
    expect(assessUkLocation({ locationText: 'Austin, TX' }).countryCode).toBe('US');
  });

  it('carries machine-readable evidence codes and no free text', () => {
    const assessment = assessUkLocation({ locationText: 'Leeds LS1 4AP, United Kingdom' });
    expect(assessment.evidence).toContain('explicit_uk_country');
    expect(assessment.evidence).toContain('uk_postcode');
    // Evidence codes are safe to log: no location text leaks into them.
    for (const code of assessment.evidence) expect(code).toMatch(/^[a-z_:]+$/);
  });
});
