export interface IntakeStepDefinition {
  step: number;
  title: string;
  shortTitle: string;
  description: string;
}

export const INTAKE_STEPS: IntakeStepDefinition[] = [
  {
    step: 1,
    title: "Add Job",
    shortTitle: "Add Job",
    description: "Import from URL or paste the advert",
  },
  {
    step: 2,
    title: "Profile & Requirements",
    shortTitle: "Profile Check",
    description: "Check role requirements, eligibility and practical fit",
  },
  {
    step: 3,
    title: "Match & Tailor",
    shortTitle: "Match & Tailor",
    description: "Run Job Match and prepare CV recommendations",
  },
];

export interface FeatureComparison {
  feature: string;
  free: string;
  pro: string;
  highlight?: boolean;
}

export const PLAN_COMPARISON_FEATURES: FeatureComparison[] = [
  {
    feature: "Sponsorship & Wording Check",
    free: "Included",
    pro: "Included",
  },
  {
    feature: "Practical Profile Compatibility",
    free: "Included",
    pro: "Included",
  },
  {
    feature: "AI Job Match & Fit Report",
    free: "Restricted (Preview)",
    pro: "30 / month",
    highlight: true,
  },
  {
    feature: "Tailored CV Generation",
    free: "Not Included",
    pro: "Full Generation & Export",
    highlight: true,
  },
  {
    feature: "Requirement Ledger Access",
    free: "Partial Summary",
    pro: "Full Unrestricted Access",
  },
];
