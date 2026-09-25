import { planPresentations } from '@/shared/billing/config';
import {
  getPlanEntitlement,
  type CapabilityEntitlement,
  type PlanId,
  type ProductCapability,
} from '@/shared/entitlements/registry';

export interface PlanSections {
  core: string[];
  monthly: string[];
  lifetime: string[];
  account: string[];
}

export interface Plan {
  id: Lowercase<PlanId>;
  name: string;
  price: string;
  period: string;
  tagline: string;
  sections: PlanSections;
  highlight?: boolean;
}

type PresentationItem = {
  capability: ProductCapability;
  singular: string;
  plural: string;
};

/**
 * Labels and ordering are presentation concerns. Limits, periods and access
 * remain in the entitlement registry and are read when the plan view is built.
 */
const PLAN_PRESENTATION = {
  core: [
    { capability: 'ats_analysis', singular: 'rule-based ATS analysis', plural: 'rule-based ATS analyses' },
  ],
  allowances: [
    { capability: 'ai_enhanced_ats_analysis', singular: 'AI-enhanced ATS analysis', plural: 'AI-enhanced ATS analyses' },
    { capability: 'job_match_analysis', singular: 'Job Match', plural: 'Job Matches' },
    { capability: 'cv_regeneration', singular: 'CV regeneration', plural: 'CV regenerations' },
    { capability: 'profile_reconciliation', singular: 'profile reconciliation', plural: 'profile reconciliations' },
    { capability: 'cv_import_reconciliation', singular: 'CV-import reconciliation', plural: 'CV-import reconciliations' },
    { capability: 'human_evidence_capture', singular: 'human evidence capture', plural: 'human evidence captures' },
  ],
  account: [
    { capability: 'additional_career_profiles', singular: 'Career Profile', plural: 'Career Profiles' },
    { capability: 'stored_source_cvs', singular: 'stored source CV', plural: 'stored source CVs' },
    { capability: 'stored_generated_cvs', singular: 'stored generated CV', plural: 'stored generated CVs' },
    { capability: 'stored_analyses', singular: 'stored analysis', plural: 'stored analyses' },
    { capability: 'profile_evidence_storage', singular: 'reusable evidence item', plural: 'reusable evidence items' },
    { capability: 'saved_jobs', singular: 'saved job', plural: 'saved jobs' },
  ],
} as const satisfies {
  core: readonly PresentationItem[];
  allowances: readonly PresentationItem[];
  account: readonly PresentationItem[];
};

function quantityLabel(limit: number, item: PresentationItem): string {
  return `${limit} ${limit === 1 ? item.singular : item.plural}`;
}

function allowanceLabel(entitlement: CapabilityEntitlement, item: PresentationItem): string {
  if (entitlement.mode === 'disabled') return `No ${item.plural} included`;
  if (entitlement.mode !== 'quota') return `Unlimited ${item.plural}`;
  return `${quantityLabel(entitlement.limit, item)} / ${entitlement.period}`;
}

function resourceLabel(entitlement: CapabilityEntitlement, item: PresentationItem): string {
  if (entitlement.mode !== 'resource_limit') {
    throw new Error(`${item.capability} must be a resource limit to appear in account limits.`);
  }
  return quantityLabel(entitlement.limit, item);
}

function retentionLabel(plan: PlanId): string {
  const entitlement = getPlanEntitlement(plan, 'source_file_retention');
  if (entitlement.mode !== 'partial') {
    throw new Error('source_file_retention must expose a duration access level.');
  }
  const days = Number.parseInt(entitlement.accessLevel, 10);
  return `${days}-day uploaded-file retention`;
}

function sectionsFor(plan: PlanId): PlanSections {
  const core = PLAN_PRESENTATION.core.map((item) => {
    const entitlement = getPlanEntitlement(plan, item.capability);
    return entitlement.mode === 'enabled'
      ? `Unlimited ${item.singular}`
      : allowanceLabel(entitlement, item);
  });

  const monthly: string[] = [];
  const lifetime: string[] = [];
  for (const item of PLAN_PRESENTATION.allowances) {
    const entitlement = getPlanEntitlement(plan, item.capability);
    const label = allowanceLabel(entitlement, item);
    if (entitlement.mode === 'quota' && entitlement.period === 'lifetime') {
      lifetime.push(label);
    } else {
      monthly.push(label);
    }
  }

  const account = PLAN_PRESENTATION.account.map((item) =>
    resourceLabel(getPlanEntitlement(plan, item.capability), item)
  );
  account.push(retentionLabel(plan));

  return { core, monthly, lifetime, account };
}

/** Public plan presentation, derived from billing offers and entitlements. */
export const PLANS: Plan[] = planPresentations().map((plan) => ({
  id: plan.id.toLowerCase() as Lowercase<PlanId>,
  name: plan.displayName,
  price: plan.priceLabel,
  period: plan.periodLabel,
  tagline: plan.description,
  sections: sectionsFor(plan.id),
  highlight: plan.id === 'PRO',
}));
