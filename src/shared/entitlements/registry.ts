/**
 * Commercial product policy lives here and nowhere else.
 * Limits are provisional until pricing work is complete.
 */
export const PRODUCT_CAPABILITIES = [
  'ats_analysis',
  'ai_enhanced_ats_analysis',
  'job_match_analysis',
  'view_full_ats_report',
  'view_full_job_match_report',
  'view_requirement_ledger',
  'view_rewrite_strategy',
  'view_eligibility_analysis',
  'profile_reconciliation',
  'tailored_cv_generation',
  'cv_regeneration',
  'download_generated_cv',
  'career_profile',
  'additional_career_profiles',
  'profile_evidence_storage',
  'human_evidence_capture',
  'approve_evidence_for_application',
  'reuse_evidence_across_applications',
  'application_history',
  'stored_generated_cvs',
  'stored_analyses',
  'source_file_retention',
  'advanced_tools',
  'supporting_statement_generation',
] as const;

export type ProductCapability = (typeof PRODUCT_CAPABILITIES)[number];
export const ENTITLEMENT_REQUIRED_EVENT = 'align:entitlement-required';
export const ENTITLEMENTS_REFRESH_EVENT = 'align:entitlements-refresh';
export type PlanId = 'FREE' | 'PRO';
export type EntitlementPeriod = 'lifetime' | 'day' | 'week' | 'month';

export type CapabilityEntitlement =
  | { mode: 'enabled' }
  | { mode: 'disabled'; reason?: string }
  | { mode: 'quota'; limit: number; period: EntitlementPeriod }
  | { mode: 'resource_limit'; limit: number }
  | { mode: 'partial'; accessLevel: string };

export type CapabilityDecisionReason =
  | 'allowed'
  | 'quota_available'
  | 'quota_exhausted'
  | 'plan_required'
  | 'resource_limit_reached'
  | 'feature_unavailable';

/** Provisional partial-report projection limits, centrally editable with plans. */
export const REPORT_ACCESS_LIMITS = {
  summaryCategories: 4,
  summaryKeywords: 5,
  summaryComplianceItems: 3,
  summaryRecommendations: 3,
  previewRequirements: 3,
  previewEvidencePerRequirement: 1,
} as const;

export interface CapabilityDecision {
  capability: ProductCapability;
  allowed: boolean;
  plan: PlanId;
  mode: CapabilityEntitlement['mode'];
  limit?: number;
  used?: number;
  remaining?: number;
  period?: EntitlementPeriod;
  accessLevel?: string;
  reason: CapabilityDecisionReason;
  upgradeTarget?: PlanId;
}

const enabled = (): CapabilityEntitlement => ({ mode: 'enabled' });
const disabled = (reason?: string): CapabilityEntitlement => ({ mode: 'disabled', reason });
const quota = (limit: number, period: EntitlementPeriod = 'month'): CapabilityEntitlement => ({ mode: 'quota', limit, period });
const resourceLimit = (limit: number): CapabilityEntitlement => ({ mode: 'resource_limit', limit });
const partial = (accessLevel: string): CapabilityEntitlement => ({ mode: 'partial', accessLevel });

/** PROVISIONAL DEVELOPMENT CONFIGURATION — not final public packaging. */
export const PLAN_ENTITLEMENTS = {
  FREE: {
    ats_analysis: enabled(),
    ai_enhanced_ats_analysis: quota(5),
    job_match_analysis: quota(5),
    view_full_ats_report: partial('summary'),
    view_full_job_match_report: partial('preview'),
    view_requirement_ledger: partial('limited'),
    view_rewrite_strategy: disabled('Full rewrite strategy requires Pro.'),
    view_eligibility_analysis: partial('summary'),
    profile_reconciliation: disabled('Profile reconciliation requires Pro.'),
    tailored_cv_generation: enabled(),
    cv_regeneration: quota(1),
    download_generated_cv: enabled(),
    career_profile: enabled(),
    additional_career_profiles: resourceLimit(1),
    profile_evidence_storage: resourceLimit(25),
    human_evidence_capture: quota(5),
    approve_evidence_for_application: enabled(),
    reuse_evidence_across_applications: partial('limited'),
    application_history: partial('recent'),
    stored_generated_cvs: resourceLimit(3),
    stored_analyses: resourceLimit(10),
    source_file_retention: partial('30_days'),
    advanced_tools: disabled('Advanced tools require Pro.'),
    supporting_statement_generation: disabled('Supporting statements are not available yet.'),
  },
  PRO: {
    ats_analysis: enabled(),
    ai_enhanced_ats_analysis: quota(100),
    job_match_analysis: quota(100),
    view_full_ats_report: partial('full'),
    view_full_job_match_report: partial('full'),
    view_requirement_ledger: partial('full'),
    view_rewrite_strategy: enabled(),
    view_eligibility_analysis: partial('full'),
    profile_reconciliation: quota(50),
    tailored_cv_generation: enabled(),
    cv_regeneration: quota(50),
    download_generated_cv: enabled(),
    career_profile: enabled(),
    additional_career_profiles: resourceLimit(3),
    profile_evidence_storage: resourceLimit(500),
    human_evidence_capture: quota(100),
    approve_evidence_for_application: enabled(),
    reuse_evidence_across_applications: enabled(),
    application_history: partial('full'),
    stored_generated_cvs: resourceLimit(50),
    stored_analyses: enabled(),
    source_file_retention: partial('365_days'),
    advanced_tools: enabled(),
    supporting_statement_generation: disabled('Supporting statements are not available yet.'),
  },
} as const satisfies Record<PlanId, Record<ProductCapability, CapabilityEntitlement>>;

export function isProductCapability(value: unknown): value is ProductCapability {
  return typeof value === 'string' && (PRODUCT_CAPABILITIES as readonly string[]).includes(value);
}

export function normalizePlanId(value: string | null | undefined): PlanId {
  return value?.toUpperCase() === 'PRO' ? 'PRO' : 'FREE';
}

export function getPlanEntitlement(plan: PlanId, capability: ProductCapability): CapabilityEntitlement {
  return PLAN_ENTITLEMENTS[plan][capability];
}
