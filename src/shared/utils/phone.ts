import {
  parsePhoneNumberFromString,
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from 'libphonenumber-js';

/**
 * The one phone contract.
 *
 * `ProfileIdentity` stores a phone in three columns — `phoneDialCode`,
 * `phoneNumber`, `phoneCountry` — and every producer must agree on what goes in
 * each, or the dial-code picker renders empty beside a number field holding
 * "+44 7737-853800". That is exactly the defect this module exists to stop, and
 * it can only be stopped in one place: the split has to happen wherever a phone
 * ENTERS the system (CV import, the profile form, a paste into either), not in
 * the component that draws it.
 *
 *   phoneDialCode  "+44"        always leading "+", digits only after it
 *   phoneNumber    "7737853800" national significant number, digits only
 *   phoneCountry   "GB"         ISO 3166-1 alpha-2, when it can be known
 *
 * The stored form is canonical and unformatted. Display formatting is the UI's
 * business and is derived, never persisted — a CV that writes "7737-853800" and
 * one that writes "7737 853800" are the same number and must compare equal.
 *
 * Parsing is delegated to libphonenumber-js. Hand-rolled dial-code regexes get
 * the easy half of the world right and then quietly mangle +1 area codes, Italian
 * leading zeros and every variable-length national prefix; this is the wrong
 * problem to own.
 */

export interface NormalisedPhone {
  /** International dial code with its leading `+`, e.g. "+44". */
  dialCode: string;
  /** National significant number, digits only, no trunk prefix. */
  nationalNumber: string;
  /** ISO2 country, when the number identifies one unambiguously. */
  country?: string;
  /** E.164, for comparison. */
  e164: string;
  /**
   * `international` — the input stated its own dial code, so nothing was assumed.
   * `country_context` — a national-format number read against a supplied country.
   *   Correct only if that country is correct, so it is proposed for review
   *   rather than treated as settled.
   */
  basis: 'international' | 'country_context';
}

/**
 * Digits, spaces and the punctuation a written phone number uses.
 *
 * A leading bracket counts: "(0161) 555 0123" is how a great many people write
 * a number with an area code, and requiring a digit or a plus first rejects it.
 */
const PHONE_SHAPED = /^[+(\d][\d\s().\-/]*$/;

/**
 * Normalise a written phone number into the stored contract.
 *
 * Returns null rather than guessing. A local number with no country context —
 * "07737 853800" on a CV that never says where the candidate is — is genuinely
 * ambiguous: the same digits are a valid mobile in several countries, and
 * picking one puts a wrong dialling code on the user's CV. The caller surfaces
 * it for review with the raw value intact.
 *
 * `defaultCountry` is only ever a SIGNAL, never a default in the ordinary sense:
 * pass it when the document or the user's own profile states a country, and
 * leave it out when nothing does.
 */
export function normalisePhone(raw: string, defaultCountry?: string): NormalisedPhone | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // "0044 …" is the international prefix written the old way. libphonenumber
  // understands it only for a known country, and a CV that writes it has already
  // told us the number is international — rewriting it to "+" keeps that fact
  // without needing to know where the writer was standing.
  //
  // "+44 (0)7700 …" is the other convention this has to survive: the bracketed
  // zero is a note to the reader that a domestic caller dials it and an
  // international one does not. libphonenumber-js reads the digits and only the
  // digits, so it sees +4407700… and calls it invalid; the bracketed trunk code
  // is removed before parsing rather than after failing.
  const prepared = trimmed.replace(/^00(?=\d)/, '+').replace(/^(\+\d{1,3})[\s.-]*\(0\)[\s.-]*/, '$1');
  const country = asCountryCode(defaultCountry);
  const parsed = parsePhoneNumberFromString(prepared, country ? { defaultCountry: country } : undefined);
  if (!parsed) return null;

  // How strictly the number has to check out depends on what we are asking of it.
  //
  // When the input STATED its dial code, the split is already a fact the document
  // supplied and validity adds nothing: `isValid` also rejects correctly-formed
  // numbers in ranges the regulator has not allocated, and refusing to split one
  // of those puts the whole international string back in the national-number
  // field — the exact defect this module exists to prevent.
  //
  // When the dial code is being INFERRED from a country context, validity is the
  // only thing standing between "this is a national number here" and attaching a
  // country to digits that are not a phone number in it at all.
  const stated = prepared.startsWith('+');
  if (!(stated ? parsed.isPossible() : parsed.isValid())) return null;

  const dialCode = `+${parsed.countryCallingCode}`;
  return {
    dialCode,
    nationalNumber: parsed.nationalNumber,
    ...(parsed.country ? { country: parsed.country } : {}),
    e164: parsed.number,
    basis: stated ? 'international' : 'country_context',
  };
}

/** Is this even worth handing to the parser? */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_SHAPED.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

const COUNTRY_CODES = new Set<string>(getCountries());

/** A valid ISO2 country code, or undefined. Accepts any casing. */
export function asCountryCode(value: string | null | undefined): CountryCode | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  return COUNTRY_CODES.has(upper) ? (upper as CountryCode) : undefined;
}

/** The dial code for an ISO2 country, e.g. "GB" → "+44". */
export function dialCodeForCountry(iso2: string): string | undefined {
  const country = asCountryCode(iso2);
  return country ? `+${getCountryCallingCode(country)}` : undefined;
}

/**
 * Repair a phone that was stored against the old, broken contract.
 *
 * Rows written before the split existed hold the whole international number in
 * `phoneNumber` with an empty `phoneDialCode`, which is what makes the picker
 * render blank. This re-derives all three fields from whatever is there, and
 * returns the input unchanged when it is already correct or when it cannot be
 * parsed — a value we cannot read is left exactly as the user typed it rather
 * than being cleared.
 */
export function repairStoredPhone(stored: {
  phoneDialCode?: string | null;
  phoneNumber?: string | null;
  phoneCountry?: string | null;
}): { phoneDialCode: string; phoneNumber: string; phoneCountry: string } {
  const dialCode = (stored.phoneDialCode ?? '').trim();
  const number = (stored.phoneNumber ?? '').trim();
  const country = (stored.phoneCountry ?? '').trim();
  const unchanged = { phoneDialCode: dialCode, phoneNumber: number, phoneCountry: country };
  if (!number) return unchanged;

  // Already canonical: a dial code is set and the number carries no code of its own.
  if (dialCode && !number.startsWith('+') && !number.startsWith('00')) return unchanged;

  const normalised = normalisePhone(
    number.startsWith('+') || number.startsWith('00') ? number : `${dialCode}${number}`,
    country
  );
  if (!normalised) return unchanged;
  return {
    phoneDialCode: normalised.dialCode,
    phoneNumber: normalised.nationalNumber,
    phoneCountry: normalised.country ?? country,
  };
}
