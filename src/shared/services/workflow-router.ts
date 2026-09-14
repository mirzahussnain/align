// Application-workflow routing: different roles screen candidates through
// different artifacts, and the UI's emphasis should follow. A warehouse
// operative is screened on an application form (licences, availability,
// right to work) with the CV as support; an NHS nurse on a supporting
// statement against a person specification; an engineer on the CV itself.
//
// Pure presentation logic — no scoring changes. `cv_led` renders exactly the
// standard dashboard, so the main path carries zero regression risk.

import type { Classification, PrimaryArtifact } from '@/shared/types/classification';

export type WorkflowEmphasis =
  | 'screening_readiness'
  | 'credentials'
  | 'criterion_mapping'
  | 'cv_quality';

export interface WorkflowPresentation {
  primaryArtifact: PrimaryArtifact;
  secondaryArtifacts: PrimaryArtifact[];
  /** What the headline score should be called for this workflow. */
  scoreLabel: string;
  /** One honest sentence about what actually screens candidates for this role. */
  framing: string | null;
  emphasis: WorkflowEmphasis[];
}

const CV_LED: WorkflowPresentation = {
  primaryArtifact: 'cv',
  secondaryArtifacts: [],
  scoreLabel: 'CV Readiness Score',
  framing: null,
  emphasis: ['cv_quality'],
};

export function routeWorkflow(classification: Classification | undefined): WorkflowPresentation {
  if (!classification) return CV_LED;

  const base = {
    primaryArtifact: classification.primaryArtifact,
    secondaryArtifacts: classification.secondaryArtifacts,
  };

  switch (classification.applicationWorkflow) {
    case 'application_form_led':
      return {
        ...base,
        scoreLabel: 'CV Readiness Score',
        framing:
          'Roles like this are usually screened through the application form first — right to work, availability, licences, and relevant experience. Your CV supports those answers, so this report highlights screening readiness alongside CV quality.',
        emphasis: ['screening_readiness', 'credentials', 'cv_quality'],
      };

    case 'supporting_statement_led':
      return {
        ...base,
        scoreLabel: 'CV Readiness Score',
        framing:
          'Applications for this role are usually decided by a supporting statement written against the person specification, plus eligibility checks — the CV is supporting evidence. Use the job-match analysis with the full advert to map your evidence criterion by criterion.',
        emphasis: ['criterion_mapping', 'credentials', 'cv_quality'],
      };

    case 'credential_led':
      return {
        ...base,
        scoreLabel: 'CV Readiness Score',
        framing:
          'This role screens on registrations and licences before anything else. Make sure every required credential is named, current, and easy to find.',
        emphasis: ['credentials', 'cv_quality'],
      };

    case 'hybrid':
      return {
        ...base,
        scoreLabel: 'CV Readiness Score',
        framing: null,
        emphasis: ['cv_quality', 'credentials'],
      };

    case 'cv_led':
    default:
      return { ...CV_LED, ...base };
  }
}
