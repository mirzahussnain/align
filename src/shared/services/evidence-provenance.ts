/**
 * Source-of-truth provenance taxonomy.
 *
 * Every fact the product reasons about comes from somewhere, and where it came
 * from decides how much authority it carries. This module is the single, shared
 * definition of those source classes, their relative priority, and the two
 * questions that gate the whole trust model:
 *
 *   - can this source ever become a canonical Profile fact?  (`canBecomeCanonical`)
 *   - can this source be fed into CV generation as evidence? (`isTrustedForGeneration`)
 *
 * Nothing here mutates data. It is pure classification so the same rules apply
 * identically at reconciliation time, generation time, and validation time — the
 * way `cv-evidence.ts` is the single source of "what counts as a metric".
 *
 * The overriding invariant: `generated_output` and `model_inferred` are the two
 * lowest-authority classes and can NEVER become canonical or satisfy a
 * requirement on their own. A generated CV re-entering the Profile as fact is the
 * exact failure this phase exists to prevent.
 */

/** Where a single assertion about a fact originated. */
export type EvidenceSourceClass =
  /** The user typed or edited the fact directly in Profile Management. */
  | 'profile_user_entered'
  /** The user explicitly selected/confirmed the fact during reconciliation. */
  | 'profile_user_confirmed'
  /** A parser/model pulled the fact from an uploaded CV. Not canonical alone. */
  | 'cv_extracted'
  /** A fact from another document (credential, registration). Unconfirmed alone. */
  | 'document_extracted'
  /** An immutable record of facts approved for a specific requirement. Historical. */
  | 'approval_snapshot'
  /** Content produced in a generated CV or other output. Never a source of truth. */
  | 'generated_output'
  /** A deterministic calculation from canonical facts (e.g. supported duration). */
  | 'system_derived'
  /** An AI interpretation/suggestion. Never canonical without user confirmation. */
  | 'model_inferred';

/**
 * Conflict-resolution priority, highest authority first. Position in this array
 * IS the ranking — index 0 wins over index 1, and so on. Generated output and
 * model inference sit at the bottom by design; a higher-priority disagreement
 * must never be silently overwritten by a lower one (that is a conflict, not a
 * merge — see the reconciliation phase), but priority decides which value is
 * *presented* as canonical when the user has not been asked to choose.
 */
export const SOURCE_PRIORITY: readonly EvidenceSourceClass[] = [
  'profile_user_confirmed',
  'profile_user_entered',
  'document_extracted',
  'approval_snapshot',
  'cv_extracted',
  'system_derived',
  'model_inferred',
  'generated_output',
] as const;

const PRIORITY_RANK: Record<EvidenceSourceClass, number> = SOURCE_PRIORITY.reduce(
  (acc, sourceClass, index) => {
    acc[sourceClass] = index;
    return acc;
  },
  {} as Record<EvidenceSourceClass, number>
);

/**
 * Order two source classes by authority. Negative when `a` outranks `b`,
 * positive when `b` outranks `a`, zero when equal. Sort an array of assertions
 * with this to bring the most authoritative first.
 */
export function compareSourcePriority(
  a: EvidenceSourceClass,
  b: EvidenceSourceClass
): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

/** True when `a` has strictly greater authority than `b`. */
export function outranks(a: EvidenceSourceClass, b: EvidenceSourceClass): boolean {
  return PRIORITY_RANK[a] < PRIORITY_RANK[b];
}

/**
 * The only classes that may already be, or may become, canonical Profile truth.
 * Extraction and inference are deliberately excluded: extracting a fact from a
 * CV or having a model suggest it does NOT make it canonical — the user must
 * confirm it first, which promotes it to `profile_user_confirmed`.
 */
const CANONICAL_CLASSES = new Set<EvidenceSourceClass>([
  'profile_user_entered',
  'profile_user_confirmed',
]);

export function canBecomeCanonical(sourceClass: EvidenceSourceClass): boolean {
  return CANONICAL_CLASSES.has(sourceClass);
}

/**
 * The classes generation is allowed to draw on as evidence. Canonical Profile
 * facts, historical approval snapshots, and deterministic system derivations are
 * trusted. Raw extraction and model inference are not evidence until confirmed,
 * and generated output is never evidence — otherwise a CV could cite itself.
 */
const GENERATION_TRUSTED_CLASSES = new Set<EvidenceSourceClass>([
  'profile_user_entered',
  'profile_user_confirmed',
  'approval_snapshot',
  'system_derived',
]);

export function isTrustedForGeneration(sourceClass: EvidenceSourceClass): boolean {
  return GENERATION_TRUSTED_CLASSES.has(sourceClass);
}

/** Content that must be quarantined from ever proving a fact. */
export function isGeneratedOrInferred(sourceClass: EvidenceSourceClass): boolean {
  return sourceClass === 'generated_output' || sourceClass === 'model_inferred';
}

/** Anything carrying a source class the generation boundary must reject. */
export interface HasSourceClass {
  sourceClass: EvidenceSourceClass;
}

export class GeneratedEvidenceQuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedEvidenceQuarantineError';
  }
}

/**
 * Hard guard for the generation boundary: throw if any supplied item carries a
 * source class that generation must not treat as evidence. This is the
 * enforcement point behind "generated output must never re-enter the Profile or
 * satisfy a requirement" — a programming error that tries to smuggle generated
 * or inferred content into the trusted context fails loudly rather than silently
 * laundering a fabricated fact into a CV.
 */
export function assertGenerationTrusted<T extends HasSourceClass>(items: readonly T[]): void {
  for (const item of items) {
    if (!isTrustedForGeneration(item.sourceClass)) {
      throw new GeneratedEvidenceQuarantineError(
        `Refusing to use ${item.sourceClass} content as generation evidence.`
      );
    }
  }
}
