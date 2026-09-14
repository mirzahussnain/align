import { describe, expect, it } from 'vitest';
import {
  asCountryCode,
  dialCodeForCountry,
  looksLikePhone,
  normalisePhone,
  repairStoredPhone,
} from '../phone';

/**
 * The phone contract, tested against the shapes CVs actually write.
 *
 * The defect being locked down: a whole international number landing in the
 * national-number column with an empty dial code. Every case below therefore
 * asserts the SPLIT, not just that parsing succeeded.
 */

describe('normalisePhone', () => {
  it('splits the number from the CV that exposed the defect', () => {
    expect(normalisePhone('+44 7737-853800')).toMatchObject({
      dialCode: '+44',
      nationalNumber: '7737853800',
      country: 'GB',
      basis: 'international',
    });
  });

  it('reads the spacing and punctuation variants of the same number as one number', () => {
    const forms = ['+44 7737 853800', '+44 (0)7737 853800', '0044 7737 853800', '+447737853800'];
    for (const form of forms) {
      expect(normalisePhone(form), form).toMatchObject({
        dialCode: '+44',
        nationalNumber: '7737853800',
      });
    }
  });

  it('reads a UK local number when a country context is supplied', () => {
    expect(normalisePhone('07737 853800', 'GB')).toMatchObject({
      dialCode: '+44',
      nationalNumber: '7737853800',
      country: 'GB',
      basis: 'country_context',
    });
    expect(normalisePhone('07737853800', 'GB')?.nationalNumber).toBe('7737853800');
  });

  it('refuses to guess a country for a local number with no context', () => {
    // The same digits are a valid number in more than one country. Returning
    // null is what sends this to review with the raw wording intact.
    expect(normalisePhone('07737 853800')).toBeNull();
  });

  it('records the basis, so a country-derived split can be reviewed differently', () => {
    expect(normalisePhone('+44 7737 853800', 'US')?.basis).toBe('international');
    expect(normalisePhone('07737 853800', 'GB')?.basis).toBe('country_context');
  });

  it('reads a US number without mangling the area code', () => {
    expect(normalisePhone('+1 (415) 555-2671')).toMatchObject({
      dialCode: '+1',
      nationalNumber: '4155552671',
      country: 'US',
    });
  });

  it('returns null rather than a partial split for something that is not a number', () => {
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('not a phone')).toBeNull();
    expect(normalisePhone('12')).toBeNull();
  });
});

describe('looksLikePhone', () => {
  it('accepts written phone shapes and rejects prose and postcodes', () => {
    expect(looksLikePhone('+44 7737-853800')).toBe(true);
    expect(looksLikePhone('07737 853800')).toBe(true);
    expect(looksLikePhone('(0161) 555 0123')).toBe(true);
    expect(looksLikePhone('B15 2TT')).toBe(false);
    expect(looksLikePhone('Manchester')).toBe(false);
  });
});

describe('repairStoredPhone', () => {
  it('repairs the exact broken row this correction was raised for', () => {
    // What was in the database: the whole international string in `phoneNumber`
    // and no dial code, which renders as an empty picker beside a full number.
    expect(
      repairStoredPhone({ phoneDialCode: null, phoneNumber: '+44 7737-853800', phoneCountry: null })
    ).toEqual({ phoneDialCode: '+44', phoneNumber: '7737853800', phoneCountry: 'GB' });
  });

  it('leaves a correctly split row exactly as it is', () => {
    const stored = { phoneDialCode: '+44', phoneNumber: '7737853800', phoneCountry: 'GB' };
    expect(repairStoredPhone(stored)).toEqual(stored);
  });

  it('joins a dial code and a national number when asked to re-derive', () => {
    expect(
      repairStoredPhone({ phoneDialCode: '', phoneNumber: '00447737853800', phoneCountry: '' })
    ).toEqual({ phoneDialCode: '+44', phoneNumber: '7737853800', phoneCountry: 'GB' });
  });

  it('leaves an unparseable value alone rather than clearing it', () => {
    // Plenty of valid numbers are written in ways no library recognises. Losing
    // one is worse than storing it unsplit.
    const stored = { phoneDialCode: '', phoneNumber: 'ext. 4471', phoneCountry: '' };
    expect(repairStoredPhone(stored)).toEqual({
      phoneDialCode: '',
      phoneNumber: 'ext. 4471',
      phoneCountry: '',
    });
  });

  it('is a no-op on an empty phone', () => {
    expect(repairStoredPhone({})).toEqual({ phoneDialCode: '', phoneNumber: '', phoneCountry: '' });
  });
});

describe('country helpers', () => {
  it('accepts an ISO2 in any casing and rejects anything else', () => {
    expect(asCountryCode('gb')).toBe('GB');
    expect(asCountryCode('GB')).toBe('GB');
    expect(asCountryCode('United Kingdom')).toBeUndefined();
    expect(asCountryCode('')).toBeUndefined();
  });

  it('maps a country to its dial code', () => {
    expect(dialCodeForCountry('GB')).toBe('+44');
    expect(dialCodeForCountry('US')).toBe('+1');
    expect(dialCodeForCountry('nope')).toBeUndefined();
  });
});
