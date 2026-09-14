'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, FileUp, LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import type { PublicAtsPreview } from '@/shared/services/public-ats-service';

export default function PublicAtsDemo() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PublicAtsPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const operation = useRef(crypto.randomUUID());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || loading) return;
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.set('file', file);
    try {
      const response = await fetch('/api/public/ats-demo', {
        method: 'POST',
        headers: { 'x-operation-id': operation.current },
        body: form,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? 'The demo could not be completed.');
      setPreview(body.preview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The demo could not be completed.');
    } finally {
      setLoading(false);
    }
  }

  if (preview) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-2xl bg-[#111827] text-white shadow-[0_24px_80px_rgba(17,24,39,0.18)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-violet-300">Private ATS preview</p>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-6xl font-black tracking-[-0.04em] tabular-nums">{preview.overallScore}</span>
                <span className="pb-2 text-sm font-semibold text-slate-400">out of 100</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300">
                This limited preview shows how your CV performs at a glance. Create an account to unlock the full deterministic ATS report and save it to your history.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {preview.categories.map((category) => (
                <div key={category.id} className="rounded-xl bg-white/7 p-4 ring-1 ring-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-200">{category.label}</span>
                    <span className="text-sm font-black tabular-nums">{category.score}/{category.maxScore}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, Math.round((category.score / category.maxScore) * 100))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">What is already working</h2>
            <ul className="mt-4 space-y-3">
              {preview.strengths.map((finding) => <li key={finding} className="flex gap-3 text-sm text-slate-600"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{finding}</li>)}
            </ul>
          </section>
          <section className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900">First improvements to make</h2>
            <ul className="mt-4 space-y-3">
              {preview.weaknesses.length ? preview.weaknesses.map((finding) => <li key={finding} className="flex gap-3 text-sm text-slate-600"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />{finding}</li>) : <li className="text-sm text-slate-500">Unlock the complete report to review every recommendation.</li>}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div className="flex gap-4">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
            <div><h2 className="text-base font-bold text-slate-900">Unlock your full ATS analysis</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Get the full category breakdown, every rule-based recommendation, detailed keyword and compliance findings, saved history, and source CV management.</p></div>
          </div>
          <div className="mt-5 flex shrink-0 flex-col gap-2 sm:mt-0 sm:flex-row">
            <Link href="/login?redirect=/analyze?claim=1" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-300 bg-white px-5 text-sm font-semibold text-violet-800 hover:bg-violet-100">Sign in</Link>
            <Link href="/signup?redirect=/analyze?claim=1" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">Create account</Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-[-0.035em] text-text-primary sm:text-5xl">
          See how an ATS reads your CV
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-text-secondary">
          Run one private, temporary CV readiness check. No account is required until you choose
          to save the result.
        </p>
      </div>
      <form onSubmit={submit} className="mt-10 rounded-2xl bg-white p-6 shadow-[0_24px_90px_rgba(31,41,55,0.13)] sm:p-8">
        <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center focus-within:ring-2 focus-within:ring-accent-cyan">
          <FileUp className="h-7 w-7 text-accent-cyan" />
          <span className="mt-4 text-sm font-semibold text-slate-900">
            {file ? file.name : 'Choose a PDF or DOCX CV'}
          </span>
          <span className="mt-1 text-xs text-slate-500">Maximum 4 MB</span>
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
              operation.current = crypto.randomUUID();
            }}
          />
        </label>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <button
          type="submit"
          disabled={!file || loading}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {loading ? 'Checking your CV…' : 'Run free ATS check'}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">
          Temporary source and result data expire automatically. Your CV is never published.
        </p>
      </form>
    </div>
  );
}
