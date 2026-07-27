import Link from 'next/link';
import { XCircle } from 'lucide-react';

/**
 * Checkout-cancel return page (§18). Reaching here means the user backed out of
 * checkout — nothing was charged and their current plan is unchanged. No billing
 * state is read from or written by this page.
 */
export default function CheckoutCancelledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500">
          <XCircle className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-black text-neutral-900">Checkout not completed</h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          No payment was taken and your current plan hasn&apos;t changed. You can upgrade whenever you&apos;re ready.
        </p>
        <Link
          href="/dashboard?tab=billing"
          className="mt-6 inline-block w-full rounded-full bg-accent-purple px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-purple/90"
        >
          Back to billing
        </Link>
      </div>
    </main>
  );
}
