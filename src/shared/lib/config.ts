export const AI_CONFIG = {
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: 'gemini-3.5-flash',
    fallbackModel: 'gemini-3.5-flash',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: 'llama-3.3-70b-versatile',
  }
};

/**
 * Per-task Gemini thinking budgets, in tokens.
 *
 * Thinking tokens are billed but never appear in the prompt or the output. On
 * gemini-3.5-flash they measure at ~67% of total spend (~1,100 per call), which
 * makes this the largest single cost lever in the app — larger than any prompt
 * you could trim.
 *
 * `undefined` leaves the model's default (unbounded) thinking on. Lower is
 * cheaper and faster; 0 disables thinking entirely (measured: 78% fewer total
 * tokens, 3.7x faster).
 *
 * NOTE: these caps are set conservatively and have NOT been A/B tested for
 * output quality. Before lowering them further, run the same prompt at the
 * current budget and at 0 and compare results.
 */
export const THINKING_BUDGETS = {
  /**
   * Job matching is a genuine multi-step reasoning task — it inventories the JD,
   * matches tool-by-tool, does date arithmetic and sums a deduction ledger.
   * Left unbounded deliberately: this is the output users judge the product on.
   */
  jobMatch: undefined as number | undefined,
  /** Scoring a CV's summary and impact — moderate reasoning. */
  semanticFeedback: 1024 as number | undefined,
  /** Rewriting into a fixed schema — mostly transformation. */
  rewrite: 1024 as number | undefined,
  /** Relevance matching against a supplied inventory — mostly comparison. */
  profileReconcile: 768 as number | undefined,
  /**
   * Matching imported CV proposals against the records a Career Profile already
   * holds. Comparison over two supplied inventories, like profileReconcile, but
   * over more items — a CV import can carry thirty-odd proposals at once.
   */
  cvImportReconcile: 1024 as number | undefined,
  /**
   * Occupation classification of an ambiguous CV excerpt — pure extraction,
   * fires only when deterministic tiers can't resolve it. Never metered
   * against user quota.
   */
  classification: 0 as number | undefined,
} as const;

/**
 * How long a quota reservation is held before it is treated as abandoned and
 * stops counting against the user's quota. A process can crash after reserving
 * but before committing or releasing; lazy expiry (checked on the next reserve
 * for the same user+capability) reclaims those units without a background worker.
 *
 * Set comfortably above the longest expected metered operation — the rate
 * limiters expect AI work to finish well inside a couple of minutes — so a
 * legitimately in-flight operation is never expired out from under itself.
 */
export const RESERVATION_TTL_MS = 10 * 60 * 1000;

/**
 * Cost-protection limits for the claim-aware CV-generation salvage pipeline.
 *
 * When a generated draft's ONLY defects are repairable, provenance-level ones
 * (e.g. a skills group whose excerpt does not contiguously match the CV), the
 * salvage pass keeps the supported content and drops/prunes the rest instead of
 * discarding the whole document and wasting the provider call. These limits keep
 * that from becoming a way to launder untrustworthy output: too many invalid
 * claims, or too high a defect ratio, rejects rather than repairs.
 *
 * - deterministicRepairEnabled: master switch for the deterministic salvage pass.
 * - maxCorrectionCalls: how many constrained AI-correction rounds are allowed
 *   (the deterministic-core phase uses 0 additional calls; reserved for the
 *   follow-up constrained-correction phase).
 * - maxRepairableClaims: absolute cap on defective claim slots that may be repaired.
 * - maxRepairableClaimRatio: defective/total claim ratio above which the draft is
 *   treated as generally untrustworthy and rejected outright.
 *
 * The ratio is set to one third after auditing the output structure: the common
 * repairable defect is a skills group whose comma-joined excerpt does not
 * contiguously match the CV, and a skills-heavy CV can legitimately carry several
 * such groups without being untrustworthy. Below a third of all claims defective
 * is treated as repairable; a third or more rejects.
 */
export const CV_GENERATION_REPAIR_POLICY = {
  deterministicRepairEnabled: true,
  maxCorrectionCalls: 1,
  maxRepairableClaims: 6,
  maxRepairableClaimRatio: 0.34,
} as const;

export const API_CONFIG = {
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || '',
    appKey: process.env.ADZUNA_APP_KEY || '',
    baseUrl: 'https://api.adzuna.com/v1/api/jobs/gb/search',
    histogramUrl: 'https://api.adzuna.com/v1/api/jobs/gb/histogram',
  },
  reed: {
    apiKey: process.env.REED_API_KEY || '',
    baseUrl: 'https://www.reed.co.uk/api/1.0/search',
  },
  jooble: {
    apiKey: process.env.JOOBLE_API_KEY || '',
    baseUrl: 'https://jooble.org/api',
  },
  gov: {
    sponsorRegistryPage: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
    fallbackCsvUrl: 'https://assets.publishing.service.gov.uk/media/6a1965a6916cd732dcdaacf0/2026-05-29_-_Worker_and_Temporary_Worker.csv',
  }
};
