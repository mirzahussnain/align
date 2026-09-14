import { prisma } from '../lib/prisma.ts';
import { buildBoardApiUrl, buildPublicBoardUrl, isSafePublicApplicationUrl, validateProviderIdentifier } from './employer-source-validation.ts';
import { normaliseEmployerName } from './employer-name.ts';
import { validateHostedJobUrl } from './employer-job-url-validation.ts';
import type { EmployerAtsProvider } from '../types/job.ts';
import type { EmployerSourceFailureCode, EmployerSourceVerificationResult, LeverRegion } from '../types/employer-source.ts';

const VERIFY_TIMEOUT_MS = 8_000;

export type VerifyEmployerSourceInput = {
  companyRecordId: string;
  provider: EmployerAtsProvider;
  providerIdentifier: string;
  providerRegion?: LeverRegion;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type BoardPayload = { employerName?: string; jobs: unknown[]; sampleJobUrl?: string };

function stringAt(value: unknown, keys: readonly string[]): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  return undefined;
}

function arrayAt(value: unknown, keys: readonly string[]): unknown[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (Array.isArray(record[key])) return record[key];
  return undefined;
}

/** Minimal shape checks only: this is verification, not a vacancy adapter. */
export function parseEmployerBoardPayload(provider: EmployerAtsProvider, payload: unknown): BoardPayload | null {
  const jobs = provider === 'LEVER'
    ? (Array.isArray(payload) ? payload : undefined)
    : arrayAt(payload, provider === 'SMARTRECRUITERS' ? ['content', 'jobs', 'postings'] : ['jobs', 'postings']);
  if (!jobs) return null;
  const root = payload as Record<string, unknown>;
  const employerName = stringAt(payload, ['name', 'companyName', 'organizationName'])
    ?? stringAt(root?.company, ['name', 'displayName'])
    ?? stringAt(root?.organization, ['name', 'displayName'])
    ?? stringAt(root?.meta, ['name', 'companyName']);
  const sample = jobs[0];
  const sampleJobUrl = stringAt(sample, ['absolute_url', 'applyUrl', 'apply_url', 'hostedUrl', 'jobUrl', 'url']);
  // Lever's public API does not expose a board-level organisation field. Its published postings commonly include the employer identity in the provider-returned opening/description; use that as identity evidence rather than guessing from the site name.
  const leverIdentityEvidence = provider === 'LEVER' ? stringAt(sample, ['company_name', 'companyName', 'organizationName', 'openingPlain', 'descriptionPlain', 'additionalPlain']) : undefined;
  return { employerName: employerName ?? stringAt(sample, ['company_name', 'companyName', 'organizationName']) ?? leverIdentityEvidence, jobs, sampleJobUrl };
}

/** A strong match requires equal normalised names or at least two meaningful shared tokens. */
export function employerIdentityMatches(expected: string, observed: string | undefined): boolean {
  if (!observed) return false;
  const left = normaliseEmployerName(expected);
  const right = normaliseEmployerName(observed);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = new Set(left.split(' ').filter((token) => token.length >= 3));
  const rightTokens = new Set(right.split(' ').filter((token) => token.length >= 3));
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap >= 2 && overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.67;
}

function failed(input: VerifyEmployerSourceInput, code: EmployerSourceFailureCode, reason: string): EmployerSourceVerificationResult {
  return { provider: input.provider, providerIdentifier: input.providerIdentifier, status: 'FAILED', failureCode: code, failureReason: reason, verifiedAt: new Date().toISOString() };
}
/** Lever's public board title is provider-hosted organisation identity evidence.
 * The API lacks a board-level company field, so never infer identity from the
 * site identifier alone. */
async function readProviderBoardIdentity(request: FetchLike, boardUrl: string, signal: AbortSignal): Promise<string | undefined> {
  try {
    const response = await request(boardUrl, { signal, redirect: 'error', headers: { accept: 'text/html', 'user-agent': 'Align employer-source verifier' } });
    if (!response.ok || typeof response.text !== 'function') return undefined;
    const html = await response.text();
    return html.match(/<title[^>]*>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim().replace(/\s+(?:jobs?|careers?|job board)\s*$/i, '');
  } catch { return undefined; }
}

export async function verifyEmployerSourceRequest(
  input: VerifyEmployerSourceInput,
  dependencies: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<EmployerSourceVerificationResult> {
  const validation = validateProviderIdentifier(input.provider, input.providerIdentifier);
  if (!validation.valid) return failed(input, 'INVALID_IDENTIFIER', validation.reason);
  const boardUrl = buildPublicBoardUrl({ provider: input.provider, providerIdentifier: input.providerIdentifier, leverRegion: input.providerRegion });
  const apiUrl = buildBoardApiUrl({ provider: input.provider, providerIdentifier: input.providerIdentifier, leverRegion: input.providerRegion });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? VERIFY_TIMEOUT_MS);
  try {
    const response = await (dependencies.fetch ?? fetch)(apiUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'Align employer-source verifier' },
    });
    if (response.status === 401 || response.status === 403) return failed(input, 'AUTHENTICATION_REQUIRED', 'The public board endpoint requires authentication.');
    if (response.status === 404) return failed(input, 'BOARD_NOT_FOUND', 'The board endpoint did not resolve.');
    if (!response.ok) return failed(input, 'NETWORK_ERROR', `The board endpoint returned HTTP ${response.status}.`);
    let payload: unknown;
    try { payload = await response.json(); } catch { return failed(input, 'MALFORMED_RESPONSE', 'The board endpoint did not return valid JSON.'); }
    const parsed = parseEmployerBoardPayload(input.provider, payload);
    if (!parsed) return failed(input, 'MALFORMED_RESPONSE', 'The board endpoint did not return the expected vacancy-list shape.');
    if (parsed.jobs.length > 0 && (!parsed.sampleJobUrl || !isSafePublicApplicationUrl(parsed.sampleJobUrl))) {
      return failed(input, 'INVALID_JOB_URL', 'A sample vacancy did not provide a safe public HTTPS application URL.');
    }
    if (input.provider === 'ASHBY' && parsed.sampleJobUrl && !validateHostedJobUrl(parsed.sampleJobUrl, ['jobs.ashbyhq.com'], input.providerIdentifier).valid) {
      return failed(input, 'INVALID_JOB_URL', 'A sample vacancy did not provide a valid Ashby-hosted job URL.');
    }
    const providerBoardIdentity = input.provider === 'LEVER' || input.provider === 'ASHBY' ? await readProviderBoardIdentity(dependencies.fetch ?? fetch, boardUrl, controller.signal) : undefined;
    return {
      provider: input.provider,
      providerIdentifier: input.providerIdentifier,
      status: 'VERIFIED',
      employerName: providerBoardIdentity ?? parsed.employerName,
      jobsFound: parsed.jobs.length,
      sampleJobUrl: parsed.sampleJobUrl,
      boardUrl,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return failed(input, 'TIMEOUT', 'The board endpoint did not respond within the verification timeout.');
    if (error instanceof Error && error.name === 'AbortError') return failed(input, 'TIMEOUT', 'The board endpoint did not respond within the verification timeout.');
    return failed(input, 'NETWORK_ERROR', 'The board endpoint could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Loads the expected company identity, checks it against returned organisation
 * metadata, then writes one complete state transition. No verification result is
 * derived from an identifier resembling a company name.
 */
export async function verifyAndPersistEmployerSource(input: VerifyEmployerSourceInput, client = prisma, dependencies: { fetch?: FetchLike; timeoutMs?: number } = {}) {
  const source = await client.employerJobSource.findUnique({
    where: { provider_providerIdentifier: { provider: input.provider, providerIdentifier: input.providerIdentifier } },
    include: { companyRecord: true },
  });
  if (!source || source.companyRecordId !== input.companyRecordId) throw new Error('Employer source is not associated with the requested company.');
  const attemptedAt = new Date();
  const preliminary = await verifyEmployerSourceRequest(input, dependencies);
  const result = preliminary.status === 'VERIFIED' && !employerIdentityMatches(source.companyRecord.displayName, preliminary.employerName)
    ? failed(input, 'EMPLOYER_IDENTITY_MISMATCH', 'The board organisation identity did not strongly match the expected employer.')
    : preliminary;
  const verifiedAt = new Date(result.verifiedAt);
  const data = result.status === 'VERIFIED'
    ? { verificationStatus: 'VERIFIED' as const, enabled: true, boardUrl: result.boardUrl ?? null, lastAttemptedAt: attemptedAt, lastVerifiedAt: verifiedAt, lastVerifiedJobCount: result.jobsFound ?? null, lastErrorCode: null, lastErrorAt: null }
    : { verificationStatus: 'FAILED' as const, enabled: false, lastAttemptedAt: attemptedAt, lastErrorCode: result.failureCode ?? 'NETWORK_ERROR', lastErrorAt: verifiedAt };
  return client.$transaction((transaction) => transaction.employerJobSource.update({ where: { id: source.id }, data }));
}