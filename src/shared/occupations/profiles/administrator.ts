import type { OccupationProfile } from '../types';

export const administratorProfile: OccupationProfile = {
  id: 'administrator',
  version: '1.1.0',
  label: 'Administration & Office Support',
  sector: 'admin_office',
  roleArchetype: 'administrative_support',
  applicationWorkflow: 'hybrid',
  primaryArtifact: 'cv',
  secondaryArtifacts: ['application_form'],
  regulated: false,

  persona:
    'a UK recruiter experienced in hiring administrators, office managers, and business-support staff across sectors',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'required' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'education', presence: 'expected' },
      { section: 'certifications', presence: 'optional' },
      { section: 'key-projects', presence: 'irrelevant' },
    ],
    orderConstraints: [
      {
        before: 'core-skills',
        after: 'professional-experience',
        severity: 'suggestion',
        reason: 'A skills list up front lets screeners match systems (Excel, Sage, CRMs) at a glance.',
      },
      {
        before: 'professional-experience',
        after: 'education',
        severity: 'suggestion',
        reason: 'Administrative experience carries more weight than qualifications once established.',
      },
    ],
  },

  evidencePriorities: [
    'accuracy and volume of processing work (invoices, records, data entry)',
    'systems used (Excel proficiency, Sage/ERP, CRMs, Outlook)',
    'diary, meeting, and travel coordination',
    'process improvements that saved time or reduced backlogs',
    'communication with clients, suppliers, and stakeholders',
    'confidentiality and records management',
  ],

  credentialRelevance: 'not_material',
  credentials: [
    {
      id: 'business-admin-qual',
      label: 'Business administration qualification',
      class: 'desirable',
      patterns: [/\b(?:NVQ|Level \d) (?:Diploma |Certificate )?in Business(?: and)? Administration\b/i],
      missingMessage: 'A business administration qualification can help for some employers but experience and systems skills matter more.',
    },
  ],

  impactPatterns: [
    /\d[\d,]*\+?\s*(?:invoices?|records?|documents?|calls?|enquiries|orders?|staff|bookings?)\b/i,
    /\d+(?:\.\d+)?%/,
    /\breduced\b.*\b(?:backlog|turnaround|errors?|time)\b/i,
    /\b(?:from|to)\s+\d+\s+(?:days?|weeks?|hours?)\b/i,
    /\bwithin\s+(?:budget|deadlines?|SLAs?)\b/i,
    /\bintroduc(?:ed|ing)\b.*\b(?:system|process|spreadsheet|tracker)\b/i,
    /\baccuracy\b/i,
  ],
  impactGuidance:
    'Strong bullets quantify volume and accuracy (invoices processed, turnaround times, backlog reductions) or name a process the candidate improved. Scale and reliability beat vague "responsible for" phrasing; percentages are optional.',

  prohibitedExpectations: [
    'Do not expect a projects or portfolio section.',
    'Do not expect programming languages, testing frameworks, or GitHub.',
    'Do not expect professional licences or regulated registrations.',
    'Do not require revenue or percentage figures in achievement bullets.',
  ],

  summaryGuidance:
    'Two to three lines: years of administrative experience, strongest systems (name Excel level honestly), and one accuracy or efficiency achievement.',

  detection: {
    titlePatterns: [
      /\b(?:office|team|sales|HR|finance|school|medical|legal)?\s*administrator\b/i,
      /\badministrative\s+(?:assistant|officer|support)\b/i,
      /\boffice\s+(?:manager|coordinator|assistant)\b/i,
      /\b(?:admin|business support)\s+(?:assistant|officer)\b/i,
      /\breceptionist\b/i,
    ],
    taskPatterns: [
      /\bdiary management\b/i,
      /\b(?:process(?:ed|ing)?|match(?:ed|ing)?)\s+(?:supplier\s+)?invoices?\b/i,
      /\bminute[- ]taking\b|\btook minutes\b/i,
      /\bdata entry\b/i,
      /\b(?:filing|records management)\b/i,
      /\bswitchboard\b|\bfront[- ]of[- ]house\b/i,
      /\bpivot tables?\b|\bVLOOKUP\b/i,
    ],
    sectorHint: 'admin_office',
  },
};
