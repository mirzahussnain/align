/** Canonical directory identity key. It intentionally does not assert legal equivalence. */
const LEGAL_SUFFIXES = new Set(['ltd', 'limited', 'plc', 'llp', 'llc', 'inc', 'incorporated']);

export function normaliseEmployerName(value: string): string {
  if (typeof value !== 'string' || !value) return '';
  const normalised = value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-GB').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = normalised.split(/\s+/).filter(Boolean);
  while (tokens.length && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ');
}