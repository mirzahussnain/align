// Classification is resolved BEFORE any scoring runs (see
// src/shared/services/classifier.ts). Occupation is the primary evaluation
// axis; sector only selects the vocabulary dictionary. The full object is
// persisted on each Analysis row, so every field here must stay
// JSON-serialisable.

import type { Sector } from '@/shared/constants/sector-keywords';

/** Occupations with a dedicated evaluation profile in src/shared/occupations/. */
export type OccupationId =
  | 'software_engineer'
  | 'warehouse_operative'
  | 'administrator'
  | 'registered_nurse'
  | 'healthcare_support'
  | 'generic';

/**
 * How candidates for this kind of role are filtered and what evidence matters —
 * shared across sectors (a warehouse operative and a retail assistant are both
 * frontline_operative even though their sectors differ).
 */
export type RoleArchetype =
  | 'regulated_clinician'
  | 'technical_specialist'
  | 'professional_analyst'
  | 'administrative_support'
  | 'frontline_operative'
  | 'generic';

/** How employers for this role actually screen applicants. */
export type ApplicationWorkflow =
  | 'cv_led'
  | 'application_form_led'
  | 'supporting_statement_led'
  | 'credential_led'
  | 'hybrid';

/**
 * The single artifact that matters most for the application outcome. A
 * `hybrid` workflow still names exactly one primary artifact so the UI always
 * knows what leads.
 */
export type PrimaryArtifact =
  | 'cv'
  | 'supporting_statement'
  | 'application_form'
  | 'credential_checklist';

export type Seniority = 'entry' | 'mid' | 'senior' | 'lead' | 'unknown';

/** Which precedence tier produced the classification. */
export type ClassificationSource =
  | 'job_description'
  | 'profile_target'
  | 'dictionary_evidence'
  | 'ai'
  | 'fallback';

/**
 * Stable machine-readable reasons for a classification. Tests assert these
 * codes, never prose. `SECTOR_TERMS_ONLY` marks the anti-pattern where sector
 * vocabulary is the only signal — that is treated as ambiguous, not a match.
 * `REGULATED_TARGET_UNCORROBORATED` records that an explicitly-confirmed
 * regulated target was RETAINED as authoritative even though the CV carried no
 * corroborating evidence (no matching regulated title, no mandatory credential).
 * The target is not replaced; this code marks that regulated corroboration is
 * absent so the analysis can report it as missing/unclear — see
 * {@link Classification.regulatedEvidence}. It never implies the candidate holds
 * the registration.
 * `USER_SELECTED_GENERIC` marks a deliberately occupation-neutral review the
 * user asked for — distinct from a low-confidence `FALLBACK`.
 * `DISTINCTIVE_OUTPUT_MATCH` marks that the CV showed a work output distinctive
 * to the occupation (category 3). `CONFLICTING_EVIDENCE` marks that a competing
 * occupation's title appeared as the CV's own role title, counting against this
 * occupation (category 9). `INSUFFICIENT_DIVERSITY` marks that a defining signal
 * was present but the evidence did not span the two-plus independent categories a
 * confident classification requires — the reason a single-signal match is capped
 * below the confidence threshold and falls through to the generic fallback.
 */
export type ReasonCode =
  | 'JOB_TITLE_EXACT_MATCH'
  | 'PROFILE_TARGET_SET'
  | 'CORE_TASKS_MATCH'
  | 'DISTINCTIVE_OUTPUT_MATCH'
  | 'TOOLS_MATCH'
  | 'CREDENTIAL_EVIDENCE'
  | 'SECTOR_TERMS_ONLY'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_DIVERSITY'
  | 'AI_CLASSIFIED'
  | 'REGULATED_TARGET_UNCORROBORATED'
  | 'USER_SELECTED_GENERIC'
  | 'FALLBACK';

/** A runner-up occupation, kept when its score was close to the winner's. */
export interface ClassificationCandidate {
  occupation: OccupationId;
  confidence: number;
}

export interface Classification {
  occupation: OccupationId;
  sector: Sector;
  roleArchetype: RoleArchetype;
  applicationWorkflow: ApplicationWorkflow;
  primaryArtifact: PrimaryArtifact;
  secondaryArtifacts: PrimaryArtifact[];
  seniority: Seniority;
  regulated: boolean;
  /**
   * For a regulated resolved occupation, whether the CV corroborates it:
   * `present` when a matching regulated title or the mandatory credential was
   * found, `absent` when the target is regulated but the CV shows no such
   * evidence (an explicitly-confirmed regulated target retained without
   * corroboration). Omitted for non-regulated occupations. NEVER an assertion
   * that the candidate is registered — `absent` means the opposite: the
   * registration is missing/unclear and must be reported as such.
   */
  regulatedEvidence?: 'present' | 'absent';
  /** 0..1 — drives the out-of-domain UI state and the AI-classification tier. */
  confidence: number;
  source: ClassificationSource;
  /** Present when the top occupation scores were close; primary stays authoritative. */
  alternatives?: ClassificationCandidate[];
  reasonCodes: ReasonCode[];
}
