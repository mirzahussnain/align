'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, BriefcaseBusiness, Building2, CalendarDays, Loader2, MapPin, Search, SlidersHorizontal } from 'lucide-react';

type PublicJobCard = { id: string; title: string; company: { displayName: string }; location?: string; workplaceType?: string; employmentType?: string; salary?: { text?: string; min?: number; max?: number; currency?: string }; postedAt?: string; fullDescriptionExternalUrl?: string; sourceSummary: { preferredProvider: string; providerCount: number; employerDirect: boolean } };
type SearchResponse = { jobs: PublicJobCard[]; sessionId: string; meta: { hasMore: boolean; partialResults: boolean; message?: string } };

const PROVIDER_LABELS: Record<string, string> = { ADZUNA: 'Adzuna', REED: 'Reed', JOOBLE: 'Jooble', NHS_JOBS: 'NHS Jobs', GREENHOUSE: 'Greenhouse', LEVER: 'Lever', ASHBY: 'Ashby', SMARTRECRUITERS: 'SmartRecruiters' };

function salaryLabel(salary?: PublicJobCard['salary']) {
  if (!salary) return undefined;
  if (salary.text) return salary.text;
  const currency = salary.currency === 'GBP' ? '£' : '';
  if (salary.min != null && salary.max != null) return `${currency}${salary.min.toLocaleString()}–${currency}${salary.max.toLocaleString()}`;
  const amount = salary.min ?? salary.max;
  return amount == null ? undefined : `${currency}${amount.toLocaleString()}`;
}

export default function PublicJobsSearch() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [contractType, setContractType] = useState('all');
  const [remoteType, setRemoteType] = useState('ALL');
  const [postedWithinDays, setPostedWithinDays] = useState('30');
  const [jobs, setJobs] = useState<PublicJobCard[]>([]);
  const [sessionId, setSessionId] = useState<string>();
  const [hasMore, setHasMore] = useState(false);
  const [partialMessage, setPartialMessage] = useState<string>();
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function search(append = false) {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ query: query.trim(), location: location.trim(), perPage: '12' });
      if (contractType !== 'all') params.set('contractType', contractType);
      if (remoteType !== 'ALL') params.set('remoteType', remoteType);
      if (postedWithinDays !== 'all') params.set('postedWithinDays', postedWithinDays);
      if (append && sessionId) params.set('sessionId', sessionId);
      const response = await fetch(`/api/jobs?${params.toString()}`);
      if (!response.ok) throw new Error('search_failed');
      const data = (await response.json()) as SearchResponse;
      setJobs((current) => append ? [...current, ...data.jobs] : data.jobs);
      setSessionId(data.sessionId);
      setHasMore(data.meta.hasMore);
      setPartialMessage(data.meta.partialResults ? data.meta.message ?? 'Some sources are temporarily unavailable.' : undefined);
      setSearched(true);
    } catch {
      setError('Vacancies could not be loaded. Check your connection and try the search again.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void search(false); }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="rounded-2xl bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_auto]">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Keyword or role<span className="relative block"><Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nurse, analyst, project manager" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" /></span></label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600">Location<span className="relative block"><MapPin aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Leeds or UK-wide" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100" /></span></label>
          <button type="submit" disabled={loading} className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(103,87,217,0.22)] transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Search aria-hidden="true" className="h-4 w-4" />}Search vacancies</button>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4"><SlidersHorizontal aria-hidden="true" className="mb-2.5 h-4 w-4 text-slate-400" />
          <label className="text-xs font-semibold text-slate-600">Contract type<select value={contractType} onChange={(event) => setContractType(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"><option value="all">Any contract</option><option value="permanent">Permanent</option><option value="contract">Contract</option><option value="temporary">Temporary</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Work style<select value={remoteType} onChange={(event) => setRemoteType(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"><option value="ALL">Any</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option><option value="ONSITE">On-site</option></select></label>
          <label className="text-xs font-semibold text-slate-600">Posted<select value={postedWithinDays} onChange={(event) => setPostedWithinDays(event.target.value)} className="ml-2 min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"><option value="7">Past week</option><option value="14">Past fortnight</option><option value="30">Past month</option><option value="all">Any time</option></select></label>
        </div>
      </form>

      {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
      {partialMessage && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{partialMessage}</p>}
      {!searched && !loading && <div className="border-y border-slate-200 py-10 text-center"><BriefcaseBusiness className="mx-auto h-7 w-7 text-violet-600" aria-hidden="true" /><p className="mt-3 font-semibold text-slate-900">Search current vacancies from Align’s integrated UK sources.</p><p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-600">Results are normalized and deduplicated. Opening a public listing does not save it to your Align account.</p></div>}
      {searched && !loading && jobs.length === 0 && !error && <div className="border-y border-slate-200 py-10 text-center"><p className="font-semibold text-slate-900">No vacancies matched this search.</p><p className="mt-1 text-sm text-slate-600">Try a broader role term or remove one filter.</p></div>}

      {jobs.length > 0 && <section aria-live="polite" aria-label="Vacancy results" className="space-y-3"><div className="flex items-end justify-between gap-4"><div><h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">Current vacancies</h2><p className="mt-1 text-sm text-slate-600">Sampled live results from the sources shown on each listing.</p></div><span className="text-sm tabular-nums text-slate-500">{jobs.length} shown</span></div><div className="divide-y divide-slate-200 overflow-hidden rounded-2xl bg-white shadow-[0_14px_50px_rgba(15,23,42,0.08)]">{jobs.map((job) => { const salary = salaryLabel(job.salary); return <article key={job.id} className="p-5 sm:p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">{PROVIDER_LABELS[job.sourceSummary.preferredProvider] ?? job.sourceSummary.preferredProvider}</span>{job.sourceSummary.employerDirect && <span className="text-xs font-medium text-emerald-700">Employer-direct source</span>}</div><h3 className="mt-3 text-lg font-semibold tracking-[-0.02em] text-slate-950">{job.title}</h3><p className="mt-1 flex items-center gap-2 text-sm font-medium text-slate-700"><Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />{job.company.displayName}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">{job.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" aria-hidden="true" />{job.location}</span>}{job.employmentType && <span className="flex items-center gap-1.5"><BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />{job.employmentType}</span>}{job.postedAt && <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />Posted {new Date(job.postedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}</div>{salary && <p className="mt-3 text-sm font-semibold tabular-nums text-slate-950">{salary}</p>}</div>{job.fullDescriptionExternalUrl && <a href={job.fullDescriptionExternalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:border-violet-400 hover:bg-violet-50 focus:outline-none focus:ring-4 focus:ring-violet-100">Visit original job posting<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>}</div></article>; })}</div>{hasMore && <div className="flex justify-center pt-3"><button type="button" disabled={loading} onClick={() => void search(true)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:border-violet-400 hover:bg-violet-50 disabled:opacity-60">Load more vacancies</button></div>}</section>}
      <div className="flex flex-col justify-between gap-4 border-t border-slate-200 pt-6 text-sm text-slate-600 sm:flex-row sm:items-center"><p>Want saved jobs, Career Track relevance, and Job Match?</p><Link href="/login?callbackURL=%2Fdashboard%2Fjobs" className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-4 hover:text-violet-900">Continue in your dashboard</Link></div>
    </div>
  );
}
