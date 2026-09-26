'use client';

import { ArrowUpRight, CheckCircle2, ClipboardList, Info, Route } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface VisaData {
  title: string;
  overview: string[];
  requirements: string[];
  process: string[];
  roadmap: string[];
  officialUrl: string;
}

function DetailCard({ icon: Icon, title, subtitle, items, numbered = false, accent = 'violet' }: { icon: React.ElementType; title: string; subtitle: string; items: string[]; numbered?: boolean; accent?: 'violet' | 'cyan' | 'emerald' }) {
  const tones = { violet: 'bg-violet-50 text-violet-700', cyan: 'bg-gradient-to-br from-cyan-100 via-sky-50 to-blue-50 text-cyan-800', emerald: 'bg-emerald-50 text-emerald-700' };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', tones[accent])}><Icon className="h-5 w-5" /></span><div><h3 className="font-semibold text-slate-950">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{subtitle}</p></div></div>
      <ul className="mt-5 space-y-2.5">
        {items.map((item, index) => {
          const text = numbered ? item.replace(/^\d+\.\s*/, '') : item;
          return <li key={`${title}-${index}`} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm leading-6 text-slate-700">{numbered ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-xs font-semibold text-white">{index + 1}</span> : <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', accent === 'emerald' ? 'bg-emerald-500' : accent === 'cyan' ? 'bg-cyan-500' : 'bg-violet-500')} />}<span>{text}</span></li>;
        })}
      </ul>
    </section>
  );
}

export default function VisaRouteDetails({ visa, className }: { visa: VisaData; className?: string }) {
  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      <DetailCard icon={Info} title="Overview" subtitle="What this route is for" items={visa.overview} />
      <DetailCard icon={ClipboardList} title="Application Process" subtitle="Typical application sequence" items={visa.process} numbered accent="cyan" />
      <DetailCard icon={CheckCircle2} title="Key Requirements" subtitle="Eligibility points to verify" items={visa.requirements} accent="emerald" />
      <DetailCard icon={Route} title="Possible Route & Next Steps" subtitle="Planning context, not a guarantee" items={visa.roadmap} />
      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 lg:col-span-2">This is general route information, not immigration advice. Rules, fees and eligibility can change. <a href={visa.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-4">Check current GOV.UK guidance <ArrowUpRight className="h-4 w-4" /></a> before making a decision or application.</aside>
    </div>
  );
}
