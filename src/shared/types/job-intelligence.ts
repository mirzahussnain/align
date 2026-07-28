import type { JobDescriptionAvailability } from './job';

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
  | 'TRAVEL';

export type VacancyRequirementEvidence = {
  category: VacancyRequirementCategory;
  requirement: 'REQUIRED' | 'PREFERRED' | 'MENTIONED' | 'NOT_DETECTED';
  value?: string;
  evidenceText: string;
  confidence: IntelligenceConfidence;
};

export type CandidatePracticalProfile = {
  requiresSponsorshipNow?: boolean;
  mayRequireSponsorshipLater?: boolean;
  hasConfirmedRightToWork?: boolean;
  ukResidencyStartDate?: string;
  securityClearance?: { status: 'HELD' | 'NOT_HELD' | 'UNKNOWN'; level?: string };
  dbs?: { status: 'HELD' | 'NOT_HELD' | 'UNKNOWN'; type?: 'BASIC' | 'STANDARD' | 'ENHANCED'; updateService?: boolean };
  professionalRegistrations: Array<{ body: string; status: 'ACTIVE' | 'PENDING' | 'EXPIRED' }>;
  drivingLicenceHeld?: boolean;
  ownVehicleAvailable?: boolean;
  willingToWorkOnsite?: boolean;
  willingToTravel?: boolean;
};

export type PracticalVacancyAssessment = {
  overall: 'NO_OBVIOUS_BLOCKER' | 'POTENTIAL_ISSUE' | 'MANUAL_CONFIRMATION_NEEDED' | 'INSUFFICIENT_INFORMATION';
  findings: Array<{
    category: VacancyRequirementCategory;
    status: 'ALIGNED' | 'POTENTIAL_ISSUE' | 'MISSING_INFORMATION' | 'NOT_APPLICABLE';
    title: string;
    explanation: string;
    vacancyEvidence?: string;
    candidateEvidence?: string;
  }>;
  disclaimer: string;
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
  practicalAssessment?: PracticalVacancyAssessment;
  relevance?: DiscoveryRelevance;
  assessedAt: string;
};
