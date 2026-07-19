'use client';

import Link from 'next/link';
import { Lock, Sparkles, Loader2 } from 'lucide-react';
import { authClient } from '@/shared/lib/auth-client';
import AnalyzeWorkspace from './AnalyzeWorkspace';

/**
 * Public analyze entry point. Anyone can land here, but running an analysis
 * calls the AI, so an unauthenticated visitor is shown a sign-in gate instead
 * of the uploader. The server endpoints enforce the same rule independently.
 */
export default function AnalyzeAuthGate() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-accent-purple" />
      </div>
    );
  }

  if (session) return <AnalyzeWorkspace />;

  return (
    <div className="mx-auto mt-10 max-w-lg text-center">
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent-purple/20 bg-accent-purple/10 px-4 py-2">
        <Sparkles size={14} className="text-accent-purple" />
        <span className="text-xs font-medium text-accent-purple">AI CV Analysis</span>
      </div>

      <h1 className="mb-4 text-4xl font-bold leading-tight text-text-primary sm:text-5xl">
        Sign in to analyze your CV
      </h1>
      <p className="mx-auto mb-10 max-w-md text-base text-text-secondary">
        Your analysis is scored by AI and saved to your account, so you can track it over time and
        rebuild your CV from it. Create a free account to get started — it takes a few seconds.
      </p>

      <div className="glass-card mx-auto flex max-w-sm flex-col items-center gap-4 p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-purple/10 text-accent-purple">
          <Lock className="h-5 w-5" />
        </span>
        <div className="flex w-full flex-col gap-2.5">
          <Link
            href="/signup?redirect=/analyze"
            className="w-full rounded-full bg-accent-purple px-5 py-3 text-sm font-bold text-white transition-all hover:bg-accent-purple/90"
          >
            Create a free account
          </Link>
          <Link
            href="/login?redirect=/analyze"
            className="w-full rounded-full border border-border-default px-5 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-tertiary"
          >
            I already have an account
          </Link>
        </div>
        <p className="text-xs text-text-tertiary">
          Free plan includes CV analysis. No card required.
        </p>
      </div>
    </div>
  );
}
