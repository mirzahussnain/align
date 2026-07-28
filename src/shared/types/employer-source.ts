/**
 * Employer-direct vacancy source contracts.
 *
 * An `EmployerJobSource` is one employer's public applicant-tracking board,
 * addressed by a provider-specific identifier (a Greenhouse board token, a Lever
 * site name, a SmartRecruiters company id, an Ashby job-board name). It is the
 * ONLY way an employer-ATS provider may be queried.
 *
 * Two rules are load-bearing and are encoded in these types:
 *
 *  1. A source is queried only once it is VERIFIED. `enabled` alone is not
 *     enough — an unverified identifier is a guess, and guessing board tokens
 *     from company names is prohibited.
 *  2. Sponsor-register evidence is stored ALONGSIDE the ATS source and never
 *     merged into it. Appearing on the register is employer-level evidence about
 *     a licence; it is never evidence that a vacancy offers sponsorship, and an
 *     employer is never selected for the directory because it appears there.
 *
 * These are domain types only. The Prisma model and seed land in the phase that
 * uses them.
 */

import type { EmployerAtsProvider, SponsorRegisterMatchStatus } from '@/shared/types/job';

/** Lever serves two regional API hosts; the wrong one 404s a valid site. */
export type LeverRegion = 'GLOBAL' | 'EU';

/**
 * How this source entered the directory. Provenance decides how much trust the
 * entry starts with, and is never inferred after the fact.
 */
export type EmployerSourceOrigin =
  /** Part of the curated, reviewed seed shipped with the product. */
  | 'CURATED_SEED'
  /** Entered deliberately by an operator. */
  | 'MANUAL_ADMIN'
  /** Discovered from an employer's own careers URL and confirmed against it. */
  | 'VERIFIED_COMPANY_URL'
  /** Suggested by a user; untrusted until verification passes. */
  | 'USER_SUGGESTED_UNVERIFIED';

export type EmployerSourceVerificationStatus = 'VERIFIED' | 'FAILED' | 'PENDING';

/**
 * Register evidence carried on a source. `NOT_CHECKED` is a distinct state from
 * `NONE`: "we have not looked" must never be presented as "not on the register".
 */
export type EmployerSponsorMatchStatus = SponsorRegisterMatchStatus | 'NOT_CHECKED';

/**
 * The minimum needed to address a board. Adapters take this rather than the full
 * record, so a URL can be built and validated without loading directory state.
 */
export interface EmployerJobSourceRef {
  provider: EmployerAtsProvider;
  /** The board token / site name / company id. Provider-specific, validated. */
  providerIdentifier: string;
  /** Required for LEVER, ignored by every other provider. */
  leverRegion?: LeverRegion;
}

/** One curated employer board in the directory. */
export interface EmployerJobSource extends EmployerJobSourceRef {
  id: string;
  /** Employer name as shown to users. */
  displayName: string;
  /** Comparison key, produced by the shared company-name normaliser. */
  normalisedName: string;
  /** The employer's own careers page, when known and safe to link. */
  careersUrl?: string;
  /** The directory is UK-scoped; the field is explicit rather than assumed. */
  country: 'GB';
  /**
   * Whether the source participates in ingestion. Enabling requires
   * `verificationStatus === 'VERIFIED'`; see `canQueryEmployerSource`.
   */
  enabled: boolean;
  sourceOrigin: EmployerSourceOrigin;
  verificationStatus: EmployerSourceVerificationStatus;
  /** Register evidence, deliberately separate from the ATS identity above. */
  sponsorMatchStatus: EmployerSponsorMatchStatus;
  matchedSponsorOrganisationName?: string;
  /** Which register version produced the match, so stale evidence is visible. */
  sponsorRegisterVersion?: string;
  sponsorRegisterCheckedAt?: Date;
  lastVerifiedAt?: Date;
  lastSuccessfulSyncAt?: Date;
  lastAttemptedAt?: Date;
  lastErrorCode?: EmployerSourceFailureCode;
}

/**
 * The shape of a curated seed entry: identity and provenance only. Every
 * verification, sync and sponsor field is derived at runtime and must not be
 * asserted by the seed file — a seed cannot declare itself verified.
 */
export interface EmployerJobSourceSeed extends EmployerJobSourceRef {
  displayName: string;
  careersUrl?: string;
  country: 'GB';
  sourceOrigin: Extract<EmployerSourceOrigin, 'CURATED_SEED' | 'MANUAL_ADMIN'>;
  /** Free-text note on why this employer is relevant to Align users. */
  relevanceNote?: string;
}

export type EmployerSourceFailureCode =
  /** The identifier is malformed or unsafe for URL construction. */
  | 'INVALID_IDENTIFIER'
  /** The board endpoint returned 404 — the identifier does not resolve. */
  | 'BOARD_NOT_FOUND'
  /** The endpoint demanded credentials; public access is a requirement. */
  | 'REQUIRES_AUTHENTICATION'
  /** A response arrived but did not match the provider's documented shape. */
  | 'INVALID_RESPONSE'
  /** The board resolved but names a different organisation than expected. */
  | 'IDENTITY_MISMATCH'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR';

/**
 * Result of checking one source. An empty board is NOT a failure — a real
 * employer with no current vacancies is a valid, verified source — so
 * `jobsFound: 0` with `status: 'VERIFIED'` is a legitimate outcome.
 */
export interface EmployerSourceVerificationResult {
  provider: EmployerAtsProvider;
  providerIdentifier: string;
  status: EmployerSourceVerificationStatus;
  checkedAt: Date;
  /** The public board URL that was checked. */
  boardUrl?: string;
  /** Vacancies visible at check time. */
  jobsFound?: number;
  /** Organisation name the board itself reports, when it reports one. */
  reportedOrganisationName?: string;
  /** Whether the reported name is consistent with the expected employer. */
  identityMatch?: 'MATCH' | 'MISMATCH' | 'UNKNOWN';
  /** True when a sampled vacancy produced a well-formed application URL. */
  sampleJobUrlValid?: boolean;
  failureCode?: EmployerSourceFailureCode;
  /** Operator-facing detail. Never a credential and never a response body. */
  failureDetail?: string;
}

/**
 * The single gate on querying an employer board. Both conditions are required:
 * an operator may disable a verified source, and enabling an unverified one must
 * never make it queryable.
 */
export function canQueryEmployerSource(
  source: Pick<EmployerJobSource, 'enabled' | 'verificationStatus'>
): boolean {
  return source.enabled && source.verificationStatus === 'VERIFIED';
}
