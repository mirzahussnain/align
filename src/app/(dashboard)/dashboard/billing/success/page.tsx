'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Clock } from 'lucide-react';

/**
 * Post-checkout return page (§18). The browser returning here does NOT mean the
 * payment succeeded — only the resolver, fed by a verified webhook, is
 * authoritative. This page polls the billing status and shows Pro ONLY once the
 * server confirms active access. It never reads billing state from the URL.
 */
type Phase = 'confirming' | 'active' | 'pending';

const ACTIVE_STATUSES = new Set(['ACTIVE', 'TRIALING', 'PAST_DUE_GRACE', 'CANCELLED_ACTIVE']);
const MAX_ATTEMPTS = 15;
const INTERVAL_MS = 2500;

export default function CheckoutSuccessPage() {
  const [phase, setPhase] = useState<Phase>('confirming');
  const cancelled = useRef(false);

  const checkOnce = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (!res.ok) return false;
      const data = (await res.json()) as { plan: string; status: string };
      return data.plan === 'PRO' && ACTIVE_STATUSES.has(data.status);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    cancelled.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async (attempt: number) => {
      if (cancelled.current) return;
      if (await checkOnce()) {
        if (!cancelled.current) setPhase('active');
        return;
      }
      if (cancelled.current) return;
      if (attempt >= MAX_ATTEMPTS) {
        setPhase('pending');
        return;
      }
      timer = setTimeout(() => void poll(attempt + 1), INTERVAL_MS);
    };
    void poll(0);
    return () => {
      cancelled.current = true;
      clearTimeout(timer);
    };
  }, [checkOnce]);

  const retry = useCallback(() => {
    setPhase('confirming');
    void (async () => {
      // A single immediate re-check on demand; the effect keeps polling otherwise.
      if (await checkOnce()) setPhase('active');
      else setPhase('pending');
    })();
  }, [checkOnce]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        {phase === 'confirming' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-accent-cyan">
              <Loader2 className="h-6 w-6 animate-spin" />
            </span>
            <h1 className="mt-5 text-xl font-black text-neutral-900">Payment is being confirmed</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Thanks for upgrading. We&apos;re waiting for your payment to be confirmed — this usually takes a few
              seconds. You don&apos;t need to do anything.
            </p>
          </>
        )}

        {phase === 'active' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-xl font-black text-neutral-900">You&apos;re on Pro</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Your subscription is active. Full reports, higher limits and advanced tools are unlocked.
            </p>
            <Link
              href="/dashboard/settings/billing"
              className="mt-6 inline-block w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition"
            >
              Go to billing
            </Link>
          </>
        )}

        {phase === 'pending' && (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Clock className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-xl font-black text-neutral-900">Still confirming</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              Your payment is taking a little longer to confirm. Your plan will update automatically once it&apos;s
              done — no need to pay again.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-6 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800 shadow-sm transition"
            >
              Check again
            </button>
            <Link href="/dashboard/settings/billing" className="mt-3 inline-block text-xs font-semibold text-neutral-500 hover:text-neutral-700">
              Back to billing
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
