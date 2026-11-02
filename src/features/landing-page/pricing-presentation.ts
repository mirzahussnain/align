import { planPresentations } from '@/shared/billing/config';
import {
  getPlanEntitlement,
  type CapabilityEntitlement,
  type PlanId,
  type ProductCapability,
} from '@/shared/entitlements/registry';

export interface PublicPricingPlan {
  id: Lowercase<PlanId>;
  name: string;
  price: string;
  period: string;
  tagline: string;
  benefits: string[];
  cta: string;
  highlight?: boolean;
}

export interface PublicPricingRow {
  capability: ProductCapability;
  label: string;
  free: string;
  pro: string;
}

export interface PublicPricingGroup {
  title: string;
  rows: PublicPricingRow[];
}

type RowDefinition = {
  capability: ProductCapability;
  label: string;
  format?: (entitlement: CapabilityEntitlement) => string;
};

const periodLabel = { day: 'day', week: 'week', month: 'month', lifetime: 'lifetime' } as const;

function standardValue(entitlement: CapabilityEntitlement): string {
  if (entitlement.mode === 'disabled') return 'Not included';
  if (entitlement.mode === 'enabled') return 'Included';
  if (entitlement.mode === 'quota') return `${entitlement.limit} / ${periodLabel[entitlement.period]}`;
  if (entitlement.mode === 'resource_limit') return String(entitlement.limit);
  return entitlement.accessLevel;
}

function unlimitedValue(entitlement: CapabilityEntitlement): string {
  return entitlement.mode === 'enabled' ? 'Unlimited' : standardValue(entitlement);
}

function accessValue(labels: Record<string, string>) {
  return (entitlement: CapabilityEntitlement): string => {
    if (entitlement.mode === 'disabled') return 'Not included';
    if (entitlement.mode === 'enabled') return 'Included';
    if (entitlement.mode === 'partial') return labels[entitlement.accessLevel] ?? entitlement.accessLevel;
    return standardValue(entitlement);
  };
}

function retentionValue(entitlement: CapabilityEntitlement): string {
  if (entitlement.mode !== 'partial') return standardValue(entitlement);
  const days = Number.parseInt(entitlement.accessLevel, 10);
  return Number.isNaN(days) ? entitlement.accessLevel : `${days} days`;
}

function row(definition: RowDefinition): PublicPricingRow {
  const format = definition.format ?? standardValue;
  return {
    capability: definition.capability,
    label: definition.label,
    free: format(getPlanEntitlement('FREE', definition.capability)),
    pro: format(getPlanEntitlement('PRO', definition.capability)),
  };
}

const GROUP_DEFINITIONS: Array<{ title: string; rows: RowDefinition[] }> = [
  {
    title: 'CV Analysis & Tailoring',
    rows: [
      { capability: 'ats_analysis', label: 'Basic ATS checks', format: unlimitedValue },
      { capability: 'ai_enhanced_ats_analysis', label: 'AI-powered CV reviews' },
      { capability: 'view_full_ats_report', label: 'ATS report access', format: accessValue({ summary: 'Summary', full: 'Full report' }) },
      { capability: 'view_eligibility_analysis', label: 'Eligibility insights', format: accessValue({ summary: 'Summary', full: 'Full insights' }) },
      { capability: 'view_requirement_ledger', label: 'Requirement and evidence breakdown', format: accessValue({ limited: 'Limited', full: 'Full' }) },
      { capability: 'view_rewrite_strategy', label: 'CV improvement strategy' },
      { capability: 'cv_regeneration', label: 'Tailored CV generations' },
      { capability: 'download_generated_cv', label: 'Download generated CVs' },
      { capability: 'profile_reconciliation', label: 'Career profile updates from analyses' },
      { capability: 'cv_import_reconciliation', label: 'Career profile updates from imported CVs' },
    ],
  },
  {
    title: 'Job Matching',
    rows: [
      { capability: 'job_match_analysis', label: 'AI Job Matches' },
      { capability: 'view_full_job_match_report', label: 'Job Match report access', format: accessValue({ preview: 'Preview', full: 'Full report' }) },
      { capability: 'reuse_evidence_across_applications', label: 'Reuse saved evidence across applications', format: accessValue({ limited: 'Limited', full: 'Included' }) },
      { capability: 'application_history', label: 'Application history', format: accessValue({ recent: 'Recent applications', full: 'Full history' }) },
    ],
  },
  {
    title: 'Career Profiles & Storage',
    rows: [
      { capability: 'additional_career_profiles', label: 'Career profiles' },
      { capability: 'stored_source_cvs', label: 'Stored source CVs' },
      { capability: 'stored_generated_cvs', label: 'Stored tailored CVs' },
      { capability: 'stored_analyses', label: 'Stored analyses' },
      { capability: 'saved_jobs', label: 'Saved jobs' },
      { capability: 'profile_evidence_storage', label: 'Reusable evidence items' },
      { capability: 'source_file_retention', label: 'Uploaded CV retention', format: retentionValue },
    ],
  },
  {
    title: 'Other Limits',
    rows: [
      { capability: 'human_evidence_capture', label: 'Guided evidence captures' },
      { capability: 'advanced_tools', label: 'Advanced tools' },
    ],
  },
];

export const PUBLIC_PRICING_GROUPS: PublicPricingGroup[] = GROUP_DEFINITIONS.map((group) => ({
  title: group.title,
  rows: group.rows.map(row),
}));

function quotaLimit(plan: PlanId, capability: ProductCapability): number {
  const entitlement = getPlanEntitlement(plan, capability);
  if (entitlement.mode !== 'quota') throw new Error(`${capability} must be a quota`);
  return entitlement.limit;
}

function resourceLimit(plan: PlanId, capability: ProductCapability): number {
  const entitlement = getPlanEntitlement(plan, capability);
  if (entitlement.mode !== 'resource_limit') throw new Error(`${capability} must be a resource limit`);
  return entitlement.limit;
}

export const PUBLIC_PRICING_PLANS: PublicPricingPlan[] = planPresentations().map((plan) => {
  const id = plan.id.toLowerCase() as Lowercase<PlanId>;
  const isPro = plan.id === 'PRO';
  const reviews = quotaLimit(plan.id, 'ai_enhanced_ats_analysis');
  const tailoredCvs = quotaLimit(plan.id, 'cv_regeneration');
  const savedJobs = resourceLimit(plan.id, 'saved_jobs');

  return {
    id,
    name: plan.displayName,
    price: plan.priceLabel,
    period: plan.periodLabel || '/forever',
    tagline: isPro ? 'Apply smarter across more roles.' : "Explore your CV's potential.",
    benefits: isPro
      ? [
          'Everything in Free',
          `${quotaLimit(plan.id, 'job_match_analysis')} AI Job Matches / month`,
          `${reviews} AI-powered CV reviews / month`,
          `${tailoredCvs} tailored CV generations / month`,
          `Save up to ${savedJobs} jobs`,
        ]
      : [
          'Unlimited basic ATS checks',
          `${reviews} AI-powered CV review / month`,
          `${tailoredCvs} tailored CV generation / month`,
          `Save up to ${savedJobs} jobs`,
        ],
    cta: isPro ? 'Upgrade to Pro' : 'Get started free',
    highlight: isPro,
  };
});
