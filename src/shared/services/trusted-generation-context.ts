/**
 * The trusted generation-input contract.
 *
 * CV generation must only ever see facts it is allowed to trust. This module
 * defines the single shape that carries them — canonical Profile records,
 * immutable approval snapshots, deterministic derived facts, and any *explicit*
 * unresolved conflicts — and the builder that assembles it under guard.
 *
 * The full CvBuildSpec redesign is deferred to the next phase (spec §15); what
 * is enforced here now is the boundary that phase will build on:
 *
 *   - generation input is assembled in ONE place, from trusted classes only;
 *   - generated output can never appear as a source — `assertGenerationTrusted`
 *     throws if anything but a generation-trusted class is smuggled in;
 *   - unresolved conflicts travel WITH the context rather than being silently
 *     resolved, so the next phase can teach the prompt to avoid contested facts.
 */
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import {
  assertGenerationTrusted,
  type EvidenceSourceClass,
} from './evidence-provenance';
import {
  deriveProfessionalExperience,
  type DerivedFact,
} from './derived-facts';

/**
 * Canonical Profile facts, captured at a point in time. Tagged canonical by
 * construction: only `profile_user_entered`/`profile_user_confirmed` records
 * reach `ProfileData`, so the whole snapshot carries one canonical source class.
 */
export interface CanonicalProfileSnapshot {
  profileId: string;
  capturedAt: string;
  sourceClass: Extract<
    EvidenceSourceClass,
    'profile_user_entered' | 'profile_user_confirmed'
  >;
  profile: ProfileData;
}

/** An immutable approval snapshot, re-tagged with its historical source class. */
export interface ApprovedEvidenceSnapshot {
  sourceClass: Extract<EvidenceSourceClass, 'approval_snapshot'>;
  overlay: ApprovedProfileEvidenceOverlay;
}

/**
 * A minimal, forward-declared conflict record. Full conflict persistence lands
 * in a later stage; the shape exists now so generation can receive conflicts
 * explicitly rather than having them silently collapsed into one value.
 */
export interface ReconciliationConflict {
  key: string;
  entityType: string;
  field: string;
  reason: string;
}

export interface TrustedGenerationContext {
  profileSnapshot: CanonicalProfileSnapshot;
  approvedEvidenceSnapshots: ApprovedEvidenceSnapshot[];
  derivedFacts: DerivedFact[];
  unresolvedConflicts: ReconciliationConflict[];
}

export interface BuildTrustedGenerationContextInput {
  profile: ProfileData;
  approvedEvidence: ApprovedProfileEvidenceOverlay[];
  /** Passed straight through — conflicts are never resolved here, only surfaced. */
  unresolvedConflicts?: ReconciliationConflict[];
  now?: Date;
}

/**
 * Assemble the trusted context. Wraps canonical profile data and approval
 * snapshots in their source classes, computes deterministic derived facts, and
 * asserts the generated-output quarantine before returning. A programming error
 * that tries to feed generated or inferred content in fails loudly here.
 */
export function buildTrustedGenerationContext(
  input: BuildTrustedGenerationContextInput
): TrustedGenerationContext {
  const now = input.now ?? new Date();

  const profileSnapshot: CanonicalProfileSnapshot = {
    profileId: input.profile.profileId,
    capturedAt: now.toISOString(),
    sourceClass: 'profile_user_entered',
    profile: input.profile,
  };

  const approvedEvidenceSnapshots: ApprovedEvidenceSnapshot[] = input.approvedEvidence.map(
    (overlay) => ({ sourceClass: 'approval_snapshot', overlay })
  );

  // Enforce the boundary: every tagged input must be a generation-trusted class.
  assertGenerationTrusted([profileSnapshot, ...approvedEvidenceSnapshots]);

  const derivedFacts: DerivedFact[] = [
    deriveProfessionalExperience(input.profile.experience, now),
  ];

  return {
    profileSnapshot,
    approvedEvidenceSnapshots,
    derivedFacts,
    unresolvedConflicts: input.unresolvedConflicts ?? [],
  };
}
