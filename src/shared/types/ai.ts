/**
 * Semantic evaluation output (scoring v2). Classification happens BEFORE this
 * call, so the schema carries no industry/tech-detection fields — the
 * evaluator judges against an injected occupation profile and nothing else.
 */
export interface AISemanticOutput {
  summaryScore: number;
  summaryFeedback: string;
  impactScore: number;
  impactFeedback: string;
  additionalKeywords: { keyword: string; category: string; count: number }[];
  rewrites: RewriteSuggestion[];
  /** Occupation-framed alignment note (replaces ukTechAlignment). */
  alignmentNote: string;
  detectedRole: string;
  /** Observations against the profile's credential checklist. */
  credentialObservations: string[];
  riskFlags: string[];
  clichés: string[];
}

export interface RewriteSuggestion {
  original: string;
  suggested: string;
  rationale: string;
}

export interface TailoredRewrite {
  original: string;
  suggested: string;
  rationale: string;
  caveat?: string;
}

/**
 * AI-authored advisory guidance on how to build a tailored CV, produced by the
 * job-match analysis and persisted (grounded) as the `cv_build_spec` field of
 * {@link JobMatchDataV2}. It is a NON-authoritative hint to the rewriter about
 * structure, emphasis and phrasing — never a source of fact. Distinct from the
 * deterministic renderer contract `CvBuildSpec` in
 * `services/cv-build-spec/types.ts`, which every renderer consumes.
 */
export interface AiCvBuildGuidance {
  recommended_template: string;
  template_rationale: string;
  section_order: string[];
  lead_project: string;
  summary_angle: string;
  skills_to_surface: string[];
  skills_to_deprioritise: string[];
  bullets_to_rewrite: {
    project_or_role: string;
    original_label: string;
    new_label: string;
    new_body: string;
  }[];
  visa_note_required: boolean;
  cover_letter_angle: string;
}

export type RequirementImportance = 'mandatory' | 'desirable';

export type RequirementStatus =
  | 'met'
  | 'partial'
  | 'not_met'
  | 'contradicted'
  | 'unclear';

export type RequirementCategory =
  | 'qualification'
  | 'experience'
  | 'skill'
  | 'tool'
  | 'methodology'
  | 'duty'
  | 'knowledge'
  | 'value'
  | 'credential'
  | 'eligibility'
  | 'availability'
  | 'other';

export type EvidenceSource = 'cv' | 'profile' | 'user_context';

export interface RequirementEvidence {
  source: EvidenceSource;
  sourceRef?: string;
  text: string;
  location?: string;
  approved?: boolean;
}

export type RequirementDeductionRubric =
  | 'met'
  | 'mandatory_core_missing'
  | 'mandatory_supporting_missing'
  | 'partial_match'
  | 'desirable_missing'
  | 'eligibility'
  | 'other';

export interface RequirementDeduction {
  /** Positive points subtracted from the 100-point starting score. */
  points: number;
  reason: string;
  rubric: RequirementDeductionRubric;
}

export interface JobRequirementLedgerEntry {
  /** Assigned by the server after model-output validation. */
  id: string;
  text: string;
  importance: RequirementImportance;
  category: RequirementCategory;
  sourceSection: 'job_description' | 'person_specification';
  evidenceRequired: boolean;
  status: RequirementStatus;
  evidence: RequirementEvidence[];
  confidence: number;
  deduction: RequirementDeduction;
}

/** Model-facing draft: requirement ids and the final score are server-owned. */
export type JobRequirementLedgerDraft = Omit<JobRequirementLedgerEntry, 'id'>;

export interface DomainFitV2 {
  roleDomain: string;
  candidateDomain: string;
  status: 'aligned' | 'partial' | 'mismatch';
  overlapAreas: string[];
  detail: string;
  confidence: number;
  deduction: {
    points: number;
    reason: string;
  };
}

export interface JobMatchDataV2 {
  schemaVersion: 2;
  jobTitle?: string;
  jobCompany?: string;
  requirements: JobRequirementLedgerEntry[];
  domainFit: DomainFitV2;
  /** Server-computed from requirement deductions plus the domain deduction. */
  matchScore: number;
  matchFeedback: string;
  experienceGap: string;
  tailoredRewrites: TailoredRewrite[];
  cv_build_spec: AiCvBuildGuidance;
}

export type JobMatchDataV2Draft = Omit<JobMatchDataV2, 'requirements' | 'matchScore'> & {
  requirements: JobRequirementLedgerDraft[];
};
