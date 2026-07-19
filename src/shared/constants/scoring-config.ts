// ATS Scoring weights and configuration

export const SCORING_WEIGHTS = {
  formatting: 0.15,
  compliance: 0.10,
  pageCount: 0.10,
  sectionOrder: 0.15,
  keywordDensity: 0.20,
  impactStatements: 0.10,
  atsReadability: 0.10,
  professionalSummary: 0.10,
} as const;

export const SCORE_THRESHOLDS = {
  excellent: 85,
  good: 70,
  needsImprovement: 50,
  critical: 0,
} as const;

export const OPTIMAL_SECTION_ORDER = [
  'contact',
  'professional-summary',
  'core-skills',
  'professional-experience',
  'key-projects',
  'education',
  'certifications',
] as const;

export const SECTION_LABELS: Record<string, string> = {
  'contact': 'Contact Information',
  'professional-summary': 'Professional Summary',
  'core-skills': 'Core Skills / Technical Skills',
  'professional-experience': 'Professional Experience',
  'key-projects': 'Key Projects',
  'education': 'Education',
  'certifications': 'Certifications',
};

export const SECTION_HEADINGS_MAP: Record<string, string[]> = {
  'contact': [],
  'professional-summary': [
    'professional summary', 'summary', 'profile', 'personal statement',
    'personal profile', 'career summary', 'about me', 'objective',
  ],
  'core-skills': [
    'core skills', 'skills', 'technical skills', 'key skills',
    'competencies', 'technologies', 'tech stack',
  ],
  'professional-experience': [
    'professional experience', 'experience', 'work experience',
    'employment history', 'career history', 'work history',
  ],
  'key-projects': [
    'key projects', 'projects', 'personal projects', 'portfolio',
    'selected projects', 'notable projects',
  ],
  'education': [
    'education', 'qualifications', 'academic qualifications',
    'academic background', 'educational background',
  ],
  'certifications': [
    'certifications', 'certificates', 'professional certifications',
    'courses', 'training', 'professional development',
  ],
};

// UK Equality Act 2010 compliance checks.
//
// These patterns run against raw CV prose, so they are written for PRECISION,
// not recall. A false positive silently costs the candidate a weighted 10% of
// their score and shows them an issue that isn't there; a false negative only
// misses a disclosure that is rare to begin with. Where a bare term collides
// with ordinary CV vocabulary, the pattern requires the labelled-field form
// ("Marital status: Single") that an actual disclosure takes.
export const UK_COMPLIANCE_RULES = [
  {
    id: 'no-photo',
    rule: 'No photograph',
    description: 'UK CVs should not include a photo to avoid unconscious bias',
    pattern: null, // Checked via PDF image analysis
  },
  {
    id: 'no-dob',
    rule: 'No date of birth',
    description: 'Age should not be disclosed on UK CVs',
    patterns: [
      /\bdate of birth\b/i,
      /\bD\.?O\.?B\.?\s*[:\-]/i,
      /\bborn\s+(?:on|in)\s+\d/i,
      // A bare dd/mm/yyyy is indistinguishable from an employment date written
      // in UK format, so a full date only counts when a birth cue precedes it.
      /(?:date of birth|d\.?o\.?b\.?|born)\D{0,20}\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/i,
    ],
  },
  {
    id: 'no-marital',
    rule: 'No marital status',
    description: 'Marital status should not appear on UK CVs',
    patterns: [
      /\bmarital status\b/i,
      /\bcivil partnership\b/i,
      // "single" is dropped as a bare term — it is everywhere on real CVs
      // ("single sign-on", "single-page application", "single source of
      // truth"), so it is only a disclosure when it labels a status field.
      /\b(?:marital\s+)?status\s*[:\-]\s*(?:single|married|divorced|widowed)\b/i,
      // These three have no common CV homonym, so they stand alone.
      /\b(?:married|divorced|widowed)\b/i,
    ],
  },
  {
    id: 'no-nationality',
    rule: 'No nationality/ethnicity',
    description: 'Nationality and ethnicity should not be disclosed',
    patterns: [
      /\bnationality\b/i,
      /\bethnicity\b/i,
      /\bethnic origin\b/i,
      /\bplace of birth\b/i,
      // "citizen"/"citizenship" is deliberately NOT a violation here. Stating
      // right to work ("British citizen, no sponsorship required") is advisable
      // for this product's audience and is a different disclosure from
      // volunteering nationality as a personal characteristic.
    ],
  },
  {
    id: 'no-gender',
    rule: 'No gender',
    description: 'Gender should not be specified on UK CVs',
    patterns: [
      /\bgender\b/i,
      /\bsex\s*[:\-]/i,
      // Bare "male"/"female" appears in legitimate context (e.g. a "Women in
      // Tech" or "Female Founders" network under volunteering), so it only
      // counts when labelled as a personal detail.
      /\b(?:sex|gender)\s*[:\-]\s*(?:male|female)\b/i,
    ],
  },
  {
    id: 'no-religion',
    rule: 'No religion',
    description: 'Religious beliefs should not appear on CVs',
    patterns: [
      /\breligion\b/i,
      /\breligious belief/i,
      // Bare "faith" is dropped — "acted in good faith" is standard legal and
      // commercial CV prose.
      /\bfaith\s*[:\-]/i,
    ],
  },
] as const;

// Impact statement patterns (quantified achievements)
export const IMPACT_PATTERNS = [
  /\d+%/,           // Percentages
  /\d+x/i,          // Multipliers
  /£[\d,]+/,        // GBP amounts
  /\$[\d,]+/,       // USD amounts
  /\d+\+?\s*(?:users?|clients?|customers?|team|developers?|engineers?)/i,
  /reduced?\s+(?:by\s+)?\d+/i,
  /increased?\s+(?:by\s+)?\d+/i,
  /improved?\s+(?:by\s+)?\d+/i,
  /saved?\s+(?:by\s+)?\d+/i,
  /delivered?\s+\d+/i,
  /\d+\s*(?:million|thousand|billion)/i,
];
