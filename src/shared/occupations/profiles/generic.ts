import type { OccupationProfile } from '../types';

/**
 * Fallback profile for CVs the classifier cannot confidently place. Rules here
 * must hold for ANY occupation — no sector assumptions, no credential
 * expectations, impact patterns that reward specificity in any field.
 */
export const genericProfile: OccupationProfile = {
  id: 'generic',
  version: '1.0.0',
  label: 'General',
  sector: 'general',
  roleArchetype: 'generic',
  applicationWorkflow: 'cv_led',
  primaryArtifact: 'cv',
  secondaryArtifacts: [],
  regulated: false,

  persona:
    'a UK recruiter experienced in screening CVs across industries, focused on clarity, evidence, and fit for the stated target role',

  sections: {
    rules: [
      { section: 'professional-summary', presence: 'expected' },
      { section: 'core-skills', presence: 'expected' },
      { section: 'professional-experience', presence: 'required' },
      { section: 'education', presence: 'expected' },
      { section: 'certifications', presence: 'optional' },
      { section: 'key-projects', presence: 'optional' },
    ],
    orderConstraints: [
      {
        before: 'professional-experience',
        after: 'education',
        severity: 'suggestion',
        reason: 'Work experience usually carries more weight than education once you have some.',
        appliesWhen: c => c.seniority !== 'entry',
      },
    ],
  },

  evidencePriorities: [
    'specific responsibilities with scale, frequency, or volume',
    'outcomes the candidate contributed to, stated honestly',
    'skills and systems named concretely rather than generically',
    'reliability and progression across roles',
  ],

  credentialRelevance: 'not_material',
  credentials: [],

  impactPatterns: [
    /\d+(?:\.\d+)?%/,
    /£[\d,]+/,
    /\d[\d,]*\+?\s*(?:\w+\s+){0,2}(?:customers?|clients?|orders?|staff|people|calls?|projects?|sites?|stores?|patients?|residents?|students?|cases?|records?|units?)\b/i,
    /\b(?:met|exceeded|achieved|delivered)\b.*\b(?:targets?|deadlines?|KPIs?|SLAs?|goals?)\b/i,
    /\b(?:reduced|increased|improved|saved|cut)\b.*\d/i,
    /\b(?:daily|weekly|monthly)\b.*\d/i,
    /\btrained\s+\d+\b/i,
  ],
  impactGuidance:
    'Strong bullets pair a specific action with scale, frequency, or outcome. Numbers help but are not mandatory — "handled goods-in for up to 30 deliveries a day" beats "responsible for deliveries".',

  prohibitedExpectations: [
    'Do not assume any particular industry — evaluate against the evidence the CV itself presents.',
    'Do not expect industry-specific tools, licences, or certifications.',
    'Do not require percentages or financial figures in achievement bullets.',
  ],

  summaryGuidance:
    'Two to three lines: who you are professionally, your strongest relevant experience, and what you are targeting next.',

  detection: {
    titlePatterns: [],
    dutyPatterns: [],
    sectorHint: 'general',
  },
};
