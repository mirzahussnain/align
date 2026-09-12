'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/shared/lib/auth-client';
import AnalyzeWorkspace from './AnalyzeWorkspace';
import PublicAtsDemo from './PublicAtsDemo';

export default function AnalyzeAuthGate() {
  const { data: session, isPending } = authClient.useSession();
  const search = useSearchParams();
  const router = useRouter();
  const [claimError, setClaimError] = useState<string | null>(null);
  const claimStarted = useRef(false);
  const shouldClaim = Boolean(session && search.get('claim') === '1');

  useEffect(() => {
    if (!shouldClaim || claimStarted.current) return;
    claimStarted.current = true;
    fetch('/api/ats-demo/claim', { method: 'POST' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? 'The demo result could not be saved.');
        router.replace(`/dashboard?tab=ats&analysis=${encodeURIComponent(body.analysisId)}`);
      })
      .catch((cause) => setClaimError(cause instanceof Error ? cause.message : 'The demo result could not be saved.'));
  }, [router, shouldClaim]);

  if (isPending || (shouldClaim && !claimError)) {
    return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-accent-purple" /></div>;
  }
  if (session) {
    return (
      <div>
        {claimError && <p role="alert" className="mx-auto mb-5 max-w-2xl rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{claimError}</p>}
        <AnalyzeWorkspace />
      </div>
    );
  }
  return <PublicAtsDemo />;
}
