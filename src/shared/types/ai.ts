import type { SelectionCriterion } from './criteria';

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

export interface AIJobMatchOutput {
  /**
   * Role title and hiring company as named in the JD. Optional because they are
   * absent from analyses run before extraction existed, and because plenty of
   * real listings (agency posts especially) never name the employer.
   */
  jobTitle?: string;
  jobCompany?: string;
  /**
   * Person-specification criteria when the JD contains an explicit
   * essential/desirable list (NHS/council-style adverts). Empty otherwise.
   * Optional because pre-rebuild stored results lack it.
   */
  selectionCriteria?: SelectionCriterion[];
  mandatorySkills: {
    present: string[];
    missing: string[];
    partial: string[];
  };
  desirableSkills: {
    present: string[];
    missing: string[];
  };
  domainFit: {
    roleDomain: string;
    candidateDomain: string;
    mismatch: boolean;
    overlapAreas: string[];
    detail: string;
  };
  eligibilityFlags: { flag: string; detail: string; datesInvolved: string }[];
  scoringBreakdown: { item: string; classification: string; deduction: number; reason: string }[];
  matchScore: number;
  matchFeedback: string;
  experienceGap: string;
  tailoredRewrites: TailoredRewrite[];
  cv_build_spec: {
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
  };
}
