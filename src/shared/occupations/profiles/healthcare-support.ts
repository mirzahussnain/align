import type { OccupationProfile } from '../types';

/**
 * Healthcare Support — the UNREGULATED care-support family: healthcare
 * assistants, care/support workers, senior care assistants, domiciliary carers.
 *
 * This is deliberately NOT the registered_nurse profile and must never behave
 * like it. Support roles carry no mandatory professional registration, so the
 * profile:
 *   - is `regulated: false` (self-selectable, activates on a declared target
 *     without demanding CV corroboration, unlike the nurse profile);
 *   - treats DBS and the Care Certificate as DESIRABLE, never universally
 *     mandatory — a strong care CV must be able to reach full credential marks;
 *   - names every clinician regulator (NMC/GMC/GPhC/HCPC) in
 *     `prohibitedExpectations` so the AI is explicitly told not to demand a
 *     registration the candidate cannot legally hold.
 *
 * Impact patterns are tuned CONSERVATIVELY: bare care vocabulary ("personal
 * care", "safeguarding", "dignity") does NOT score as impact on its own. A
 * pattern only fires when the care action is paired with scale, an outcome, a
 * reporting/escalation action, or a concrete record/handover — so a weak,
 * keyword-stuffed CV cannot reach full impact marks merely by sounding clinical.
 */
export const healthcareSupportProfile: OccupationProfile = {
  id: 'healthcare_support',
  version: '1.0.0',
  label: 'Healthcare Support',
  sector: 'healthcare_nhs',
  roleArchetype: 'frontline_operative',
  applicationWorkflow: 'application_form_led',
  primaryArtifact: 'application_form',
  secondaryArtifacts: ['cv'],
  regulated: false,

  persona:
    'a UK health and social care recruiter experienced in hiring healthcare assistants, care workers, and support workers, screening for compassionate person-centred support, safe practice, reliability, DBS and mandatory training — never as a registered clinician',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'required', note: 'Care competencies and the client groups you support.' },
      { section: 'certifications', presence: 'expected', note: 'Care Certificate, DBS, and mandatory training belong near the top.' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'education', presence: 'optional' },
      { section: 'key-projects', presence: 'irrelevant' },
    ],
    orderConstraints: [
      {
        before: 'certifications',
        after: 'education',
        severity: 'suggestion',
        reason: 'Care Certificate, DBS, and mandatory training are screened before formal education for support roles.',
      },
    ],
  },

  evidencePriorities: [
    'person-centred, dignity-led personal care',
    'client groups supported (older adults, dementia, learning disabilities, community)',
    'safeguarding awareness and reporting or escalating concerns',
    'observations, monitoring, and escalation to the registered nurse or clinician',
    'accurate handovers, care notes, and documentation (including MAR charts)',
    'mandatory training currency (moving and handling, basic life support, infection control)',
    'reliability, attendance, and lone/community working',
    'caseload or resident/service-user volume, and quality outcomes (fewer incidents, faster response, compliance)',
  ],

  credentialRelevance: 'useful',
  credentials: [
    {
      // Desirable and role-dependent, NEVER mandatory: many employers accept a
      // willingness to complete the Care Certificate, so its absence must not
      // floor the credentials score.
      id: 'care-certificate',
      label: 'Care Certificate',
      class: 'desirable',
      patterns: [/\bcare certificate\b/i],
      missingMessage:
        'Many care roles ask for the Care Certificate or a willingness to complete it — state it if you hold it (with year), but it is not a hard requirement everywhere.',
    },
    {
      // Standard for roles involving regulated activity, but role-dependent —
      // not every support role requires an enhanced DBS on day one.
      id: 'dbs-check',
      label: 'DBS check',
      class: 'desirable',
      patterns: [/\bDBS\b/i, /\bdisclosure and barring\b/i, /\benhanced disclosure\b/i],
      missingMessage:
        'An enhanced DBS check is standard for most care roles — note if you hold one (and whether it is on the update service).',
    },
  ],

  // Conservative on purpose: each pattern requires a care action tied to SCALE,
  // an OUTCOME, an ESCALATION/REPORTING action, or a concrete RECORD/HANDOVER.
  // Bare vocabulary lines in a skills list do not count as impact.
  impactPatterns: [
    // Caseload / resident / patient / service-user VOLUME (needs a number).
    /\d[\d,]*\+?\s*(?:\w+\s+){0,2}(?:patients?|residents?|clients?|service users?)\b/i,
    // Safeguarding / condition-change reporting or escalation ACTION.
    /\b(?:report(?:ed|ing)?|escalat(?:e|ed|ing)|rais(?:e|ed|ing)|flag(?:ged|ging)?)\b[^.\n]*\b(?:safeguarding|concerns?|deterioration|changes? in (?:condition|the client))\b/i,
    // Observations / vital signs monitored AND escalated or acted on.
    /\b(?:observations?|vital signs?|NEWS2?)\b[^.\n]*\b(?:escalat|report|monitor|record)/i,
    // Person-centred OUTCOME: supporting/maintaining independence, dignity, routines.
    /\b(?:support(?:ed|ing)?|help(?:ed|ing)?|maintain(?:ed|ing)?|promot(?:e|ed|ing)|enabl(?:e|ed|ing))\b[^.\n]*\b(?:independence|dignity|person[- ]centred|routines?)\b/i,
    // Concrete documentation / handover RECORD, not the word "handover" alone.
    /\b(?:record(?:ed|ing)?|document(?:ed|ing)?|complet(?:e|ed|ing)|hand(?:ed|ing)?[- ]?over)\b[^.\n]*\b(?:care notes?|MAR|handovers?|observations?|records?|charts?)\b/i,
    // Reliability / attendance stated as an achievement, or a quality outcome.
    /\b(?:full|consistent(?:ly)?|maintained|excellent)\b[^.\n]*\b(?:attendance|punctual|reliab)/i,
    /\b(?:reduced|improved|fewer|maintained|faster)\b[^.\n]*\b(?:incidents?|falls?|complaints?|response(?:\s+time)?|compliance|quality|pressure)\b/i,
    // Standard numeric outcomes still count.
    /\d+(?:\.\d+)?%/,
  ],
  impactGuidance:
    'Strong bullets show safe, kind, reliable support at stated scale: clients or residents per shift, the groups you support, observations taken and escalated, safeguarding action, accurate handovers and MAR records, and dependable attendance. Numbers are never required — "personal care for up to 12 patients per shift, escalating NEWS2 concerns to the nurse" is strong evidence, but listing care skills without any action, scale, or outcome is not impact.',

  prohibitedExpectations: [
    'Do not expect or demand professional registration of any kind — NMC, GMC, GPhC, or HCPC. Healthcare support roles are unregistered; treat any such registration as irrelevant, not missing.',
    'Do not treat the candidate as a registered clinician (nurse, doctor, pharmacist, paramedic) or expect clinician-level autonomy, prescribing, or independent clinical decision-making.',
    'Do not expect a projects or portfolio section.',
    'Do not expect software tools, programming languages, testing frameworks, or GitHub.',
    'Do not require revenue figures or business metrics in achievement bullets.',
    'Do not treat DBS or the Care Certificate as universally mandatory — they are desirable and role-dependent.',
  ],

  summaryGuidance:
    'Three lines: who you are as a care professional, years and settings of care experience (home care, residential, NHS ward, community), and your Care Certificate/mandatory training plus the person-centred strength the role calls for.',

  detection: {
    titlePatterns: [
      /\bhealthcare\s+assistant\b/i,
      /\b(?:senior\s+)?care\s+(?:worker|assistant)\b/i,
      /\bsupport\s+worker\b/i,
      /\bHCA\b/,
      /\bdomiciliary\s+care(?:\s+worker)?\b/i,
      /\bcare\s+support\s+worker\b/i,
    ],
    taskPatterns: [
      /\bpersonal care\b/i,
      /\bsafeguarding\b/i,
      /\bmoving and handling\b|\bmanual handling\b/i,
      /\bmedication (?:prompting|administration|MAR)\b/i,
      /\bperson[- ]centred\b/i,
    ],
    sectorHint: 'healthcare_nhs',
  },
};
