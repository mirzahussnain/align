'use client';

import { useEntitlements } from '@/shared/components/entitlements/EntitlementProvider';

/**
 * Usage for the reusable-evidence allowance.
 *
 * Shown ONLY where the user is genuinely adding reusable evidence. Ordinary
 * Career Profile sections — experience, education, projects, skills,
 * certifications, training, licences, registrations, languages, volunteering —
 * must never carry this or any other plan messaging: those records describe the
 * user's career history and do not consume a commercial allowance.
 */
export default function ReusableEvidenceUsage() {
  const { decisionFor } = useEntitlements();
  const decision = decisionFor('profile_evidence_storage');
  if (decision?.limit === undefined) return null;

  return (
    <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-xs font-semibold text-neutral-900">Reusable evidence</p>
      <p className="mt-0.5 text-xs text-neutral-500">
        {decision.used ?? 0} of {decision.limit} records used
      </p>
      {!decision.allowed && (
        <p className="mt-2 text-xs text-neutral-600">
          You’ve reached your reusable evidence limit. You can edit or delete existing evidence, or
          upgrade to add more.
        </p>
      )}
    </div>
  );
}
