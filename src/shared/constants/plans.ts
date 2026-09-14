import { limitsForTier, type Tier } from '@/shared/lib/entitlements';
import { offerPresentationForPlan } from '@/shared/billing/config';

export interface Plan {
  id: Tier;
  name: string;
  /** Price label; sourced from the central billing configuration (§15). */
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

/** Pro Monthly price/period, read from the one authoritative billing config. */
const proOffer = offerPresentationForPlan('PRO');

function enforcedLimits(tier: Tier): string[] {
  const limits = limitsForTier(tier);
  const perMonth = (value: number | null, one: string, many: string) =>
    value === null ? `Unlimited ${many}` : `${value} ${value === 1 ? one : many} / month`;
  return [
    perMonth(limits.monthlyLimits.aiAnalyses, 'AI analysis', 'AI analyses'),
    perMonth(limits.monthlyLimits.cvGenerations, 'tailored CV generation', 'tailored CV generations'),
    `${limits.maxProfiles} career profile${limits.maxProfiles === 1 ? '' : 's'}`,
    `${limits.maxStoredCvs} generated CVs kept`,
    Number.isFinite(limits.maxStoredAnalyses)
      ? `Last ${limits.maxStoredAnalyses} analyses kept`
      : 'Unlimited analysis history',
    limits.sourceRetentionDays === null
      ? 'Uploaded files kept indefinitely'
      : `Uploaded files kept ${limits.sourceRetentionDays} days`,
    limits.profileReasoning ? 'Profile-vs-CV reasoning included' : 'Profile-vs-CV reasoning not included',
  ];
}

/** Public pricing comes from the central billing configuration, never a literal. */
export const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'Free',
    period: '',
    tagline: 'Check where your CV stands before you commit.',
    features: [
      'Unlimited rule-based UK ATS scoring',
      'Limited AI CV analysis and job matching',
      'UK visa sponsor lookup & job board',
      ...enforcedLimits('free'),
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: proOffer?.priceLabel ?? 'Free',
    period: proOffer?.periodLabel ?? '',
    tagline: 'For an active job search across multiple roles.',
    highlight: true,
    features: [
      'Everything in Free',
      'Full reports and requirement ledgers',
      'Tailored CV regeneration from job matches',
      'Reusable Career Profile evidence',
      ...enforcedLimits('pro'),
    ],
  },
];
