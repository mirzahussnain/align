'use client';

import type { ComponentType } from 'react';
import {
  ArrowRight,
  Briefcase,
  FileSearch,
  FileStack,
  Gauge,
  ListChecks,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import ScoreTrendChart, { type ScorePoint } from '../ScoreTrendChart';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { AtsAnalysisRow, DashboardData, JobMatchRow } from '../DashboardShell';
import { profileCompleteness } from '@/features/dashboard/data/profile-completeness';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import { getIndustryDictionary, isKnownIndustry } from '@/shared/constants/sector-keywords';
import { cn } from '@/shared/utils/cn';

const SENIORITY_LABELS: Record<string, string> = {
  entry: 'Entry-level',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead',
};
const CHART_MIN_POINTS = 5;

type Hero =
  | { domain: 'ats'; row: AtsAnalysisRow }
  | { domain: 'job_match'; row: JobMatchRow };

function scoreCopy(domain: Hero['domain'], score: number) {
  if (domain === 'job_match') {
    if (score >= 85) return { label: 'Strong match', detail: 'Strong alignment with this exact vacancy.' };
    if (score >= 70) return { label: 'Good match', detail: 'Solid fit with a few vacancy-specific gaps.' };
    if (score >= 50) return { label: 'Stretch match', detail: 'Meaningful gaps remain for this vacancy.' };
    return { label: 'Weak match', detail: 'Substantial tailoring is needed for this vacancy.' };
  }
  if (score >= 90) return { label: 'Excellent readiness', detail: 'This CV clears most ATS checks cleanly.' };
  if (score >= 75) return { label: 'Strong foundation', detail: 'A few focused changes could strengthen it.' };
  if (score >= 60) return { label: 'Generally ready', detail: 'Some CV-level issues are still holding it back.' };
  return { label: 'Needs improvement', detail: 'Resolve the priority ATS issues before applying.' };
}

export default function OverviewView({ user, data }: { user: { name: string }; data: DashboardData }) {
  const setTab = useDashboardStore((state) => state.setTab);
  const openAts = useDashboardStore((state) => state.openAtsAnalysis);
  const openMatch = useDashboardStore((state) => state.openJobMatch);
  const { atsAnalyses, jobMatches, cvs, profile, usage, aiAnalysesLimit, profileComplete } = data;
  const total = atsAnalyses.length + jobMatches.length;
  const completeness = profileCompleteness(profile);

  const latestAts = atsAnalyses[0] ?? null;
  const latestMatch = jobMatches[0] ?? null;
  const hero: Hero | null = !latestAts
    ? latestMatch ? { domain: 'job_match', row: latestMatch } : null
    : !latestMatch || new Date(latestAts.createdAt) >= new Date(latestMatch.createdAt)
      ? { domain: 'ats', row: latestAts }
      : { domain: 'job_match', row: latestMatch };
  const heroScore = hero?.domain === 'ats' ? hero.row.overallScore : hero?.row.matchScore;
  const heroCopy = hero && heroScore != null ? scoreCopy(hero.domain, heroScore) : null;
  const previous = hero?.domain === 'ats' ? atsAnalyses[1] : hero ? jobMatches[1] : null;
  const previousScore = previous
    ? 'overallScore' in previous ? previous.overallScore : previous.matchScore
    : null;
  const delta = heroScore != null && previousScore != null ? heroScore - previousScore : null;

  const targetRole = profile.personal.targetRoleTitle
    || (isKnownOccupation(profile.personal.targetOccupation)
      ? getOccupationProfile(profile.personal.targetOccupation).label
      : '');
  const seniority = SENIORITY_LABELS[profile.personal.targetSeniority] ?? '';
  const sector = isKnownIndustry(profile.targetIndustry)
    ? getIndustryDictionary(profile.targetIndustry)?.label ?? ''
    : '';
  const targetDetail = [seniority, sector].filter(Boolean).join(' · ');
  const remaining = aiAnalysesLimit == null ? null : Math.max(0, aiAnalysesLimit - usage.aiAnalyses);

  const chronology = [
    ...atsAnalyses.map((row) => ({ date: row.createdAt, ats: row.overallScore, jobMatch: null })),
    ...jobMatches.map((row) => ({ date: row.createdAt, ats: null, jobMatch: row.matchScore })),
  ]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);
  const chartData: ScorePoint[] = chronology.map((point) => ({
    date: new Date(point.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    ats: point.ats,
    jobMatch: point.jobMatch,
  }));

  const nextSteps: Array<{
    title: string;
    detail: string;
    cta: string;
    icon: ComponentType<{ className?: string }>;
    action: () => void;
  }> = [];
  if (!latestAts) nextSteps.push({ title: 'Establish CV readiness', detail: 'Run an ATS analysis before tailoring against vacancies.', cta: 'Analyze CV', icon: FileSearch, action: () => setTab('analyze') });
  if (!profileComplete) nextSteps.push({ title: `Finish ${profile.label}`, detail: `Your Career Profile is ${completeness}% complete.`, cta: 'Complete profile', icon: UserRound, action: () => setTab('profile') });
  if (!latestMatch) nextSteps.push({ title: 'Check fit for a vacancy', detail: 'Open Jobs and assess one exact CV against one exact role.', cta: 'Browse jobs', icon: Briefcase, action: () => window.location.assign('/dashboard/jobs') });
  if (total > 0 && cvs.length === 0) nextSteps.push({ title: 'Create an application version', detail: 'Generate a traceable CV version from a completed Job Match.', cta: 'Generated CVs', icon: FileStack, action: () => setTab('cvs') });
  if (!nextSteps.length) nextSteps.push({ title: 'Keep your evidence current', detail: 'Review a recent result or assess another vacancy.', cta: 'View Job Matches', icon: ListChecks, action: () => setTab('job_matches') });

  return (
    <>
      <DashboardTopBar title={`Welcome back, ${user.name.split(' ')[0]}`} subtitle={`Viewing career track: ${profile.label}`} />
      <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(262_55%_16%)] via-[hsl(250_50%_14%)] to-[hsl(199_55%_14%)] p-6 text-white lg:col-span-3">
            <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-cyan/20 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-accent-purple/25 blur-3xl" aria-hidden />
            <div className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">
              <Sparkles className="h-3.5 w-3.5" />
              {hero?.domain === 'job_match' ? 'Latest vacancy fit' : 'Latest CV readiness'}
            </div>
            {hero && heroCopy && heroScore != null ? (
              <div className="relative mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
                <ScoreRing score={heroScore} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">{heroCopy.label}</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">{hero.domain === 'ats' ? 'ATS analysis' : 'Job Match'}</span>
                    {delta != null && <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', delta >= 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300')}>{delta >= 0 ? '+' : ''}{delta} vs previous {hero.domain === 'ats' ? 'ATS result' : 'match'}</span>}
                  </div>
                  <p className="mt-3 truncate text-sm font-semibold text-white/90">
                    {hero.domain === 'ats' ? hero.row.sourceFileName : `${hero.row.jobTitle} · ${hero.row.jobCompany}`}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">{heroCopy.detail}</p>
                  <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    <HeroFact label="Exact CV" value={hero.row.sourceFileName} />
                    <HeroFact label="Signal" value={hero.domain === 'ats' ? 'CV-only readiness' : 'Vacancy-specific fit'} />
                    {hero.domain === 'job_match' && <HeroFact label="Career Profile" value={hero.row.profileLabel} />}
                  </dl>
                  <button type="button" onClick={() => hero.domain === 'ats' ? openAts(hero.row.id) : openMatch(hero.row.id)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[hsl(262_55%_18%)] transition-transform hover:scale-[1.02]">
                    View {hero.domain === 'ats' ? 'ATS breakdown' : 'match breakdown'} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative mt-4">
                <p className="text-2xl font-black tracking-tight">No results yet</p>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-white/60">Start with a CV-only ATS analysis, then assess vacancy fit from Jobs.</p>
                <button type="button" onClick={() => setTab('analyze')} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-xs font-bold text-[hsl(262_55%_18%)]">Analyze your CV <ArrowRight className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </section>
          <div className="flex flex-col gap-3 lg:col-span-2">
            <MiniStat icon={Target} label="Current career target" value={targetRole || 'Not set yet'} tint="slate" sublabel={targetDetail || 'Set your target role in Profile'} onClick={() => setTab('profile')} />
            <MiniStat icon={Gauge} label="Analysis histories" value={`${atsAnalyses.length} ATS · ${jobMatches.length} matches`} tint="cyan" sublabel={remaining == null ? `${usage.aiAnalyses} AI runs used this month` : `${remaining} AI runs remaining this month`} />
            <MiniStat icon={FileStack} label="Application documents" value={cvs.length ? `${cvs.length} ready` : '0 ready'} tint="purple" sublabel={cvs.length ? 'Versioned and traceable' : 'Generate from a Job Match'} onClick={() => setTab('cvs')} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-3">
            {chartData.length >= CHART_MIN_POINTS ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div><h2 className="text-sm font-bold text-neutral-900">Scores over time</h2><p className="mt-0.5 text-xs text-neutral-400">ATS and Job Match remain separate series</p></div>
                </div>
                <div className="mt-4"><ScoreTrendChart data={chartData} /></div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold text-neutral-900">Your progress so far</h2>
                <p className="mt-0.5 text-xs text-neutral-400">{total ? `A trend needs ${CHART_MIN_POINTS}+ results. These signals stay separate until then.` : 'Run an ATS analysis to begin your history.'}</p>
                <div className="mt-4 flex flex-col divide-y divide-neutral-100">
                  <DigestRow icon={FileSearch} tint="bg-accent-purple/10 text-accent-purple" label="Latest CV readiness" value={latestAts ? `${latestAts.overallScore}/100 · ${latestAts.sourceFileName}` : 'No ATS analysis yet'} />
                  <DigestRow icon={Briefcase} tint="bg-accent-cyan/10 text-accent-cyan" label="Latest vacancy fit" value={latestMatch ? `${latestMatch.matchScore}/100 · ${latestMatch.jobTitle}` : 'No Job Match yet'} />
                  <DigestRow icon={FileStack} tint="bg-neutral-100 text-neutral-500" label="Generated CV versions" value={cvs.length ? `${cvs.length} saved` : 'None yet'} />
                </div>
              </>
            )}
          </section>
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2"><ListChecks className="h-4 w-4 text-accent-purple" /><h2 className="text-sm font-bold text-neutral-900">Recommended next steps</h2></div>
            <ul className="mt-4 flex flex-col gap-3">
              {nextSteps.slice(0, 4).map((step) => (
                <li key={step.title} className="flex gap-3 rounded-xl bg-neutral-50 p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-purple/10 text-accent-purple"><step.icon className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-neutral-900">{step.title}</p><p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{step.detail}</p><button type="button" onClick={step.action} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent-purple hover:underline">{step.cta}<ArrowRight className="h-3 w-3" /></button></div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-6 py-4">
            <h2 className="text-sm font-bold text-neutral-900">Recent analysis activity</h2>
            <p className="mt-0.5 text-xs text-neutral-400">CV readiness and vacancy fit are filed independently</p>
          </div>
          <div className="grid divide-y divide-neutral-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
            <RecentList title="ATS analyses" empty="No CV readiness checks yet" rows={atsAnalyses.slice(0, 3).map((row) => ({ id: row.id, title: row.sourceFileName, detail: 'CV-only readiness', score: row.overallScore, date: row.createdAt }))} onOpen={openAts} onAll={() => setTab('ats')} />
            <RecentList title="Job matches" empty="No vacancy fit checks yet" rows={jobMatches.slice(0, 3).map((row) => ({ id: row.id, title: row.jobTitle, detail: row.jobCompany, score: row.matchScore, date: row.createdAt }))} onOpen={openMatch} onAll={() => setTab('job_matches')} />
          </div>
        </section>
      </div>
    </>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1"><dt className="text-[11px] font-medium text-white/50">{label}</dt><dd className="truncate text-[11px] font-bold text-white/85">{value}</dd></div>;
}

function MiniStat({ icon: Icon, label, value, sublabel, tint, onClick }: { icon: ComponentType<{ className?: string; strokeWidth?: number }>; label: string; value: string; sublabel?: string; tint: 'purple' | 'cyan' | 'slate'; onClick?: () => void }) {
  const tints = { purple: 'bg-accent-purple/10 text-accent-purple', cyan: 'bg-accent-cyan/10 text-accent-cyan', slate: 'bg-neutral-100 text-neutral-500' };
  const Wrapper = onClick ? 'button' : 'div';
  return <Wrapper {...(onClick ? { type: 'button', onClick } : {})} className={cn('flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left', onClick && 'transition-colors hover:border-neutral-300 hover:bg-neutral-50')}><span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tints[tint])}><Icon className="h-4 w-4" strokeWidth={2.2} /></span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-neutral-500">{label}</p><p className="truncate text-lg font-black tracking-tight text-neutral-900 tabular-nums">{value}</p>{sublabel && <p className="truncate text-xs font-medium text-neutral-400">{sublabel}</p>}</div></Wrapper>;
}

function DigestRow({ icon: Icon, tint, label, value }: { icon: ComponentType<{ className?: string }>; tint: string; label: string; value: string }) {
  return <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tint)}><Icon className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-neutral-500">{label}</p><p className="truncate text-xs font-bold text-neutral-900">{value}</p></div></div>;
}

function RecentList({ title, empty, rows, onOpen, onAll }: { title: string; empty: string; rows: Array<{ id: string; title: string; detail: string; score: number; date: string }>; onOpen: (id: string) => void; onAll: () => void }) {
  return <div className="p-5"><div className="flex items-center justify-between"><h3 className="text-xs font-bold text-neutral-900">{title}</h3><button type="button" onClick={onAll} className="text-[11px] font-bold text-accent-purple hover:underline">View all</button></div>{rows.length ? <div className="mt-3 divide-y divide-neutral-100">{rows.map((row) => <button key={row.id} type="button" onClick={() => onOpen(row.id)} className="flex min-h-14 w-full items-center gap-3 py-3 text-left hover:bg-neutral-50"><span className="w-9 text-sm font-black tabular-nums text-neutral-900">{row.score}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-neutral-900">{row.title}</span><span className="block truncate text-xs text-neutral-400">{row.detail} · {new Date(row.date).toLocaleDateString('en-GB')}</span></span><ArrowRight className="h-3.5 w-3.5 text-neutral-300" /></button>)}</div> : <p className="mt-6 text-xs text-neutral-400">{empty}</p>}</div>;
}

function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);
  return <div className="relative flex h-28 w-28 shrink-0 items-center justify-center"><svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90"><circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="9" /><circle cx="50" cy="50" r={radius} fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} /></svg><div className="absolute flex flex-col items-center"><span className="text-3xl font-black tabular-nums">{score}</span><span className="text-xs font-semibold text-white/50">/100</span></div></div>;
}
