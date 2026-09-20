export const ANALYSIS_LIMITS = {
  maxCvCharacters: 120_000,
  maxJobDescriptionCharacters: 50_000,
  maxProfileSnapshotBytes: 250_000,
  maxEvidenceItems: 250,
  maxCustomNoteCharacters: 2_000,
} as const;

export const REGENERATION_CONTEXT_LIMITS = {
  maxHitlEntries: 20,
  maxHitlKeyCharacters: 120,
  maxHitlValueCharacters: 2_000,
  maxHitlBytes: 40_000,
  maxApprovedItems: 100,
  maxApplicationIds: 100,
  maxIdentifierCharacters: 128,
  maxTotalBytes: 65_536,
} as const;
