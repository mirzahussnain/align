'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExternalLink, MapPin } from 'lucide-react';
import Navbar from '@/shared/components/layout/Navbar';
import Button from '@/shared/components/ui/Button';
import JobMatchPreparation from './JobMatchPreparation';
import type { NormalisedJob } from '@/shared/types/job';

type Details = { job: NormalisedJob; profiles: { profileId: string; label: string }[]; selectedProfile: { profileId: string; label: string } | null; usage: { used?: number; limit?: number; remaining?: number; period?: string } | null; analysis: { id: string; score: number; createdAt: string; stale: boolean } | null };

export default function JobDetailsClient() {
  const { jobReference } = useParams<{ jobReference: string }>();
  const [data, setData] = useState<Details | null>(null);
  const [error, setError] = useState('');
  const [matchOpen, setMatchOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/details?ref=${encodeURIComponent(jobReference)}`)
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? 'Unable to load this vacancy.'); return body; })
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load this vacancy.'));
  }, [jobReference]);

  if (error) return <main className="min-h-screen bg-hero-gradient"><Navbar /><div className="mx-auto max-w-3xl px-4 pt-28 text-error">{error} <Link href="/jobs" className="underline">Return to Job Board</Link></div></main>;
  if (!data) return <main className="min-h-screen bg-hero-gradient"><Navbar /><div className="mx-auto max-w-3xl px-4 pt-28 text-text-secondary">Loading vacancy…</div></main>;

  const { job, analysis } = data;
  const meta = [job.remoteType !== 'UNKNOWN' ? job.remoteType.toLowerCase() : null, job.salaryText, job.contractType, job.employmentType].filter(Boolean).join(' · ');

  return <main className="min-h-screen bg-hero-gradient pb-12"><Navbar /><section className="mx-auto max-w-4xl px-4 pb-12 pt-28">
    <Link href="/jobs" className="text-sm text-accent-purple hover:underline">← Back to Job Board</Link>
    <article className="mt-4 rounded-2xl border border-border-subtle bg-bg-primary p-5 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs text-text-tertiary">Source: {job.providerReferences.map((reference) => reference.provider).join(' · ')}</p>
          <h1 className="mt-1 text-2xl font-bold text-text-primary sm:text-3xl">{job.title}</h1>
          <p className="mt-1 text-text-secondary">{job.company} · <span className="inline-flex items-center gap-1"><MapPin size={14} />{job.locationText}</span></p>
          {meta && <p className="mt-3 text-sm text-text-secondary">{meta}</p>}
        </div>
        <Button type="button" onClick={() => setMatchOpen(true)}>Check match</Button>
      </div>

      {/*
        Stored analyses open inside the dashboard workspace, which is a single
        route driving its sections from client tab state — there is no
        /analyses/[id] page and there never was, so this link 404'd for every
        user who had actually run a match. The dashboard reads these parameters
        on load and opens the report directly.
      */}
      {analysis && <div className="mt-5 rounded-xl border border-success/30 bg-success/10 p-4"><p className="font-semibold text-success">{analysis.score}% fit</p><Link href={`/dashboard?tab=analyses&analysis=${encodeURIComponent(analysis.id)}`} className="text-sm text-accent-purple hover:underline">View analysis</Link></div>}

      {/* No Career Track relevance pill: it was a fixed string, identical on every vacancy. The computed level replaces it in the relevance phase. */}
      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {job.descriptionAvailability === 'FULL'
          ? <span className="rounded-full bg-success/10 px-3 py-1 text-success">Full job description available</span>
          : <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">Partial description from {job.source}</span>}
        {job.sponsorSignal.registerMatchStatus !== 'NONE' && <span className="rounded-full bg-bg-tertiary px-3 py-1">Appears on sponsor register</span>}
      </div>

      {job.descriptionAvailability !== 'FULL' && <p className="mt-5 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">This provider supplied only part of the vacancy description. Paste the full description from the original listing for a more reliable match.</p>}

      <div className="mt-7 border-t border-border-subtle pt-6">
        <h2 className="text-lg font-semibold text-text-primary">Job description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-secondary">{job.description || 'The provider did not make a description available.'}</p>
      </div>

      <div className="mt-7 flex gap-3"><a href={job.canonicalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-accent-purple hover:underline">Open original listing <ExternalLink size={14} /></a></div>
    </article>
  </section>
  {matchOpen && <JobMatchPreparation job={job} profileId={data.selectedProfile?.profileId} profiles={data.profiles} usage={data.usage} onClose={() => setMatchOpen(false)} />}
  </main>;
}
