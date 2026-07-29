/**
 * Candidate practical compatibility.
 *
 * This is the THIRD of the four separate concepts (see `sponsor-evidence.ts`)
 * and answers exactly one question: how do CONFIRMED structured profile facts
 * compare with the practical requirements this vacancy states?
 *
 * WHAT IT IS NOT, and must never become:
 *   - It is not legal or immigration advice. It reports what the profile records
 *     and what the advert says. It never concludes that someone is eligible,
 *     will qualify, must be sponsored, or cannot apply.
 *   - It is not a score. There is deliberately no percentage, no weighting and
 *     no overall pass/fail, because the inputs are a handful of independent
 *     facts of wildly different importance and averaging them invents precision.
 *   - It is not part of the CV-fit percentage. An unrecorded driving licence
 *     must never reduce a formal match score; it surfaces here as an explicit,
 *     unscored flag.
 *   - It never reads CV prose. Only structured, user-recorded fields count. A
 *     sentence in an employment history is not a confirmed fact.
 */

/**
 * The state of ONE comparison.
 *
 * UNKNOWN must never be promoted to CONFLICT. "The vacancy needs a DBS check and
 * we do not know your DBS status" and "the vacancy needs a DBS check and you
 * have told us you have none" are different statements, and only the second is
 * a problem.
 */
export type CandidateFactState =
  | 'CONFIRMED'
  | 'CONFLICT'
  | 'UNKNOWN'
  | 'NOT_APPLICABLE';

export type PracticalCompatibilityCategory =
  | 'RIGHT_TO_WORK'
  | 'SPONSORSHIP'
  | 'VISA_DURATION'
  | 'LOCATION'
  | 'RELOCATION'
  | 'COMMUTE'
  | 'REMOTE_ONSITE'
  | 'DRIVING_LICENCE'
  | 'VEHICLE'
  | 'DBS'
  | 'SECURITY_CLEARANCE'
  | 'UK_RESIDENCY'
  | 'PROFESSIONAL_REGISTRATION'
  | 'SHIFT_AVAILABILITY'
  | 'TRAVEL';

export type PracticalCompatibilityItem = {
  category: PracticalCompatibilityCategory;
  state: CandidateFactState;
  /** What the vacancy states, quoted or summarised from deterministic extraction. */
  vacancyRequirement?: string;
  /** What the profile records. Only ever a value the user entered themselves. */
  confirmedProfileFact?: string;
  /** Plain-language, factual. Never a conclusion about entitlement. */
  explanation: string;
  source: 'PROFILE' | 'VACANCY' | 'BOTH';
};

/** Deterministic location outcome. Separate from the item state so "possibly" survives. */
export type LocationCompatibility =
  | 'COMPATIBLE'
  | 'POSSIBLY_COMPATIBLE'
  | 'CONFLICT'
  | 'UNKNOWN';

export type PracticalCompatibilitySummary = {
  confirmed: number;
  conflicts: number;
  unknown: number;
  notApplicable: number;
};

export type PracticalCompatibilityViewModel = {
  items: PracticalCompatibilityItem[];
  summary: PracticalCompatibilitySummary;
  /**
   * Categories where recording a structured profile value would change an
   * UNKNOWN into a real answer. Drives the "Update profile" affordance; the app
   * never populates these itself.
   */
  updatableCategories: PracticalCompatibilityCategory[];
  disclaimer: string;
};

export const PRACTICAL_COMPATIBILITY_DISCLAIMER =
  'This comparison uses the information recorded in your profile and the wording detected in the vacancy. It is not legal or immigration advice.';

/**
 * The confirmed facts the comparison is allowed to read.
 *
 * Every field is optional and `undefined` means UNKNOWN — never "no". Booleans
 * are therefore genuinely tri-state, which is the only way UNKNOWN can stay
 * distinct from CONFLICT.
 */
export type ConfirmedCandidateFacts = {
  // Immigration and work permission, derived only from the structured VisaStatus
  // enum and explicit user answers. Never from prose.
  visaStatus?: string;
  visaStatusLabel?: string;
  visaExpiry?: string;
  hasUnrestrictedWorkPermission?: boolean;
  hasCurrentRightToWork?: boolean;
  requiresSponsorshipNow?: boolean;
  mayRequireSponsorshipLater?: boolean;

  // Location and work pattern
  homeCity?: string;
  homeRegion?: string;
  homeCountry?: string;
  openToRelocation?: boolean;
  relocationLocations?: string[];
  maxCommuteMinutes?: number;
  workPatternPreference?: 'REMOTE_ONLY' | 'HYBRID' | 'ONSITE' | 'FLEXIBLE';
  maxOnsiteDaysPerWeek?: number;

  // Mobility
  drivingLicenceHeld?: boolean;
  ownVehicleAvailable?: boolean;
  willingToTravel?: boolean;

  // Checks and regulation
  dbsCheckLevel?: 'NONE' | 'BASIC' | 'STANDARD' | 'ENHANCED';
  dbsUpdateService?: boolean;
  securityClearance?: 'NONE' | 'BPSS' | 'CTC' | 'SC' | 'DV';
  ukResidencyStartDate?: string;
  professionalRegistrations: Array<{ body: string; status: 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'UNKNOWN' }>;

  // Availability
  availableForNightShifts?: boolean;
  availableForWeekendShifts?: boolean;
  availableForRotatingShifts?: boolean;
  earliestStartDate?: string;
};
