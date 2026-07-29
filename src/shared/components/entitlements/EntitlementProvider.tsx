'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import type { EntitlementSnapshot } from '@/shared/entitlements/server';
import {
  ENTITLEMENT_REQUIRED_EVENT,
  ENTITLEMENTS_REFRESH_EVENT,
  isProductCapability,
  type CapabilityDecision,
  type ProductCapability,
} from '@/shared/entitlements/registry';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import { offerPresentationForPlan } from '@/shared/billing/config';

/** Pro Monthly price, read from the one authoritative billing configuration. */
const PRO_OFFER = offerPresentationForPlan('PRO');

export interface UpgradeModalContext {
  capability: ProductCapability;
  decision: CapabilityDecision;
  source: 'analysis' | 'report' | 'generation' | 'evidence' | 'profile' | 'advanced_tool' | 'other';
}

interface EntitlementContextValue {
  snapshot: EntitlementSnapshot;
  decisionFor(capability: ProductCapability): CapabilityDecision;
  openUpgrade(context: UpgradeModalContext): void;
  refresh(): Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

const HEADLINES: Partial<Record<ProductCapability, string>> = {
  view_full_ats_report: 'Unlock the full ATS report',
  view_full_job_match_report: 'Unlock the full requirement report',
  view_requirement_ledger: 'Unlock the full requirement report',
  job_match_analysis: 'Unlock AI Job Match Analysis',
  cv_regeneration: 'Generate a truthful tailored CV',
  human_evidence_capture: 'Add and reuse verified Career Profile evidence',
  approve_evidence_for_application: 'Approve more evidence for this application',
  reuse_evidence_across_applications: 'Add and reuse verified Career Profile evidence',
  additional_career_profiles: 'Create another Career Profile',
  advanced_tools: 'Access advanced application intelligence',
};

function UpgradeModal({ context, onClose }: { context: UpgradeModalContext; onClose(): void }) {
  const setTab = useDashboardStore((state) => state.setTab);
  const decision = context.decision;
  const detail =
    decision.reason === 'quota_exhausted'
      ? `You have used ${decision.used ?? decision.limit} of ${decision.limit} this ${decision.period ?? 'period'}.`
      : decision.reason === 'resource_limit_reached'
        ? `Your current plan includes ${decision.limit} ${decision.limit === 1 ? 'item' : 'items'}.`
        : 'This capability is not included in your current plan.';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="Close upgrade dialog" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative z-10 w-full max-w-md rounded-3xl border border-purple-100 bg-white p-6 shadow-2xl"
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
          <X className="h-4 w-4" />
        </button>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-accent-purple">
          <Sparkles className="h-5 w-5" />
        </span>
        <h2 id="upgrade-title" className="mt-4 text-xl font-black text-neutral-900">
          {HEADLINES[context.capability] ?? 'Unlock this Align capability'}
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">{detail}</p>
        {decision.remaining !== undefined && decision.remaining > 0 && (
          <p className="mt-2 text-xs font-semibold text-accent-purple">{decision.remaining} remaining</p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl bg-neutral-50 p-3">
            <p className="font-bold text-neutral-900">Free</p>
            <p className="mt-1 text-neutral-500">Core ATS checks and limited AI usage</p>
          </div>
          <div className="rounded-2xl bg-purple-50 p-3">
            <p className="flex items-baseline justify-between font-bold text-accent-purple">
              Pro
              {PRO_OFFER && (
                <span className="text-[11px] font-semibold text-accent-purple">
                  {PRO_OFFER.priceLabel}
                  <span className="text-neutral-400">{PRO_OFFER.periodLabel}</span>
                </span>
              )}
            </p>
            <p className="mt-1 text-neutral-600">Full reports, higher limits and advanced tools</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setTab('billing');
            onClose();
          }}
          className="mt-5 w-full rounded-full bg-accent-purple px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-purple/90"
        >
          View plan options
        </button>
      </section>
    </div>
  );
}

export function EntitlementProvider({ initialSnapshot, children }: { initialSnapshot: EntitlementSnapshot; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [modal, setModal] = useState<UpgradeModalContext | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/entitlements', { cache: 'no-store' });
    if (response.ok) setSnapshot((await response.json()) as EntitlementSnapshot);
  }, []);
  useEffect(() => {
    const required = (event: Event) => {
      const detail = (event as CustomEvent<{ capability?: unknown; source?: UpgradeModalContext['source'] }>).detail;
      if (!isProductCapability(detail?.capability)) return;
      setModal({
        capability: detail.capability,
        decision: snapshot.capabilities[detail.capability],
        source: detail.source ?? 'other',
      });
    };
    const refreshRequested = () => void refresh();
    window.addEventListener(ENTITLEMENT_REQUIRED_EVENT, required);
    window.addEventListener(ENTITLEMENTS_REFRESH_EVENT, refreshRequested);
    return () => {
      window.removeEventListener(ENTITLEMENT_REQUIRED_EVENT, required);
      window.removeEventListener(ENTITLEMENTS_REFRESH_EVENT, refreshRequested);
    };
  }, [snapshot, refresh]);
  const value = useMemo<EntitlementContextValue>(() => ({
    snapshot,
    decisionFor: (capability) => snapshot.capabilities[capability],
    openUpgrade: setModal,
    refresh,
  }), [snapshot, refresh]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
      {modal && <UpgradeModal context={modal} onClose={() => setModal(null)} />}
    </EntitlementContext.Provider>
  );
}

export function useEntitlements(): EntitlementContextValue {
  const value = useContext(EntitlementContext);
  if (!value) throw new Error('useEntitlements must be used inside EntitlementProvider.');
  return value;
}
