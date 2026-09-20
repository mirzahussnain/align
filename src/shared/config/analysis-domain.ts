const envInt = (name: string, fallback: number): number => {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

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
