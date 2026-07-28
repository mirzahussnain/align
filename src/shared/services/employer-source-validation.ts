/**
 * Identifier validation and board-URL construction for employer-direct ATS
 * sources. Pure and synchronous — no network, no database.
 *
 * This is the SSRF boundary for the employer directory. A board identifier is
 * interpolated into a URL path, so an unvalidated one is a path-traversal and
 * request-forgery primitive: `acme/../../admin`, `acme%2f..`, an absolute
 * `https://attacker.example` or a bare `..` would each redirect a server-side
 * fetch somewhere it must never go. Every identifier is therefore matched
 * against a provider-specific allow-list charset, and every constructed URL is
 * re-parsed and checked against a host allow-list before it is returned. It
 * follows the same shape as `isValidSponsorUrl` in sponsor-registry.ts.
 *
 * The URL templates encode each provider's documented public endpoint. They are
 * asserted against live boards by the verification service, which is what
 * actually promotes a source to VERIFIED — nothing here claims an identifier is
 * real, only that it is safe to try.
 */

import type { EmployerAtsProvider } from '@/shared/types/job';
import type {
  EmployerJobSourceRef,
  EmployerSourceFailureCode,
  LeverRegion,
} from '@/shared/types/employer-source';

/**
 * Charset each provider's identifier is permitted to use. Deliberately narrower
 * than "whatever the provider might accept": a rejected legitimate board is a
 * missing directory row, an accepted hostile one is a server-side request to an
 * attacker's choice of host.
 */
const IDENTIFIER_PATTERNS: Record<EmployerAtsProvider, RegExp> = {
  // Greenhouse board tokens are alphanumeric, conventionally lowercase.
  GREENHOUSE: /^[A-Za-z0-9]{2,60}$/,
  // Lever site names are alphanumeric with internal hyphens.
  LEVER: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,58}[A-Za-z0-9])?$/,
  // SmartRecruiters company identifiers are alphanumeric.
  SMARTRECRUITERS: /^[A-Za-z0-9]{2,60}$/,
  // Ashby job-board names additionally allow internal dots and underscores.
  ASHBY: /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,58}[A-Za-z0-9])?$/,
};

/** Hosts a constructed board URL may address. Anything else is rejected. */
const ALLOWED_HOSTS = new Set([
  'boards-api.greenhouse.io',
  'boards.greenhouse.io',
  'api.lever.co',
  'api.eu.lever.co',
  'jobs.lever.co',
  'api.smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'api.ashbyhq.com',
  'jobs.ashbyhq.com',
]);

const LEVER_API_HOST: Record<LeverRegion, string> = {
  GLOBAL: 'api.lever.co',
  EU: 'api.eu.lever.co',
};

export type IdentifierValidation =
  | { valid: true; identifier: string }
  | { valid: false; failureCode: Extract<EmployerSourceFailureCode, 'INVALID_IDENTIFIER'>; reason: string };

/**
 * Whether `identifier` is safe to interpolate into `provider`'s board URL.
 * Rejects anything containing a path separator, scheme, encoded character,
 * whitespace or dot-segment before the charset test even applies.
 */
export function validateProviderIdentifier(
  provider: EmployerAtsProvider,
  identifier: string
): IdentifierValidation {
  const reject = (reason: string): IdentifierValidation => ({
    valid: false,
    failureCode: 'INVALID_IDENTIFIER',
    reason,
  });

  if (typeof identifier !== 'string') return reject('Identifier must be a string.');
  // No trimming: a stored identifier with surrounding whitespace is a data
  // defect, and silently repairing it hides the defect from verification.
  if (identifier !== identifier.trim()) return reject('Identifier has leading or trailing whitespace.');
  if (!identifier) return reject('Identifier is empty.');
  if (identifier.length > 60) return reject('Identifier is longer than 60 characters.');
  // Dot segments would escape the intended path even inside an allowed host.
  if (identifier.includes('..')) return reject('Identifier contains a dot segment.');
  if (!IDENTIFIER_PATTERNS[provider].test(identifier)) {
    return reject(`Identifier is not valid for ${provider}.`);
  }
  return { valid: true, identifier };
}

/** Re-parse a constructed URL and confirm it still points where intended. */
function assertAllowedUrl(url: string, identifier: string): string {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error(`Board URL is not HTTPS: ${parsed.protocol}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`Board URL host is not allowed: ${parsed.hostname}`);
  // The identifier must survive parsing as a single intact path segment; if it
  // does not, it changed the shape of the URL rather than filling a slot in it.
  if (!parsed.pathname.split('/').includes(identifier)) {
    throw new Error('Board URL does not contain the identifier as a path segment.');
  }
  return parsed.toString();
}

/**
 * The machine-readable endpoint listing a board's vacancies.
 *
 * @throws when the identifier fails validation — callers hold a validated
 * identifier by then, so a throw here means a validation step was skipped.
 */
export function buildBoardApiUrl(source: EmployerJobSourceRef): string {
  const validation = validateProviderIdentifier(source.provider, source.providerIdentifier);
  if (!validation.valid) throw new Error(validation.reason);
  const id = validation.identifier;

  switch (source.provider) {
    case 'GREENHOUSE':
      return assertAllowedUrl(`https://boards-api.greenhouse.io/v1/boards/${id}/jobs?content=true`, id);
    case 'LEVER':
      return assertAllowedUrl(`https://${LEVER_API_HOST[source.leverRegion ?? 'GLOBAL']}/v0/postings/${id}?mode=json`, id);
    case 'SMARTRECRUITERS':
      return assertAllowedUrl(`https://api.smartrecruiters.com/v1/companies/${id}/postings`, id);
    case 'ASHBY':
      return assertAllowedUrl(`https://api.ashbyhq.com/posting-api/job-board/${id}`, id);
  }
}

/** The human-facing board a user can open. Same validation as the API URL. */
export function buildPublicBoardUrl(source: EmployerJobSourceRef): string {
  const validation = validateProviderIdentifier(source.provider, source.providerIdentifier);
  if (!validation.valid) throw new Error(validation.reason);
  const id = validation.identifier;

  switch (source.provider) {
    case 'GREENHOUSE':
      return assertAllowedUrl(`https://boards.greenhouse.io/${id}`, id);
    case 'LEVER':
      return assertAllowedUrl(`https://jobs.lever.co/${id}`, id);
    case 'SMARTRECRUITERS':
      return assertAllowedUrl(`https://jobs.smartrecruiters.com/${id}`, id);
    case 'ASHBY':
      return assertAllowedUrl(`https://jobs.ashbyhq.com/${id}`, id);
  }
}

/**
 * Whether an application URL returned by a board is one we will store and show.
 * A board can return an arbitrary `absolute_url`, so it is checked rather than
 * trusted; anything off the provider's own hosts is treated as unverified.
 */
export function isAllowedBoardHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}
