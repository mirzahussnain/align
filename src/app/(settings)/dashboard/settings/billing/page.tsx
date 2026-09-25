import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import BillingView from '@/features/dashboard/components/views/BillingView';
import { resolveBillingAccess } from '@/shared/billing/access';
import { getEntitlementSnapshot } from '@/shared/entitlements/server';
import { auth } from '@/shared/lib/auth';
import { getStorageUsage } from '@/shared/services/storage-quota';

export default async function BillingSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const billing = await resolveBillingAccess(session.user.id);
  const [storage, entitlementSnapshot] = await Promise.all([
    getStorageUsage(session.user.id, billing.effectivePlan),
    getEntitlementSnapshot(session.user.id),
  ]);

  return (
    <BillingView
      tier={billing.effectivePlan.toLowerCase()}
      storage={storage}
      entitlements={{
        ai_enhanced_ats_analysis: entitlementSnapshot.capabilities.ai_enhanced_ats_analysis,
        job_match_analysis: entitlementSnapshot.capabilities.job_match_analysis,
        cv_regeneration: entitlementSnapshot.capabilities.cv_regeneration,
        profile_reconciliation: entitlementSnapshot.capabilities.profile_reconciliation,
        cv_import_reconciliation: entitlementSnapshot.capabilities.cv_import_reconciliation,
        human_evidence_capture: entitlementSnapshot.capabilities.human_evidence_capture,
        additional_career_profiles: entitlementSnapshot.capabilities.additional_career_profiles,
        stored_source_cvs: entitlementSnapshot.capabilities.stored_source_cvs,
        stored_generated_cvs: entitlementSnapshot.capabilities.stored_generated_cvs,
        stored_analyses: entitlementSnapshot.capabilities.stored_analyses,
        profile_evidence_storage: entitlementSnapshot.capabilities.profile_evidence_storage,
        saved_jobs: entitlementSnapshot.capabilities.saved_jobs,
      }}
      billing={{
        plan: billing.effectivePlan,
        status: billing.status,
        cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
        accessEndsAt: billing.accessEndsAt?.toISOString() ?? null,
        graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
        checkoutAvailable: billing.checkoutAvailable,
        portalAvailable: billing.portalAvailable,
      }}
    />
  );
}
