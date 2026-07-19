// What each subscription tier is actually allowed to do.
//
// Before this module, tier limits existed only as marketing copy in
// constants/plans.ts — nothing in the app enforced them. Every gate (profile
// count, stored CVs, stored analyses, source-file retention, AI reasoning)
// resolves through here so the ladder can never drift between what the pricing
// page promises and what the server permits.

export type Tier = 'free' | 'pro' | 'premium';

/**
 * No payment provider is wired up yet, so nobody can actually upgrade. Until
 * that ships, every account is granted `PREVIEW_TIER` regardless of what is
 * stored on the user row — this is what makes the nominally-Pro features free
 * for now. Flip this to `true` on the day billing goes live and the stored
 * `subscriptionTier` starts being honoured; no other code has to change.
 */
export const BILLING_ENABLED = false;

/** Tier everyone is treated as while `BILLING_ENABLED` is false. */
const PREVIEW_TIER: Tier = 'pro';

export interface Entitlements {
  /** The tier actually being enforced (the preview tier while billing is off). */
  tier: Tier;
  /** Tier stored on the user row — what they'd have once billing is live. */
  billedTier: Tier;
  /** Career-track profiles they may hold. The product ceiling is 5. */
  maxProfiles: number;
  /** Generated CVs retained. Oldest beyond the cap are pruned automatically. */
  maxStoredCvs: number;
  /** Analyses retained. `Infinity` on paid tiers. */
  maxStoredAnalyses: number;
  /**
   * How long an archived source upload is kept before it becomes eligible for
   * pruning. `null` keeps it indefinitely. Only the R2 object expires — the
   * Analysis row and its scores are always retained.
   */
  sourceRetentionDays: number | null;
  /** Profile-vs-CV reconciliation during a job-match rewrite. */
  profileReasoning: boolean;
  /**
   * Per-calendar-month caps on AI work, enforced by services/usage-meter.ts.
   * `null` means unmetered on this tier.
   *
   * Rule-based ATS scoring is deliberately absent: it costs nothing to run and
   * is uncapped on every tier, which is the free tier's actual selling point.
   */
  monthlyLimits: {
    aiAnalyses: number | null;
    cvGenerations: number | null;
    profileReasoning: number | null;
  };
}

const TIERS: Record<Tier, Omit<Entitlements, 'tier' | 'billedTier'>> = {
  free: {
    maxProfiles: 1,
    maxStoredCvs: 3,
    maxStoredAnalyses: 10,
    sourceRetentionDays: 30,
    profileReasoning: false,
    monthlyLimits: { aiAnalyses: 5, cvGenerations: 1, profileReasoning: 0 },
  },
  pro: {
    maxProfiles: 3,
    maxStoredCvs: 50,
    maxStoredAnalyses: Infinity,
    sourceRetentionDays: 365,
    profileReasoning: true,
    monthlyLimits: { aiAnalyses: 100, cvGenerations: 50, profileReasoning: 50 },
  },
  premium: {
    maxProfiles: 5,
    maxStoredCvs: 250,
    maxStoredAnalyses: Infinity,
    sourceRetentionDays: null,
    profileReasoning: true,
    monthlyLimits: { aiAnalyses: null, cvGenerations: null, profileReasoning: null },
  },
};

/** Hard ceiling on profiles across every tier, per the product decision. */
export const MAX_PROFILES_CEILING = 5;

function normaliseTier(value: string | null | undefined): Tier {
  return value === 'pro' || value === 'premium' ? value : 'free';
}

/**
 * Resolve what a user may do. Pass `user.subscriptionTier` straight in — an
 * unknown or null value degrades to `free` rather than throwing.
 */
export function entitlementsFor(subscriptionTier: string | null | undefined): Entitlements {
  const billedTier = normaliseTier(subscriptionTier);
  const tier = BILLING_ENABLED ? billedTier : PREVIEW_TIER;
  return { tier, billedTier, ...TIERS[tier] };
}

/** Limits as shown on the pricing page, independent of who is asking. */
export function limitsForTier(tier: Tier): Omit<Entitlements, 'tier' | 'billedTier'> {
  return TIERS[tier];
}

/** `sourceExpiresAt` for a file archived now, or null when kept indefinitely. */
export function sourceExpiryFrom(entitlements: Entitlements, now = new Date()): Date | null {
  if (entitlements.sourceRetentionDays === null) return null;
  return new Date(now.getTime() + entitlements.sourceRetentionDays * 24 * 60 * 60 * 1000);
}
