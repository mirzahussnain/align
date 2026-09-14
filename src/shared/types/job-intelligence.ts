import type { JobDescriptionAvailability } from './job';
import type { PracticalCompatibilityViewModel } from './practical-compatibility';

export type JobDescriptionSource = 'PROVIDER_FULL' | 'PROVIDER_PARTIAL' | 'USER_PASTED';
export type IntelligenceConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type DescriptionAssessment = {
  availability: JobDescriptionAvailability;
  confidence: IntelligenceConfidence;
  reasons: string[];
  source: JobDescriptionSource | null;
};

export type EmployerSponsorEvidence = {
  status: 'EXACT' | 'LIKELY' | 'AMBIGUOUS' | 'NONE' | 'NOT_CHECKED';
  queriedEmployerName: string;
  matchedOrganisationName?: string;
  candidateOrganisationNames?: string[];
  registerVersion?: string;
  checkedAt?: string;
  reasons: string[];
};

export type VacancySponsorshipSignal =
  | 'AVAILABLE'
  | 'MAY_BE_CONSIDERED'
  | 'NOT_AVAILABLE'
  | 'RIGHT_TO_WORK_REQUIRED'
  | 'NOT_MENTIONED';

export type VacancySponsorshipAssessment = {
  signal: VacancySponsorshipSignal;
  evidence: Array<{ text: string; start?: number; end?: number }>;
  confidence: IntelligenceConfidence;
  reasons: string[];
};

export type VacancyRequirementCategory =
  | 'RIGHT_TO_WORK'
  | 'SPONSORSHIP'
  | 'UK_RESIDENCY'
  | 'SECURITY_CLEARANCE'
  | 'DBS'
  | 'PROFESSIONAL_REGISTRATION'
  | 'DRIVING_LICENCE'
  | 'OWN_VEHICLE'
  | 'ONSITE'
  | 'TRAVEL'
  // Stated shift pattern. Extracted deterministically like every other category
  // so the practical comparison has a vacancy-side fact to compare a recorded
  // shift availability against, rather than re-parsing the advert in React.
  | 'SHIFT_PATTERN';

export type VacancyRequirementEvidence = {
  category: VacancyRequirementCategory;
  requirement: 'REQUIRED' | 'PREFERRED' | 'MENTIONED' | 'NOT_DETECTED';
  value?: string;
  evidenceText: string;
  confidence: IntelligenceConfidence;
};

export type DiscoveryRelevance = { level: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] };

export type CareerTrackDiscoveryInput = {
  targetRoleTitle?: string;
  titleAliases?: string[];
  occupationFamily?: string;
  industry?: string;
  preferredLocation?: string;
  workStyle?: 'ONSITE' | 'HYBRID' | 'REMOTE';
  seniority?: string;
  contractPreference?: string;
  salaryMinimum?: number;
};

export type JobIntelligenceViewModel = {
  description: DescriptionAssessment;
  sponsorship: {
    employer: EmployerSponsorEvidence;
    vacancy: VacancySponsorshipAssessment;
    disclaimer: string;
  };
  requirements: VacancyRequirementEvidence[];
  /**
   * Candidate practical compatibility. Deliberately a SEPARATE model from
   * `sponsorship` above: employer register evidence, vacancy wording and
   * candidate facts are three different claims and are never merged into one
   * badge, score or conclusion.
   */
  practicalCompatibility?: PracticalCompatibilityViewModel;
  relevance?: DiscoveryRelevance;
  assessedAt: string;
};
