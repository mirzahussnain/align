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
