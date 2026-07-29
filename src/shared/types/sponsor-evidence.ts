/**
 * The four product concepts this file keeps apart.
 *
 *   1. Employer sponsor-register evidence — does a confidently matched
 *      ORGANISATION appear on the current UK sponsor register?
 *   2. Vacancy sponsorship wording — what does THIS advert say?
 *   3. Candidate practical compatibility — see `practical-compatibility.ts`.
 *   4. Formal CV match — the canonical analysis score, elsewhere entirely.
 *
 * Nothing here may be combined into a single badge, score or conclusion. In
 * particular a register match is evidence about a NAME, never a statement that
 * a vacancy offers sponsorship or that a candidate qualifies for it.
 */

/**
 * Public, user-facing sponsor-evidence outcome.
 *
 * NOT_CHECKED is never a synonym for NONE. NONE is a completed check against a
 * known register version that found nothing; NOT_CHECKED means no valid check
 * has happened yet, including the case where the register was unreachable.
 */
export type SponsorEvidenceStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NONE'
  | 'NOT_CHECKED';

/**
 * Why a NOT_CHECKED is NOT_CHECKED, so the UI can say "check unavailable"
 * instead of implying nobody has got round to it. Present only alongside
 * NOT_CHECKED; a completed check leaves it undefined.
 */
export type SponsorCheckState =
  | 'NEVER_CHECKED'
  | 'CHECK_UNAVAILABLE'
  | 'EMPLOYER_UNIDENTIFIABLE'
  | 'COMPANY_UNRESOLVED';

export type SponsorConfidenceBand = 'EXACT' | 'STRONG' | 'AMBIGUOUS';

/**
 * Persisted provenance. Enough to reproduce and audit a decision without
 * exposing the matcher's internal scoring — users are shown a band and reasons,
 * never a fuzzy score.
 */
export type CompanySponsorEvidenceProvenance = {
  normalisedEmployerName?: string;
  matchMethod?: string;
  confidenceBand?: SponsorConfidenceBand;
  candidateCount?: number;
  candidateOrganisationNames?: string[];
  reasons?: string[];
  /** Set when the check could not be completed, so NONE is never manufactured. */
  checkState?: SponsorCheckState;
};

/** The API/UI shape. `disclaimer` is mandatory: it can never be omitted. */
export type SponsorEvidenceViewModel = {
  status: SponsorEvidenceStatus;
  matchedOrganisationName?: string;
  registerVersion?: string;
  checkedAt?: string;
  /** Only meaningful when `status` is NOT_CHECKED. */
  checkState?: SponsorCheckState;
  /** True when the persisted evidence predates the current register version. */
  stale?: boolean;
  confidenceBand?: SponsorConfidenceBand;
  reasons?: string[];
  disclaimer: string;
};

/** Employer identity resolution outcome. Not a sponsor-register outcome. */
export type CompanyResolutionOutcome =
  | 'MATCHED_COMPANY'
  | 'AMBIGUOUS_COMPANY'
  | 'NO_COMPANY_MATCH';

export type CompanyResolutionResult = {
  outcome: CompanyResolutionOutcome;
  companyRecordId?: string;
  matchedDisplayName?: string;
  /** e.g. "EXACT_NORMALISED_NAME", "WEBSITE_DOMAIN", "SPONSOR_LEGAL_NAME_ALIAS". */
  method?: string;
  candidateCount: number;
  reasons: string[];
};

export const SPONSOR_REGISTER_DISCLAIMER =
  'Sponsor-register evidence indicates that an organisation name may appear on the UK register. It does not confirm sponsorship for a particular vacancy or candidate.';
