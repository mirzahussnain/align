'use client';

import { useEffect, useId, useRef } from 'react';
import { Check, ChevronRight, Crown, Sparkles, X } from 'lucide-react';
import { PLANS } from '@/shared/constants/plans';
import type { CapabilityDecision, ProductCapability } from '@/shared/entitlements/registry';

export type PricingDetailsContext = {
  capability?: ProductCapability;
  decision?: CapabilityDecision;
  title?: string;
};

export const UPGRADE_HEADLINES: Partial<Record<ProductCapability, string>> = {
  view_full_ats_report: 'Unlock the full ATS report',
  view_full_job_match_report: 'Unlock the full requirement report',
  view_requirement_ledger: 'Unlock the full requirement report',
  job_match_analysis: 'Unlock AI Job Match Analysis',
  cv_regeneration: 'Generate a truthful tailored CV',
  human_evidence_capture: 'Add and reuse verified Career Profile evidence',
  approve_evidence_for_application: 'Approve more evidence for this application',
  reuse_evidence_across_applications: 'Add and reuse verified Career Profile evidence',
  additional_career_profiles: 'Create another Career Profile',
  profile_evidence_storage: 'Store more reusable Career Profile evidence',
  stored_source_cvs: 'Keep more source CVs in Align',
  advanced_tools: 'Access advanced application intelligence',
};

function detailFor(decision?: CapabilityDecision) {
  if (!decision) return 'Compare the plans before you decide what is right for your job search.';
  if (decision.reason === 'quota_exhausted') {
    return `You have used ${decision.used ?? decision.limit} of ${decision.limit} this ${decision.period ?? 'period'}.`;
  }
  if (decision.reason === 'resource_limit_reached') {
    return `Your current plan includes ${decision.limit} ${decision.limit === 1 ? 'item' : 'items'} for this area.`;
  }
  return 'This capability is not included in your current plan.';
}

export function PricingDetailsDialog({
  open,
  onClose,
  context,
  onViewPlans,
}: {
  open: boolean;
  onClose: () => void;
  context?: PricingDetailsContext;
  onViewPlans?: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = context?.title ?? (context?.capability ? UPGRADE_HEADLINES[context.capability] : undefined) ?? 'Compare Align plans';
  const detail = detailFor(context?.decision);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-5" role="presentation">
      <button
        type="button"
        aria-label="Close pricing details"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[22px] border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.24)] sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between gap-5 border-b border-slate-200 bg-white px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-accent-cyan ring-1 ring-accent-cyan/20">
              <Sparkles className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
            </span>
            <div>
              <h2 id={titleId} className="max-w-[23ch] text-xl font-semibold leading-tight tracking-[-0.025em] text-slate-950 sm:text-2xl">
                {title}
              </h2>
              <p className="mt-1.5 max-w-[62ch] text-sm leading-6 text-slate-600">{detail}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close pricing details"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/45 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {PLANS.map((plan) => {
              const isPro = plan.id === 'pro';
              return (
                <article
                  key={plan.id}
                  className={`flex min-h-full flex-col rounded-2xl border p-5 ${
                    isPro
                      ? 'border-accent-cyan/45 bg-sky-50/50 shadow-[0_10px_30px_rgba(2,132,199,0.08)]'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-semibold ${isPro ? 'text-accent-cyan' : 'text-slate-900'}`}>{plan.name}</p>
                      <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-slate-950">
                        {plan.price}
                        {plan.period && <span className="ml-1 text-xs font-medium tracking-normal text-slate-500">{plan.period}</span>}
                      </p>
                    </div>
                    {isPro && (
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                        <Crown className="h-4 w-4 text-white" strokeWidth={1.9} aria-hidden="true" />
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-600">{plan.tagline}</p>
                  <ul className="mt-4 space-y-2.5 border-t border-slate-200/80 pt-4">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs leading-5 text-slate-700">
                        <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isPro ? 'text-accent-cyan' : 'text-slate-400'}`} strokeWidth={2.5} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Plan limits and pricing shown here come from Align&apos;s current plan configuration.</p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/35 focus-visible:ring-offset-2"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewPlans?.();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/45 focus-visible:ring-offset-2"
          >
            View full plan &amp; billing
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </section>
    </div>
  );
}
