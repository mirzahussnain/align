'use client';

import { FormEvent, useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, Building2, Clock3, Database, Loader2, MapPin, Search } from 'lucide-react';

import type { CareerMarketSnapshotView, MarketMixItem } from '@/shared/types/career-market';

type ApiResponse = {
  freshness: 'FRESH' | 'GENERATED' | 'STALE' | 'PENDING';
  snapshot: CareerMarketSnapshotView | null;
  methodology: { statement: string; salaryMethod: string; sponsorshipMethod: string };
};

const providerName = (provider: string) => ({ ADZUNA: 'Adzuna', REED: 'Reed', JOOBLE: 'Jooble', NHS_JOBS: 'NHS Jobs' })[provider] ?? provider;
const money = (value: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value);

function Mix({ title, items }: { title: string; items: MarketMixItem[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-950">{title}</h3><div className="mt-4 space-y-3">{items.length ? items.map((item) => <div key={item.label}><div className="flex justify-between gap-4 text-sm"><span className="capitalize text-slate-700">{item.label.toLowerCase().replaceAll('_', ' ')}</span><span className="font-medium tabular-nums text-slate-950">{item.count} · {item.share}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${item.share}%` }} /></div></div>) : <p className="text-sm text-slate-500">Not enough disclosed data in this sample.</p>}</div></section>;
}

export default function CareerMarketExplorer() {
  const [role, setRole] = useState('');
  const [location, setLocation] = useState('UK');
  const [data, setData] = useState<ApiResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (role.trim().length < 2) return;
    setLoading(true); setError(undefined);
    try {
      const params = new URLSearchParams({ role: role.trim(), location: location.trim() || 'UK' });
      const response = await fetch(`/api/trends?${params}`);
      const body = await response.json() as ApiResponse;
      if (!response.ok && response.status !== 202) throw new Error('unavailable');
      setData(body);
    } catch {
      setError('A market sample could not be prepared just now. Please try again.');
    } finally { setLoading(false); }
  }

  const snapshot = data?.snapshot;
  return <div className="space-y-7">
    <form onSubmit={submit} className="rounded-2xl bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,0.10)] sm:p-5"><div className="grid gap-3 md:grid-cols-[1.35fr_1fr_auto]"><label className="text-xs font-semibold text-slate-600">Role or occupation<input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Registered nurse, project manager, analyst" className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" /></label><label className="text-xs font-semibold text-slate-600">Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="UK, Leeds, London" className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-100" /></label><button disabled={loading || role.trim().length < 2} className="mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Build sample</button></div></form>
    {error && <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {data?.freshness === 'PENDING' && !snapshot && <p className="rounded-xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900">Another request is preparing this sample. Try again shortly.</p>}
    {!data && !loading && <div className="border-y border-slate-200 py-12 text-center"><Database className="mx-auto h-7 w-7 text-violet-600" /><p className="mt-3 font-semibold text-slate-950">Choose a role to generate a current, bounded vacancy sample.</p><p className="mx-auto mt-1 max-w-2xl text-sm leading-6 text-slate-600">Align reports coverage and missing fields alongside every result. It does not fabricate historical trends when no history exists.</p></div>}
    {snapshot && <>
      {data.freshness === 'STALE' && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">The latest completed sample is shown while a refresh is unavailable.</p>}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-violet-700">{snapshot.roleQuery} · {snapshot.locationQuery}</p><h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em] text-slate-950">What this vacancy sample shows</h2></div><p className="flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="h-4 w-4" />Generated {new Date(snapshot.generatedAt).toLocaleString('en-GB')}</p></div>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-950 p-5 text-white"><BriefcaseBusiness className="h-5 w-5 text-cyan-300" /><p className="mt-5 text-3xl font-semibold tabular-nums">{snapshot.metrics.sampledVacancyCount}</p><p className="mt-1 text-sm text-slate-300">vacancies in this sample</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Salary disclosure</p><p className="mt-5 text-3xl font-semibold tabular-nums text-slate-950">{snapshot.metrics.salary.disclosureRate}%</p><p className="mt-1 text-sm text-slate-600">{snapshot.metrics.salary.disclosedCount} of {snapshot.sampleSize} listings</p></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Median disclosed annual salary</p><p className="mt-5 text-3xl font-semibold tabular-nums text-slate-950">{snapshot.metrics.salary.annualGbp ? money(snapshot.metrics.salary.annualGbp.median) : 'Not available'}</p><p className="mt-1 text-sm text-slate-600">{snapshot.metrics.salary.eligibleAnnualCount} annual GBP listings</p></div></div>
      <div className="grid gap-4 lg:grid-cols-2"><Mix title="Contract type mix" items={snapshot.metrics.contractTypeMix} /><Mix title="Work style mix" items={snapshot.metrics.workStyleMix} /><Mix title="Sampled regional distribution" items={snapshot.metrics.regions} /><Mix title="Sampled top employers" items={snapshot.metrics.topEmployers} /></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-violet-600" /><h3 className="font-semibold text-slate-950">Coverage and data quality</h3></div><div className="mt-4 flex flex-wrap gap-2">{snapshot.providerCoverage.map((item) => <span key={item.provider} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">{providerName(item.provider)}: {item.status.toLowerCase().replaceAll('_', ' ')} · {item.sampled}</span>)}</div><p className="mt-4 text-sm leading-6 text-slate-600">Missing in this sample: {snapshot.dataQuality.salaryMissing} salary, {snapshot.dataQuality.contractTypeMissing} contract type, {snapshot.dataQuality.workStyleUnknown} work style, {snapshot.dataQuality.locationMissing} location. {snapshot.dataQuality.note}</p></section>
      <section><h3 className="text-lg font-semibold text-slate-950">Current vacancies in the sample</h3><div className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">{snapshot.metrics.currentVacancies.map((job) => <article key={job.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div><p className="text-xs font-semibold text-violet-700">{providerName(job.provider)}</p><h4 className="mt-1 font-semibold text-slate-950">{job.title}</h4><p className="mt-1 flex flex-wrap gap-3 text-sm text-slate-600"><span className="flex items-center gap-1"><Building2 className="h-4 w-4" />{job.employer}</span><span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>{job.salaryText && <span>{job.salaryText}</span>}</p></div><a href={job.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 text-sm font-semibold text-violet-700">Visit original job posting<ArrowUpRight className="h-4 w-4" /></a></article>)}</div></section>
      <aside className="rounded-2xl bg-cyan-50 p-5 text-sm leading-6 text-cyan-950"><p className="font-semibold">How to read this</p><p className="mt-1">{data.methodology.statement} {data.methodology.salaryMethod} {data.methodology.sponsorshipMethod}</p></aside>
    </>}
  </div>;
}
