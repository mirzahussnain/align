export const UNIFIED_CANDIDATE_EVIDENCE_VERSION = 1 as const;

export type CvGenerationSourceMode = 'JOB_MATCH' | 'CAREER_PROFILE';
export type CvAtsStrategy = 'STANDARD' | 'COMPOSITE';
export type PreservationTier = 0 | 1 | 2 | 3;

export type EvidenceSourceType =
  | 'SOURCE_CV'
  | 'CAREER_PROFILE'
  | 'PROFILE_EVIDENCE'
  | 'APPLICATION_EVIDENCE'
  | 'HITL'
  | 'VERIFIED_DERIVED_FACT';

export type EvidenceKind =
  | 'IDENTITY'
  | 'CONTACT'
  | 'LINK'
  | 'EMPLOYMENT'
  | 'PROJECT'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'TRAINING'
  | 'VOLUNTEER'
  | 'OPEN_SOURCE'
  | 'SKILL'
  | 'ACHIEVEMENT'
  | 'OTHER';

export interface EvidenceSourceRef {
  sourceType: EvidenceSourceType;
  entityType: string;
  entityId: string;
  fieldPath: string;
  snapshotId?: string;
}

export interface CandidateEvidenceItem {
  id: string;
  kind: EvidenceKind;
  field: string;
  canonicalText: string;
  canonicalData?: unknown;
  sourceEntityId?: string;
  provenance: EvidenceSourceType;
  preservationTier: PreservationTier;
  requirementIds: string[];
  sourceRefs: EvidenceSourceRef[];
  /** Facts sharing a key but carrying different values remain explicit conflicts. */
  conflictKey?: string;
}

export interface UnifiedIdentity {
  fullName?: string;
  headline?: string;
  evidenceIds?: string[];
}

export interface UnifiedContact {
  email?: string;
  phone?: string;
  location?: string;
  evidenceIds?: string[];
}

export type ProfessionalLinkType =
  | 'EMAIL'
  | 'PHONE'
  | 'LINKEDIN'
  | 'GITHUB'
  | 'PORTFOLIO'
  | 'PERSONAL_WEBSITE'
  | 'PROJECT_LIVE'
  | 'PROJECT_REPOSITORY'
  | 'OTHER';

export interface ProfessionalLink {
  id: string;
  label: string;
  url: string;
  type: ProfessionalLinkType;
  evidenceId: string;
  projectId?: string;
}

export interface UnifiedEvidenceEntity {
  id: string;
  sourceEntityId?: string;
  label: string;
  details: Record<string, unknown>;
  evidenceIds: string[];
}

export interface UnifiedSkill extends UnifiedEvidenceEntity {
  category: string;
  name: string;
}

export interface EvidenceConflict {
  key: string;
  evidenceIds: string[];
  reason: 'DIFFERENT_AUTHORITATIVE_VALUES';
}

export interface UnifiedCandidateEvidence {
  schemaVersion: typeof UNIFIED_CANDIDATE_EVIDENCE_VERSION;
  identity: UnifiedIdentity;
  contact: UnifiedContact;
  professionalLinks: ProfessionalLink[];
  employment: UnifiedEvidenceEntity[];
  projects: UnifiedEvidenceEntity[];
  education: UnifiedEvidenceEntity[];
  certifications: UnifiedEvidenceEntity[];
  training: UnifiedEvidenceEntity[];
  volunteerExperience: UnifiedEvidenceEntity[];
  openSource: UnifiedEvidenceEntity[];
  skills: UnifiedSkill[];
  achievements: UnifiedEvidenceEntity[];
  otherEvidence: UnifiedEvidenceEntity[];
  evidenceById: Record<string, CandidateEvidenceItem>;
  sourceRefs: EvidenceSourceRef[];
  conflicts: EvidenceConflict[];
}

export interface ExactJobMatchSourceLinkage {
  jobMatchId: string;
  storedCvId: string;
  cvExtractionId: string;
  cvRevisionId: string;
  matchProfileSnapshotId: string;
  generationProfileSnapshotId?: string;
  jobRevisionId: string;
  requirementLedgerVersion: number;
  analysisVersion: string;
}

export type RequirementImportance = 'MANDATORY' | 'DESIRABLE';
export type RequirementCategory =
  | 'QUALIFICATION' | 'EXPERIENCE' | 'SKILL' | 'TOOL' | 'METHODOLOGY' | 'DUTY'
  | 'KNOWLEDGE' | 'VALUE' | 'CREDENTIAL' | 'ELIGIBILITY' | 'AVAILABILITY' | 'OTHER';

export interface GenerationRequirement {
  id: string;
  text: string;
  importance: RequirementImportance;
  category: RequirementCategory;
  evidenceRequired: boolean;
  sourceSection: 'JOB_DESCRIPTION' | 'PERSON_SPECIFICATION';
  analysis?: {
    status: 'MET' | 'PARTIAL' | 'NOT_MET' | 'CONTRADICTED' | 'UNCLEAR';
    evidence: Array<{ source: 'CV' | 'PROFILE' | 'PRACTICAL_FACT' | 'USER_CONTEXT'; sourceRef?: string; text: string; location?: string; approved?: boolean }>;
    confidence: number;
    deduction: { points: number; reason: string; rubric: 'MET' | 'MANDATORY_CORE_MISSING' | 'MANDATORY_SUPPORTING_MISSING' | 'PARTIAL_MATCH' | 'DESIRABLE_MISSING' | 'ELIGIBILITY' | 'OTHER' };
  };
}

export interface RequirementLedgerSnapshot {
  schemaVersion: 1;
  analysisVersion: string;
  requirements: GenerationRequirement[];
}

export type RequirementReconciliationStatus =
  | 'SUPPORTED' | 'PARTIAL' | 'MISSING' | 'CONFLICTED' | 'NOT_APPLICABLE' | 'CONFIRMED_MISSING';

export interface RequirementReconciliationItem {
  requirementId: string;
  status: RequirementReconciliationStatus;
  evidenceIds: string[];
  confidence: number;
  reason: string;
}

export interface RequirementReconciliationSnapshot {
  schemaVersion: 1;
  items: RequirementReconciliationItem[];
}

export interface SemanticGapGroup {
  id: string;
  label: string;
  requirementIds: string[];
  importance: RequirementImportance;
}

export type HitlEvidenceEntityKind = 'EXPERIENCE' | 'PROJECT' | 'EDUCATION' | 'CERTIFICATION' | 'TRAINING' | 'VOLUNTEERING' | 'OPEN_SOURCE' | 'OTHER';
export type EvidencePersistenceScope = 'CAREER_PROFILE_AND_APPLICATION' | 'APPLICATION_ONLY';
export type EvidenceFieldKind = 'RESPONSIBILITY' | 'ACHIEVEMENT' | 'EVIDENCE_LINE' | 'COURSEWORK' | 'CREDENTIAL_EVIDENCE' | 'CONTRIBUTION' | 'DESCRIPTION';

export interface CapturedEvidenceItemInput {
  fieldKind: EvidenceFieldKind;
  text: string;
  requirementIds: string[];
}

export interface EvidenceCaptureInput {
  entityKind: HitlEvidenceEntityKind;
  entity: { mode: 'EXISTING'; entityId: string; label: string } | { mode: 'NEW'; data: Record<string, unknown> };
  evidenceItems: CapturedEvidenceItemInput[];
  persistenceScope: EvidencePersistenceScope;
}

export type CvPlanSection = 'PROFILE' | 'EXECUTIVE_SUMMARY' | 'CORE_EXPERTISE' | 'EXPERIENCE' | 'SELECTED_IMPACT' | 'SKILLS' | 'PROJECTS' | 'EDUCATION' | 'CERTIFICATIONS' | 'TRAINING' | 'VOLUNTEERING' | 'OPEN_SOURCE' | 'OTHER';
export type CvDensity = 'COMPACT' | 'BALANCED' | 'SPACIOUS';
export type CvTargetLength = 'ONE_PAGE' | 'ONE_TO_TWO_PAGES' | 'TWO_PAGES';
export type CvTargetStrategy = 'PROFILE_ONLY' | 'JUNIOR_PROJECT_HEAVY' | 'EXPERIENCE_FORWARD' | 'SENIOR_LEAD' | 'CAREER_CHANGER' | 'ACADEMIC_RESEARCH' | 'CREDENTIAL_HEAVY';
export type CvOmissionReasonCode = 'DUPLICATE' | 'LOWER_VALUE' | 'DENSITY' | 'USER_EXCLUDED';

export interface CvPlanOmission {
  evidenceId: string;
  reasonCode: CvOmissionReasonCode;
  rationale: string;
}

export interface ProposedCvPlan {
  schemaVersion: 1;
  sourceMode: CvGenerationSourceMode;
  atsStrategy: CvAtsStrategy;
  targetStrategy: CvTargetStrategy;
  sectionOrder: CvPlanSection[];
  density: CvDensity;
  targetLength: CvTargetLength;
  includedEvidenceIds: string[];
  optionalEvidenceIds: string[];
  omittedEvidence: CvPlanOmission[];
  professionalLinkIds: string[];
  projectLinkIds: string[];
  coveredRequirementIds: string[];
  unresolvedRequirementIds: string[];
}

export interface ApprovedCvPlan extends ProposedCvPlan {
  approvedAt: string;
}
