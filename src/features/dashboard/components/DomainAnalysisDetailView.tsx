'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Download, Loader2 } from 'lucide-react';
import DashboardTopBar from './DashboardTopBar';
import AtsAnalysisDashboard from '@/features/cv-analyzer/components/ats/AtsAnalysisDashboard';
import JobMatchDashboard from '@/features/cv-analyzer/components/job-match/JobMatchDashboard';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { CVAnalysisResult } from '@/shared/types/cv';

type Payload = {
  analysis?: CVAnalysisResult;
  match?: CVAnalysisResult;
  cvUsed: { id: string; filename: string; available: boolean };
  profileUsed?: { label: string; targetRole?: string | null } | null;
  jobUsed?: { title: string; company: string; description: string; source: string };
  provenance: Record<string, unknown>;
};

export default function DomainAnalysisDetailView({ id, domain }: { id: string; domain: 'ats' | 'job_match' }) {
  const close = useDashboardStore((state) => state.closeAnalysis);
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const endpoint = domain === 'ats' ? `/api/ats-analyses/${id}` : `/api/job-matches/${id}`;
    fetch(endpoint)
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? 'Could not load this result.');
        if (active) setPayload(body);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : 'Could not load this result.'));
    return () => { active = false; };
  }, [domain, id]);

  const result = payload?.analysis ?? payload?.match;
  return (
    <>
      <DashboardTopBar title={domain === 'ats' ? 'ATS Analysis' : 'Job Match'} subtitle={payload?.cvUsed.filename ?? 'Loading result…'} />
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={close} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" /> Back to history
          </button>
          {payload?.cvUsed.available && (
            <a href={`/api/cv-revisions/${payload.cvUsed.id}/download`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Download exact CV
            </a>
          )}
        </div>
        {!payload && !error && <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent-cyan" /></div>}
        {error && <div role="alert" className="flex min-h-40 items-center justify-center gap-3 rounded-2xl bg-rose-50 p-6 text-sm text-rose-700"><AlertTriangle className="h-5 w-5" />{error}</div>}
        {payload?.jobUsed && (
          <section className="mb-5 rounded-2xl bg-[#111827] p-5 text-white">
            <h2 className="text-lg font-semibold">{payload.jobUsed.title}</h2>
            <p className="mt-1 text-sm text-slate-300">{payload.jobUsed.company} · {payload.jobUsed.source.replaceAll('_', ' ').toLowerCase()}</p>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">Exact Job Description Used</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{payload.jobUsed.description}</p>
            </details>
          </section>
        )}
        {result && <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">{domain === 'ats' ? <AtsAnalysisDashboard result={result} /> : <JobMatchDashboard result={result} />}</div>}
      </div>
    </>
  );
}
