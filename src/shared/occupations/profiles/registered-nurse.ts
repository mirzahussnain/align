import type { OccupationProfile } from '../types';

export const registeredNurseProfile: OccupationProfile = {
  id: 'registered_nurse',
  version: '1.0.0',
  label: 'Registered Nurse',
  sector: 'healthcare_nhs',
  roleArchetype: 'regulated_clinician',
  applicationWorkflow: 'supporting_statement_led',
  primaryArtifact: 'supporting_statement',
  secondaryArtifacts: ['application_form', 'credential_checklist', 'cv'],
  regulated: true,

  persona:
    'a UK healthcare recruiter experienced in NHS and independent-sector nursing recruitment, screening against person specifications, NMC registration, and safe-practice evidence',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected', note: 'Usually titled "Professional Profile" for clinicians.' },
      { section: 'core-skills', presence: 'required', note: 'Clinical skills and competencies, with registration status.' },
      { section: 'professional-experience', presence: 'required', note: 'Clinical experience with settings and patient groups.' },
      { section: 'education', presence: 'required' },
      { section: 'certifications', presence: 'expected', note: 'Mandatory training and revalidation-relevant courses.' },
      { section: 'key-projects', presence: 'irrelevant' },
    ],
    orderConstraints: [
      {
        before: 'core-skills',
        after: 'professional-experience',
        severity: 'suggestion',
        reason: 'Registration and core clinical competencies should be visible before the experience detail.',
      },
      {
        before: 'professional-experience',
        after: 'certifications',
        severity: 'suggestion',
        reason: 'Clinical experience leads; training and updates support it.',
      },
    ],
  },

  evidencePriorities: [
    'NMC registration status and PIN availability',
    'clinical settings, specialties, and patient acuity',
    'caseload and ward context (bed numbers, patients per shift)',
    'medication administration and clinical procedures',
    'escalation and deteriorating-patient management',
    'mentoring, preceptorship, and MDT working',
    'safeguarding and mandatory training currency',
  ],

  credentialRelevance: 'critical',
  credentials: [
    {
      id: 'nmc-registration',
      label: 'NMC registration',
      class: 'mandatory',
      patterns: [/\bNMC\b/i, /\bNursing and Midwifery Council\b/i, /\bNMC PIN\b/i],
      missingMessage:
        'NMC registration is a hard eligibility requirement for registered nurse roles — state your registration status (and that your PIN is available on request) prominently.',
      appliesWhen: c => c.occupation === 'registered_nurse',
    },
    {
      id: 'life-support',
      label: 'Life support training (BLS/ILS/ALS)',
      class: 'desirable',
      patterns: [/\b(?:basic|immediate|advanced) life support\b/i, /\b(?:BLS|ILS|ALS)\b/],
      missingMessage: 'List your current life support certification level with the year — it is a standard screening item.',
    },
    {
      id: 'safeguarding',
      label: 'Safeguarding training',
      class: 'desirable',
      patterns: [/\bsafeguarding\b/i],
      missingMessage: 'Safeguarding training level and currency is expected on clinical CVs.',
    },
  ],

  impactPatterns: [
    /\d+\s*(?:patients?|beds?|residents?)\b/i,
    /\bcaseloads?\b/i,
    /\b(?:reduced|cut|improved)\b.*\b(?:falls?|infections?|pressure|incidents?|readmissions?)\b/i,
    /\b(?:mentor(?:ed|ing)?|precept(?:or|ed|orship)|supervised?)\b/i,
    /\b(?:led|coordinated)\b.*\b(?:handovers?|discharges?|audits?|initiatives?)\b/i,
    /\bby\s+(?:a\s+)?(?:third|half|quarter|\d+%?)\b/i,
  ],
  impactGuidance:
    'Strong bullets show safe, competent practice at stated scale: patients per shift, ward size, procedures performed, audit contributions, mentoring. Only cite outcome numbers that are truthful and measurable — never invent clinical statistics.',

  prohibitedExpectations: [
    'Do not expect a projects or portfolio section.',
    'Do not expect software tools, programming languages, testing frameworks, or GitHub.',
    'Do not require revenue figures or business metrics in achievement bullets.',
    'Do not penalise the CV for deferring detail to a supporting statement — NHS applications are person-specification led.',
  ],

  summaryGuidance:
    'Professional profile of three lines: registration status, years and specialties of clinical experience, and the care philosophy or strength the target role calls for.',

  detection: {
    titlePatterns: [
      /\b(?:staff|registered|charge|senior staff)\s+nurse\b/i,
      /\bRGN\b/,
      /\bRN\b(?:\s+Adult|\s+Mental Health|\s+Child)?/,
      /\bward\s+(?:sister|manager)\b/i,
      /\bclinical nurse specialist\b/i,
      /\bnurse practitioner\b/i,
    ],
    taskPatterns: [
      /\bmedication administration\b|\badminister(?:ed|ing)?\s+(?:oral|IV|medication)\b/i,
      /\bcare plan(?:s|ning)?\b/i,
      /\bNEWS2?\b/,
      /\b(?:wound care|aseptic|venepuncture|catheteri[sz]ation|cannulation)\b/i,
      /\bhandovers?\b/i,
      /\bmultidisciplinary\b|\bMDT\b/,
      /\bdeteriorat(?:ing|ion)\b/i,
    ],
    sectorHint: 'healthcare_nhs',
  },
};
