'use client';

import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { PLANS } from '@/shared/constants/plans';
import { offerPresentationForPlan } from '@/shared/billing/config';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import type { StorageUsage } from '@/shared/services/storage-quota';

/**
 * Serialisable billing status derived server-side from the effective-access
 * resolver. The client never recomputes plan or status — it renders this, and it
 * never sees a raw provider status, customer id, subscription id or price id.
 */
export interface BillingStatusView {
  plan: 'FREE' | 'PRO';
  status:
    | 'FREE'
    | 'TRIALING'
    | 'ACTIVE'
    | 'PAST_DUE_GRACE'
    | 'CANCELLED_ACTIVE'
    | 'EXPIRED'
    | 'UNPAID'
    | 'INCOMPLETE';
  cancelAtPeriodEnd: boolean;
  /** ISO date the current paid access ends, when applicable. */
  accessEndsAt: string | null;
  /** ISO date the payment-failure grace window ends, when in grace. */
  graceEndsAt: string | null;
  /** Whether an upgrade checkout can be started (provider configured + upgrade exists). */
  checkoutAvailable: boolean;
  /** Whether the customer portal can be opened. */
  portalAvailable: boolean;
}

type BillingEntitlementKey =
  | 'ai_enhanced_ats_analysis'
  | 'job_match_analysis'
  | 'cv_regeneration'
  | 'additional_career_profiles'
  | 'stored_source_cvs'
  | 'stored_generated_cvs'
  | 'stored_analyses';

export type BillingEntitlements = Record<BillingEntitlementKey, CapabilityDecision>;

const STATUS_LABEL: Record<BillingStatusView['status'], string> = {
  FREE: 'Free plan',
  TRIALING: 'Trial active',
  ACTIVE: 'Active',
  PAST_DUE_GRACE: 'Payment overdue — access retained briefly',
  CANCELLED_ACTIVE: 'Cancelled — access until the period ends',
  EXPIRED: 'Access expired',
  UNPAID: 'Payment failed',
  INCOMPLETE: 'Checkout incomplete',
};

const PRO_OFFER = offerPresentationForPlan('PRO');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function UsageMeter({
  label,
  decision,
  showPeriod = false,
}: {
  label: string;
  decision: CapabilityDecision;
  showPeriod?: boolean;
}) {
  const used = decision.used;
  const limit = decision.limit;
  const unavailable = used === undefined || limit === undefined;
  const pct = unavailable ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const nearLimit = pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-700">{label}</p>
        <p className="text-xs tabular-nums text-neutral-500">
          {unavailable ? 'Not included' : `${used} / ${limit}`}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            unavailable ? 'bg-slate-200' : nearLimit ? 'bg-amber-500' : 'bg-accent-cyan'
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!unavailable && (
        <p className="mt-1.5 text-[11px] text-slate-500">
          {decision.remaining} remaining
          {showPeriod && decision.period ? ` · ${periodLabel(decision.period)}` : ''}
        </p>
      )}
    </div>
  );
}

function periodLabel(period: NonNullable<CapabilityDecision['period']>): string {
  if (period === 'month') return 'Resets monthly';
  if (period === 'week') return 'Resets weekly';
  if (period === 'day') return 'Resets daily';
  return 'Lifetime allowance';
}

/** A status-specific notice for warnings, cancellation, and payment grace. */
function StatusNotice({ billing }: { billing: BillingStatusView }) {
  const endDate = formatDate(billing.accessEndsAt);
  const graceDate = formatDate(billing.graceEndsAt);

  if (billing.status === 'PAST_DUE_GRACE') {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-xs leading-relaxed text-amber-800">
          We couldn&apos;t take your last payment. Your Pro features stay on{graceDate ? ` until ${graceDate}` : ' for a short grace period'}.
          Update your payment method to keep them.
        </p>
      </div>
    );
  }
  if (billing.status === 'CANCELLED_ACTIVE') {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <p className="text-xs leading-relaxed text-neutral-700">
          Your subscription is set to cancel. You keep Pro{endDate ? ` until ${endDate}` : ' until the period ends'}, then move to Free.
          Your data is always kept.
        </p>
      </div>
    );
  }
  if (billing.status === 'UNPAID' || billing.status === 'EXPIRED') {
    return (
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" />
        <p className="text-xs leading-relaxed text-neutral-700">
          Your Pro access has ended and you&apos;re on Free. Your data is preserved — upgrade again whenever you&apos;re ready.
        </p>
      </div>
    );
  }
  return null;
}

export default function BillingView({
  tier,
  storage,
  billing,
  entitlements,
}: {
  tier: string;
  storage: StorageUsage;
  billing: BillingStatusView;
  entitlements: BillingEntitlements;
}) {
  const [busy, setBusy] = useState<null | 'checkout' | 'portal'>(null);
  const [error, setError] = useState<string | null>(null);

  const accessEnds = formatDate(billing.accessEndsAt);
  const isPro = billing.plan === 'PRO';
  const currentPlan = PLANS.find((plan) => plan.id === tier) ?? PLANS[0];
  const dateLabel =
    billing.status === 'TRIALING'
      ? 'Trial ends'
      : billing.cancelAtPeriodEnd || billing.status === 'CANCELLED_ACTIVE'
        ? 'Paid through'
        : billing.status === 'ACTIVE'
          ? 'Renews'
          : 'Access ended';

  async function post(path: string, body?: Record<string, unknown>) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; code?: string; error?: string };
    return { res, data };
  }

  async function startCheckout() {
    if (!PRO_OFFER) return;
    setBusy('checkout');
    setError(null);
    try {
      const { res, data } = await post('/api/billing/checkout', { offerId: PRO_OFFER.offerId });
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      // Already subscribed — send them to the portal instead of erroring.
      if (data.code === 'ALREADY_SUBSCRIBED') {
        await openPortal();
        return;
      }
      setError(data.error ?? 'Checkout is not available right now.');
    } catch {
      setError('Checkout is not available right now.');
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal');
    setError(null);
    try {
      const { res, data } = await post('/api/billing/portal');
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? 'The billing portal is not available right now.');
    } catch {
      setError('The billing portal is not available right now.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div>
        <section aria-label="Current Plan" className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-base font-bold text-slate-900">Current Plan</h2>
              <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{currentPlan.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {currentPlan.price}{currentPlan.period} · {STATUS_LABEL[billing.status]}
              </p>
              {accessEnds && <p className="mt-2 text-xs text-slate-500">{dateLabel} {accessEnds}</p>}
            </div>
            <div className="w-full sm:w-48">
              {renderPlanAction({
                isPro,
                billing,
                busy,
                startCheckout,
                openPortal,
              })}
            </div>
          </div>
        </section>

        <StatusNotice billing={billing} />

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
        )}

        <section aria-label="Monthly Usage" className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-bold text-slate-900">Monthly Usage</h2>
          <p className="mt-1 text-xs text-slate-500">Usage from your current allowance period.</p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <UsageMeter
              label="AI analyses"
              decision={entitlements.ai_enhanced_ats_analysis}
              showPeriod
            />
            <UsageMeter
              label="Job Matches"
              decision={entitlements.job_match_analysis}
              showPeriod
            />
            <UsageMeter
              label="CV regenerations"
              decision={entitlements.cv_regeneration}
              showPeriod
            />
          </div>
        </section>

        <section aria-label="Account Limits" className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-bold text-slate-900">Account Limits</h2>
          <p className="mt-1 text-xs text-slate-500">Persistent resources stored on your account.</p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
            <UsageMeter label="Career Profiles" decision={entitlements.additional_career_profiles} />
            <UsageMeter label="Stored CVs" decision={entitlements.stored_source_cvs} />
            <UsageMeter label="Generated CVs" decision={entitlements.stored_generated_cvs} />
            <UsageMeter label="Analyses retained" decision={entitlements.stored_analyses} />
          </div>
        </section>

        <section aria-label="Storage" className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">Storage</h2>
            <p className="text-[11px] text-slate-400">{formatBytes(storage.bytesUsed)} archived</p>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            {storage.sourceRetentionDays === null
              ? 'Source CVs have no automatic expiry on your current plan.'
              : `Source CVs are retained for ${storage.sourceRetentionDays} days on your current plan.`}
          </p>
        </section>

        <section aria-label="Plan Comparison">
          <h2 className="text-base font-bold text-slate-900">Plan Comparison</h2>
          <p className="mt-1 text-xs text-slate-500">Compare the existing Free and Pro plans.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PLANS.map((t) => {
              const isCurrent = t.id === tier;
              return (
              <div
                key={t.id}
                className={cn(
                  'flex flex-col rounded-2xl border bg-white p-6',
                  isCurrent ? 'border-accent-cyan ring-1 ring-accent-cyan shadow-sm' : 'border-slate-200'
                )}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.name}</p>
                  {isCurrent && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-3 text-3xl font-black tracking-tight text-slate-900">
                  {t.price}
                  <span className="text-sm font-medium text-slate-400">{t.period}</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{t.tagline}</p>
                <ul className="mb-6 mt-5 flex flex-col gap-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-cyan" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

/** The current plan action, driven entirely by the existing billing status. */
function renderPlanAction({
  isPro,
  billing,
  busy,
  startCheckout,
  openPortal,
}: {
  isPro: boolean;
  billing: BillingStatusView;
  busy: null | 'checkout' | 'portal';
  startCheckout: () => void;
  openPortal: () => void;
}) {
  // Pro users manage their existing subscription in the provider portal.
  if (isPro) {
    if (billing.portalAvailable) {
      return (
        <button
          type="button"
          onClick={openPortal}
          disabled={busy !== null}
          className="w-full rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-60"
        >
          {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
        </button>
      );
    }
    return (
      <span className="block rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-center text-xs font-bold text-slate-700">
        Current plan
      </span>
    );
  }

  // Free or lapsed users can start the existing Pro checkout when available.
  if (!billing.checkoutAvailable) {
    return (
      <span className="block rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-bold text-slate-400">
        Upgrade unavailable
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={startCheckout}
      disabled={busy !== null}
      className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800 disabled:opacity-60"
    >
      {busy === 'checkout' ? 'Starting…' : 'Upgrade to Pro'}
    </button>
  );
}
