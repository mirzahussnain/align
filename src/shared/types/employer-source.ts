/** Durable employer-directory contracts. ATS identity and sponsor-register evidence
 * are intentionally represented as separate assertions. */
import type { EmployerAtsProvider, SponsorRegisterMatchStatus } from './job.ts';

export type LeverRegion = 'GLOBAL' | 'EU';
export type EmployerSourceOrigin = 'CURATED_SEED' | 'MANUAL_ADMIN' | 'VERIFIED_COMPANY_URL' | 'USER_SUGGESTED_UNVERIFIED';
export type EmployerSourceVerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'DISABLED';
export type EmployerSponsorMatchStatus = SponsorRegisterMatchStatus | 'NOT_CHECKED';

export interface EmployerJobSourceRef {
  provider: EmployerAtsProvider;
  providerIdentifier: string;
  leverRegion?: LeverRegion;
}

export type EmployerSourceFailureCode =
  | 'INVALID_IDENTIFIER'
  | 'BOARD_NOT_FOUND'
  | 'AUTHENTICATION_REQUIRED'
  | 'MALFORMED_RESPONSE'
  | 'EMPLOYER_IDENTITY_MISMATCH'
  | 'INVALID_JOB_URL'
  | 'TIMEOUT'
  | 'NETWORK_ERROR';

export interface EmployerSourceVerificationResult {
  provider: EmployerAtsProvider;
  providerIdentifier: string;
  status: Extract<EmployerSourceVerificationStatus, 'VERIFIED' | 'FAILED'>;
  verifiedAt: string;
  employerName?: string;
  jobsFound?: number;
  sampleJobUrl?: string;
  boardUrl?: string;
  failureCode?: EmployerSourceFailureCode;
  failureReason?: string;
}

/** The one authoritative source-ingestion gate. UI filters are advisory only. */
export function canQueryEmployerSource(
  source: Pick<{ enabled: boolean; verificationStatus: EmployerSourceVerificationStatus }, 'enabled' | 'verificationStatus'>
): boolean {
  return source.enabled && source.verificationStatus === 'VERIFIED';
}

/** Reproducible candidate declarations; derived outcomes never belong here. */
export interface EmployerDirectorySeed {
  displayName: string;
  normalisedName: string;
  country: 'GB';
  industry?: string;
  websiteUrl?: string;
  careersUrl?: string;
  sources: Array<EmployerJobSourceRef & {
    sourceOrigin: Extract<EmployerSourceOrigin, 'CURATED_SEED'>;
  }>;
}