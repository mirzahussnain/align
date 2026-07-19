// Occupation evaluation profiles: the versioned, in-repo rule packs that make
// scoring occupation-aware. Profiles contain RegExps and functions, so they
// are NEVER persisted — analyses record only `{ occupation, profileVersion }`.
//
// Authoring rules:
// - Every non-tech profile MUST have non-empty `prohibitedExpectations`; that
//   list is rendered as explicit DO-NOT lines in the AI prompt and is the
//   mechanism that stops a care CV being asked for Cypress.
// - Order constraints are relative before/after pairs, never an exact array —
//   there is no universally optimal section order.

import type { Sector } from '@/shared/constants/sector-keywords';
import type {
  ApplicationWorkflow,
  Classification,
  OccupationId,
  PrimaryArtifact,
  RoleArchetype,
} from '@/shared/types/classification';

/** How strongly a section is expected for this occupation. */
export type SectionPresence = 'required' | 'expected' | 'optional' | 'irrelevant';

export interface SectionRule {
  /** Section id from SECTION_HEADINGS_MAP (scoring-config). */
  section: string;
  presence: SectionPresence;
  /** Optional authoring note surfaced in suggestions. */
  note?: string;
}

/** "`before` should appear above `after`" — relative, not absolute. */
export interface OrderConstraint {
  before: string;
  after: string;
  severity: 'warning' | 'suggestion';
  reason: string;
  /** Gate the constraint on classification, e.g. education-first only for entry-level. */
  appliesWhen?: (c: Classification) => boolean;
}

export type CredentialClass = 'mandatory' | 'desirable' | 'role_dependent';

export interface CredentialRule {
  /** Unique within the profile. */
  id: string;
  label: string;
  class: CredentialClass;
  /** Literal-ish patterns matched against raw CV text. */
  patterns: RegExp[];
  /** Shown when the credential is absent and the rule applies. */
  missingMessage: string;
  /** Gate on classification — NMC is mandatory for a registered nurse, N/A for an HCA. */
  appliesWhen?: (c: Classification) => boolean;
}

/** Whether credentials meaningfully gate hiring for this occupation. */
export type CredentialRelevance = 'critical' | 'useful' | 'not_material';

/** Signals the classifier uses to detect this occupation. */
export interface OccupationDetection {
  /** Matched against job titles in the CV/JD — the strongest signal. */
  titlePatterns: RegExp[];
  /** Responsibility/task verbs and tools that evidence the occupation day-to-day. */
  taskPatterns: RegExp[];
  /** The sector whose vocabulary dictionary this occupation defaults to. */
  sectorHint: Sector;
}

export interface OccupationProfile {
  id: OccupationId;
  /** Bump on any rule change; persisted per-analysis as profileVersion. */
  version: string;
  label: string;
  sector: Sector;
  roleArchetype: RoleArchetype;
  applicationWorkflow: ApplicationWorkflow;
  primaryArtifact: PrimaryArtifact;
  secondaryArtifacts: PrimaryArtifact[];
  regulated: boolean;

  /** Evaluator persona injected into AI prompts — occupation-specific, never "tech recruiter" by default. */
  persona: string;

  sections: {
    rules: SectionRule[];
    orderConstraints: OrderConstraint[];
  };

  /** What genuinely matters as evidence for this occupation, in priority order. */
  evidencePriorities: string[];

  credentialRelevance: CredentialRelevance;
  credentials: CredentialRule[];

  /** Sector-appropriate impact patterns — percentages are never mandatory. */
  impactPatterns: RegExp[];
  impactGuidance: string;

  /** Rendered as explicit DO-NOT lines in prompts and filtered from recommendations. */
  prohibitedExpectations: string[];

  summaryGuidance: string;

  detection: OccupationDetection;
}
