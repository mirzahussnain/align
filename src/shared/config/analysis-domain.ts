const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const ANALYSIS_LIMITS = {
  maxCvBytes: envInt('ANALYSIS_MAX_CV_BYTES', 10 * 1024 * 1024),
  maxCvCharacters: envInt('ANALYSIS_MAX_CV_CHARACTERS', 120_000),
  maxJobDescriptionCharacters: envInt('JOB_MATCH_MAX_JD_CHARACTERS', 50_000),
  maxProfileSnapshotBytes: envInt('JOB_MATCH_MAX_PROFILE_SNAPSHOT_BYTES', 250_000),
  maxEvidenceItems: envInt('JOB_MATCH_MAX_EVIDENCE_ITEMS', 250),
  maxCustomNoteCharacters: envInt('JOB_MATCH_MAX_CUSTOM_NOTE_CHARACTERS', 2_000),
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

export const RETENTION = {
  anonymousDemoHours: envInt('RETENTION_ANONYMOUS_DEMO_HOURS', 24),
  freeSourceCvDays: envInt('RETENTION_FREE_SOURCE_CV_DAYS', 180),
  proSourceCvDays: envInt('RETENTION_PRO_SOURCE_CV_DAYS', 365),
  staleJobDays: envInt('RETENTION_STALE_JOB_DAYS', 45),
  abandonedRequestMinutes: envInt('RETENTION_ABANDONED_REQUEST_MINUTES', 30),
  generatedCvDays: envInt('RETENTION_GENERATED_CV_DAYS', 365),
} as const;

export const ANALYSIS_VERSIONS = {
  cvParser: 'cv-extract@1',
  atsPrompt: 'ats-semantic@2',
  jobMatchPrompt: 'job-match@3-profile-evidence',
  jobMatchAlgorithm: 'deduction-ledger@3',
  profileSnapshotSchema: 1,
} as const;

export const AI_BOUNDS = {
  timeoutMs: envInt('AI_PROVIDER_TIMEOUT_MS', 45_000),
  maxOutputTokens: envInt('AI_MAX_OUTPUT_TOKENS', 8_192),
} as const;
