import type { Industry } from '@/shared/constants/sector-keywords';

export interface AISemanticOutput {
  /**
   * Which keyword dictionary this CV should actually be scored against. The
   * local parser can only guess (it defaults to tech), so the AI's read of the
   * candidate's field is what selects the dictionary for the real keyword pass.
   */
  detectedIndustry: Industry;
  summaryScore: number;
  summaryFeedback: string;
  impactScore: number;
  impactFeedback: string;
  additionalKeywords: { keyword: string; category: string; count: number }[];
  rewrites: RewriteSuggestion[];
  ukTechAlignment: string;
  detectedRole: string;
  hasTesting: boolean;
  isTechRole: boolean;
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
