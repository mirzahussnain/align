// Subscription tiers — the single source of truth for both the dashboard's
// Plan & billing tab and the public pricing section, so the two can never drift.
//
// Quantified limits are DERIVED from entitlements.ts — the same values the
// server enforces — so the page cannot advertise a number the code ignores.

import { limitsForTier, type Tier } from '@/shared/lib/entitlements';

export interface Plan {
  id: Tier;
  name: string;
  /** Monthly price, already formatted for display. */
  price: string;
  period: string;
  /** One line on who the tier is for, shown under the name on the pricing page. */
  tagline: string;
  features: string[];
  /** Marks the tier called out as the default recommendation. */
  highlight?: boolean;
}

/**
 * Build the quantified feature lines straight from the limits the server
 * actually enforces (entitlements.ts), so the pricing page can never promise a
 * number the code doesn't honour. Only the qualitative selling points below are
 * hand-written.
 *
 * The monthly allowances below are safe to advertise because services/usage-meter.ts
 * now counts them against `usage_counter` and refuses the request when they run
 * out. Before that table existed these lines were removed from this file
 * precisely because nothing enforced them — keep that rule: no number appears
 * here that the server does not check.
 */
function enforcedLimits(tier: Tier): string[] {
  const l = limitsForTier(tier);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // Separate plural/singular forms rather than suffixing an "s": the free tier's
  // allowance of 1 otherwise reads "1 tailored CV generations / month".
  const permonth = (n: number | null, one: string, many: string) =>
    n === null ? `Unlimited ${many}` : `${n} ${n === 1 ? one : many} / month`;

  return [
    permonth(l.monthlyLimits.aiAnalyses, 'AI analysis', 'AI analyses'),
    permonth(l.monthlyLimits.cvGenerations, 'tailored CV generation', 'tailored CV generations'),
    `${plural(l.maxProfiles, 'career profile')}${l.maxProfiles > 1 ? ' (e.g. tech, warehouse, admin)' : ''}`,
    `${l.maxStoredCvs} generated CVs kept`,
    Number.isFinite(l.maxStoredAnalyses)
      ? `Last ${l.maxStoredAnalyses} analyses kept`
      : 'Unlimited analysis history',
    l.sourceRetentionDays === null
      ? 'Uploaded files kept indefinitely'
      : `Uploaded files kept ${l.sourceRetentionDays === 365 ? '12 months' : `${l.sourceRetentionDays} days`}`,
    l.profileReasoning
      ? `Profile-vs-CV reasoning on job matches${
          l.monthlyLimits.profileReasoning === null
            ? ''
            : ` (${l.monthlyLimits.profileReasoning} / month)`
        }`
      : 'Profile-vs-CV reasoning not included',
  ];
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: '£0',
    period: '',
    tagline: 'Check where your CV stands before you commit.',
    features: [
      'Unlimited rule-based UK ATS scoring',
      'AI CV analysis and job matching',
      'UK visa sponsor lookup & job board',
      ...enforcedLimits('free'),
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '£12',
    period: '/mo',
    tagline: 'For an active job search across multiple roles.',
    highlight: true,
    features: [
      'Everything in Free',
      'Tailored CV generation from any job match',
      'Regenerate CVs from past matches',
      'Score trends across your full history',
      ...enforcedLimits('pro'),
    ],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '£24',
    period: '/mo',
    tagline: 'For high-volume applications and career switches.',
    features: [
      'Everything in Pro',
      // Removed: "All four CV templates". Nothing gates the template picker —
      // every tier already gets all four, so listing it here sold something
      // buyers already had. "Multiple tailored variants per job" and "AI
      // cover-letter drafts" are unbuilt and stay out until they ship, for the
      // same reason the monthly allowances waited for the usage counter.
      'Priority AI queue and support',
      ...enforcedLimits('premium'),
    ],
  },
];
