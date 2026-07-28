import { describe, expect, it } from 'vitest';
import {
  buildBoardApiUrl,
  buildPublicBoardUrl,
  isAllowedBoardHost,
  validateProviderIdentifier,
} from '@/shared/services/employer-source-validation';
import { canQueryEmployerSource } from '@/shared/types/employer-source';
import { EMPLOYER_ATS_PROVIDERS, type EmployerAtsProvider } from '@/shared/types/job';

const valid = (provider: EmployerAtsProvider, identifier: string) =>
  validateProviderIdentifier(provider, identifier).valid;

describe('employer board identifier validation', () => {
  it('accepts well-formed identifiers for each provider', () => {
    expect(valid('GREENHOUSE', 'acmecorp')).toBe(true);
    expect(valid('LEVER', 'acme-corp')).toBe(true);
    expect(valid('SMARTRECRUITERS', 'AcmeCorp')).toBe(true);
    expect(valid('ASHBY', 'acme.corp_uk')).toBe(true);
  });

  it('applies provider-specific charsets rather than one loose rule', () => {
    // Greenhouse tokens and SmartRecruiters ids are alphanumeric only.
    expect(valid('GREENHOUSE', 'acme-corp')).toBe(false);
    expect(valid('SMARTRECRUITERS', 'acme-corp')).toBe(false);
    // Lever permits internal hyphens but not dots.
    expect(valid('LEVER', 'acme.corp')).toBe(false);
  });

  describe('rejects identifiers that could redirect a server-side request', () => {
    // Each of these, interpolated unchecked into a board URL, sends the server
    // somewhere other than the provider's board endpoint.
    const hostile = [
      ['a path separator', 'acme/../../admin'],
      ['a bare traversal', '..'],
      ['an internal dot segment', 'acme..corp'],
      ['a backslash', 'acme\\admin'],
      ['an absolute URL', 'https://attacker.example'],
      ['a protocol-relative URL', '//attacker.example'],
      ['a percent-encoded separator', 'acme%2f..'],
      ['a query string', 'acme?x=1'],
      ['a fragment', 'acme#x'],
      ['a port', 'acme:8080'],
      ['an at-sign authority', 'acme@attacker.example'],
      ['whitespace', 'acme corp'],
      ['a newline', 'acme\ncorp'],
    ] as const;

    for (const [description, identifier] of hostile) {
      it(`rejects ${description}`, () => {
        for (const provider of EMPLOYER_ATS_PROVIDERS) {
          const result = validateProviderIdentifier(provider, identifier);
          expect(result.valid, `${provider} accepted ${JSON.stringify(identifier)}`).toBe(false);
          if (!result.valid) expect(result.failureCode).toBe('INVALID_IDENTIFIER');
        }
      });
    }
  });

  it('rejects empty, untrimmed and over-long identifiers', () => {
    expect(valid('GREENHOUSE', '')).toBe(false);
    // Untrimmed input is a data defect; repairing it silently would hide it.
    expect(valid('GREENHOUSE', ' acme ')).toBe(false);
    expect(valid('GREENHOUSE', 'a'.repeat(61))).toBe(false);
    expect(valid('GREENHOUSE', 'a'.repeat(60))).toBe(true);
  });
});

describe('board URL construction', () => {
  it('builds the documented API endpoint for each provider', () => {
    expect(buildBoardApiUrl({ provider: 'GREENHOUSE', providerIdentifier: 'acme' }))
      .toBe('https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true');
    expect(buildBoardApiUrl({ provider: 'SMARTRECRUITERS', providerIdentifier: 'acme' }))
      .toBe('https://api.smartrecruiters.com/v1/companies/acme/postings');
    expect(buildBoardApiUrl({ provider: 'ASHBY', providerIdentifier: 'acme' }))
      .toBe('https://api.ashbyhq.com/posting-api/job-board/acme');
  });

  it('routes Lever to the region’s host, defaulting to global', () => {
    // The wrong regional host 404s a perfectly valid site, which would be
    // recorded as an unverifiable employer rather than a configuration error.
    expect(buildBoardApiUrl({ provider: 'LEVER', providerIdentifier: 'acme' }))
      .toContain('https://api.lever.co/');
    expect(buildBoardApiUrl({ provider: 'LEVER', providerIdentifier: 'acme', leverRegion: 'EU' }))
      .toContain('https://api.eu.lever.co/');
  });

  it('builds a public board URL users can open', () => {
    expect(buildPublicBoardUrl({ provider: 'GREENHOUSE', providerIdentifier: 'acme' }))
      .toBe('https://boards.greenhouse.io/acme');
    expect(buildPublicBoardUrl({ provider: 'LEVER', providerIdentifier: 'acme' }))
      .toBe('https://jobs.lever.co/acme');
  });

  it('always produces an HTTPS URL on an allow-listed host', () => {
    for (const provider of EMPLOYER_ATS_PROVIDERS) {
      for (const url of [
        buildBoardApiUrl({ provider, providerIdentifier: 'acme' }),
        buildPublicBoardUrl({ provider, providerIdentifier: 'acme' }),
      ]) {
        expect(new URL(url).protocol).toBe('https:');
        expect(isAllowedBoardHost(url)).toBe(true);
      }
    }
  });

  it('refuses to build a URL from an unvalidated identifier', () => {
    // A throw here means a caller skipped validation — it must not fall through
    // to a fetch against whatever the identifier happened to spell.
    expect(() => buildBoardApiUrl({ provider: 'GREENHOUSE', providerIdentifier: 'acme/../admin' })).toThrow();
    expect(() => buildPublicBoardUrl({ provider: 'LEVER', providerIdentifier: 'https://attacker.example' })).toThrow();
  });
});

describe('isAllowedBoardHost', () => {
  it('accepts provider hosts and rejects everything else', () => {
    expect(isAllowedBoardHost('https://boards.greenhouse.io/acme/jobs/1')).toBe(true);
    expect(isAllowedBoardHost('https://attacker.example/acme')).toBe(false);
    // A board may return an arbitrary absolute URL, so plain HTTP and internal
    // addresses are refused rather than stored as an application link.
    expect(isAllowedBoardHost('http://boards.greenhouse.io/acme')).toBe(false);
    expect(isAllowedBoardHost('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedBoardHost('not a url')).toBe(false);
  });
});

describe('canQueryEmployerSource', () => {
  it('requires both verification and enablement', () => {
    expect(canQueryEmployerSource({ enabled: true, verificationStatus: 'VERIFIED' })).toBe(true);
    // Enabling an unverified source must never make it queryable — that is the
    // rule that stops a guessed board token from reaching the network.
    expect(canQueryEmployerSource({ enabled: true, verificationStatus: 'PENDING' })).toBe(false);
    expect(canQueryEmployerSource({ enabled: true, verificationStatus: 'FAILED' })).toBe(false);
    // An operator may always switch a verified source off.
    expect(canQueryEmployerSource({ enabled: false, verificationStatus: 'VERIFIED' })).toBe(false);
  });
});
