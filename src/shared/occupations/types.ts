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

/**
 * Signals the classifier uses to detect this occupation, grouped by
 * discriminating power. The categories map to the evidence model in
 * {@link file://../../services/classifier.ts scoreOccupationEvidence}:
 *
 *  1. `titlePatterns`     — explicit role/title evidence (strongest)
 *  2. `dutyPatterns`      — occupation-defining duties
 *  3. `outputPatterns`    — distinctive work outputs / deliverables
 *  4. sector dictionary   — domain terminology (weak; via `sectorHint`)
 *  5. `credentials`       — qualifications / licences / registrations (on the profile)
 *  7. `toolPatterns`      — tools & methods (LOW weight — shared across occupations)
 *  8. `genericSkillPatterns` — generic transferable skills (near-zero weight)
 *  9. `negativePatterns`  — conflicting evidence pointing at a DIFFERENT occupation
 *
 * Only categories 1–3 and mandatory credentials are "defining": a classification
 * can only become CONFIDENT when at least one defining signal is present AND the
 * evidence spans two or more independent categories. Tools, generic skills and
 * sector vocabulary can support a match another signal established, but never
 * decide one on their own — Python/SQL alone must not pick Software Engineering,
 * "customer service" alone must not pick Administration, sector words alone must
 * not activate a clinician.
 */
export interface OccupationDetection {
  /** Category 1 — role/job titles. The strongest, most discriminating signal. */
  titlePatterns: RegExp[];
  /**
   * Category 2 — occupation-DEFINING duties: the day-to-day responsibilities
   * that only this occupation performs. NOT tools and NOT generic verbs — a
   * defining duty for a nurse is "medication administration", not "Python".
   */
  dutyPatterns: RegExp[];
  /** Category 3 — distinctive work outputs / deliverables this occupation produces. */
  outputPatterns?: RegExp[];
  /**
   * Category 7 — tools & methods. Deliberately LOW discriminating weight because
   * they are shared across occupations (Python, SQL, Excel, RF scanners). Never
   * sufficient alone to classify.
   */
  toolPatterns?: RegExp[];
  /**
   * Category 8 — generic transferable skills (communication, teamwork,
   * reliability). Near-zero weight: they describe everyone and must never decide
   * an occupation.
   */
  genericSkillPatterns?: RegExp[];
  /**
   * Category 9 — negative / conflicting evidence: another occupation's role
   * title appearing as this CV's own title line, which counts AGAINST this
   * occupation. Matched against title-like lines only, never prose, so a nurse
   * mentioning "healthcare assistants" in a bullet is not penalised.
   */
  negativePatterns?: RegExp[];
  /** Category 4 — the sector whose vocabulary dictionary this occupation defaults to. */
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
