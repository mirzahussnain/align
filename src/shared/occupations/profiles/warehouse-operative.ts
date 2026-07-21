import type { OccupationProfile } from '../types';

export const warehouseOperativeProfile: OccupationProfile = {
  id: 'warehouse_operative',
  version: '1.1.0',
  label: 'Frontline Operations',
  sector: 'warehouse_logistics',
  roleArchetype: 'frontline_operative',
  applicationWorkflow: 'application_form_led',
  primaryArtifact: 'application_form',
  secondaryArtifacts: ['cv'],
  regulated: false,

  persona:
    'a UK recruiter experienced in high-volume warehouse and logistics operative hiring, screening for reliability, safety, licences, and availability',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'required' },
      { section: 'certifications', presence: 'expected', note: 'Licences and safety training belong near the top.' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'education', presence: 'optional' },
      { section: 'key-projects', presence: 'irrelevant' },
    ],
    orderConstraints: [
      {
        before: 'certifications',
        after: 'education',
        severity: 'warning',
        reason: 'Licences and safety training are screened before education for operative roles.',
      },
      {
        before: 'professional-experience',
        after: 'education',
        severity: 'suggestion',
        reason: 'Recent warehouse experience is the strongest signal; education can sit last.',
      },
    ],
  },

  evidencePriorities: [
    'picking/packing rates and accuracy against targets',
    'health and safety record and safe manual handling',
    'equipment operated (FLT, pallet trucks, RF scanners)',
    'attendance and reliability',
    'shift flexibility and availability',
    'stock control and goods in/out experience',
  ],

  credentialRelevance: 'useful',
  credentials: [
    {
      id: 'flt-licence',
      label: 'FLT licence (counterbalance/reach)',
      class: 'role_dependent',
      patterns: [/\bFLT\b/i, /\bfork ?lift\b/i, /\bcounterbalance\b/i, /\breach truck\b/i],
      missingMessage: 'Many operative roles list an FLT licence as essential — add yours (with accreditation body and date) if you hold one.',
    },
    {
      id: 'manual-handling',
      label: 'Manual handling training',
      class: 'desirable',
      patterns: [/\bmanual handling\b/i],
      missingMessage: 'Manual handling training is a common screening item — list it with the year if you have it.',
    },
    {
      id: 'driving-entitlement',
      label: 'Driving entitlement (Cat C/CE, Driver CPC)',
      class: 'role_dependent',
      patterns: [/\bcategory\s+C\+?E?\b/i, /\bcat\s+C\+?E?\b/i, /\bdriver cpc\b/i, /\bHGV\b/i, /\bLGV\b/i],
      missingMessage: 'Driving entitlements only matter for driving roles — list category and CPC status if you have them.',
    },
  ],

  impactPatterns: [
    /\d[\d,]*\+?\s*(?:orders?|picks?|items?|pallets?|deliveries|units?|lines?)\b/i,
    /\d+(?:\.\d+)?%/,
    /\b(?:met|exceeded|achieved|maintained)\b.*\b(?:targets?|rates?|KPIs?|SLAs?|accuracy|deadlines?)\b/i,
    /\bzero[- ](?:accidents?|incidents?|harm)\b/i,
    /\b(?:perfect|full)\s+attendance\b/i,
    /\btrained\s+\d+\b/i,
    /\baccuracy\b/i,
  ],
  impactGuidance:
    'Strong bullets show reliability and competence: targets met, accuracy maintained, safe equipment operation, attendance, training others. Percentages are welcome but never required — "consistently met daily picking targets while maintaining accurate order checks" is a strong bullet.',

  prohibitedExpectations: [
    'Do not expect a projects or portfolio section.',
    'Do not expect software tools, programming languages, or testing frameworks.',
    'Do not expect GitHub, LinkedIn, or personal websites.',
    'Do not require percentages or revenue figures in achievement bullets.',
    'Do not treat the absence of a degree as a weakness.',
  ],

  summaryGuidance:
    'Two to three lines: years of warehouse experience, key licences, shift availability, and one reliability signal (safety record, attendance, accuracy).',

  detection: {
    titlePatterns: [
      /\bwarehouse\s+(?:operative|operator|assistant|worker)\b/i,
      /\bpicker[\s/]*packer\b/i,
      /\b(?:goods|stock)\s+(?:in|out)\s+operative\b/i,
      /\bfork ?lift\s+(?:driver|operator)\b/i,
      /\bgeneral\s+operative\b/i,
    ],
    taskPatterns: [
      /\bpick(?:ing|ed)?\s+(?:and\s+pack(?:ing|ed)?|orders?)\b/i,
      /\bRF\s+scanner\b/i,
      /\bpallets?\b/i,
      /\bgoods\s+(?:in|out)\b/i,
      /\bstock\s+(?:rotation|control|counts?)\b/i,
      /\bloading\s+and\s+unloading\b/i,
    ],
    sectorHint: 'warehouse_logistics',
  },
};
