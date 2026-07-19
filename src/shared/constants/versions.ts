// Version markers persisted on every Analysis row so stored results can be
// interpreted (and migrated) without guessing which formula produced them.

/**
 * The scoring formula version. v1 = the launch-era 8-category tech-default
 * engine (never persisted — pre-rebuild rows have a NULL scoringVersion).
 * v2 = occupation-aware engine: classification before scoring, credentials
 * dimension, profile-driven impact and section rules.
 */
export const SCORING_VERSION = 2;

/** Bump when any sector keyword dictionary changes materially. */
export const DICTIONARY_VERSION = '1';
