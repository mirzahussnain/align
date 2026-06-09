export interface AISemanticOutput {
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
