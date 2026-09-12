export interface IntakeStepDefinition {
  step: number;
  title: string;
  shortTitle: string;
  description: string;
}

export const INTAKE_STEPS: IntakeStepDefinition[] = [
  {
    step: 1,
    title: "Import & Vacancy Intake",
    shortTitle: "Intake",
    description: "Import from URL or paste advert details",
  },
  {
    step: 2,
    title: "Sponsorship & Requirements Check",
    shortTitle: "Practical Check",
    description: "Employer evidence and profile compatibility",
  },
  {
    step: 3,
    title: "AI Analysis & CV Tailoring",
    shortTitle: "AI Match & Tailor",
    description: "In-depth AI matching report & CV tailoring",
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
