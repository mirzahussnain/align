'use client';

import { useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/utils/cn';
import { PLANS } from '@/shared/constants/plans';
import { offerPresentationForPlan } from '@/shared/billing/config';
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

/** A used/limit bar. An unlimited allowance renders as a full-width muted track. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const unlimited = limit === null;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-neutral-700">{label}</p>
        <p className="text-xs tabular-nums text-neutral-500">
          {used}
          {unlimited ? ' / Unlimited' : ` / ${limit}`}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            unlimited ? 'w-full bg-slate-200' : nearLimit ? 'bg-amber-500' : 'bg-accent-cyan'
          )}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** A status-specific notice above the plan cards (warnings, cancellation, grace). */
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
}: {
  tier: string;
  storage: StorageUsage;
  billing: BillingStatusView;
}) {
  const [busy, setBusy] = useState<null | 'checkout' | 'portal'>(null);
  const [error, setError] = useState<string | null>(null);

  const accessEnds = formatDate(billing.accessEndsAt);
  const showAccessEnd = accessEnds != null && (billing.cancelAtPeriodEnd || billing.status !== 'ACTIVE');
  const isPro = billing.plan === 'PRO';

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
        <div className="mb-5 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-600">
              You&apos;re on the <span className="font-bold capitalize">{tier}</span> plan
              {' — '}
              <span className="font-semibold text-neutral-800">{STATUS_LABEL[billing.status]}</span>.
            </p>
            {showAccessEnd && accessEnds && (
              <p className="text-[11px] text-neutral-500">
                {billing.cancelAtPeriodEnd ? 'Access ends' : 'Ended'} {accessEnds}
              </p>
            )}
          </div>
        </div>

        <StatusNotice billing={billing} />

        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
        )}


        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold text-slate-900">Storage</h2>
            <p className="text-[11px] text-slate-400">{formatBytes(storage.bytesUsed)} archived</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <UsageMeter label="Source CVs" used={storage.sourceCvs} limit={storage.maxSourceCvs} />
            <UsageMeter label="Generated CVs" used={storage.generatedCvs} limit={storage.maxGeneratedCvs} />
            <UsageMeter label="Analyses kept" used={storage.storedAnalyses} limit={storage.maxStoredAnalyses} />
          </div>

          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            {storage.sourceRetentionDays === null
              ? 'Your uploaded CV files are kept indefinitely.'
              : `Uploaded CV files are kept for ${storage.sourceRetentionDays} days, then removed. Your analysis results and scores are always kept.`}{' '}
            Result metadata remains in history after an original source file expires.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((t) => {
            const isCurrent = t.id === tier;
            const isProCard = t.id === 'pro';
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
                <div className="mt-auto">{renderCta({ isCurrent, isProCard, isPro, billing, busy, startCheckout, openPortal })}</div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** The single call-to-action for a plan card, driven entirely by billing status. */
function renderCta({
  isCurrent,
  isProCard,
  isPro,
  billing,
  busy,
  startCheckout,
  openPortal,
}: {
  isCurrent: boolean;
  isProCard: boolean;
  isPro: boolean;
  billing: BillingStatusView;
  busy: null | 'checkout' | 'portal';
  startCheckout: () => void;
  openPortal: () => void;
}) {
  // The Free card, or the current plan, never offers an action here.
  if (!isProCard) {
    return (
      <span className="block rounded-xl border border-slate-200 px-4 py-2 text-center text-xs font-bold text-slate-400">
        {isCurrent ? 'Current plan' : 'Free forever'}
      </span>
    );
  }

  // Pro card while already on Pro → manage in the portal (or a plain marker).
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

  // Free/lapsed user viewing the Pro card → upgrade, if checkout is available.
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
