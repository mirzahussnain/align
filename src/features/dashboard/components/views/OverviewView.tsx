'use client';

import type { ComponentType } from 'react';
import {
  ArrowRight,
  Sparkles,
  UserRound,
  Gauge,
  FileStack,
  Trophy,
  ListChecks,
  FileSearch,
  TrendingDown,
  Target,
} from 'lucide-react';
import DashboardTopBar from '../DashboardTopBar';
import ScoreTrendChart, { type ScorePoint } from '../ScoreTrendChart';
import AnalysesTable from '../AnalysesTable';
import { useDashboardStore } from '@/shared/stores/dashboard-store';
import type { DashboardData } from '../DashboardShell';
import { profileCompleteness } from '@/features/dashboard/data/profile-completeness';
import { describeAnalysis } from '@/shared/utils/job-title';
import { cn } from '@/shared/utils/cn';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import { getIndustryDictionary, isKnownIndustry } from '@/shared/constants/sector-keywords';

const SENIORITY_LABELS: Record<string, string> = {
  entry: 'Entry-level',
  mid: 'Mid-level',
  senior: 'Senior',
  lead: 'Lead',
};

/** Below this many analyses, a trend line is mostly whitespace — show a digest instead. */
const CHART_MIN_POINTS = 5;

/**
 * A CV can be "ready" without ever being measured against a role; a job match
 * can be "good" without the CV itself being flawless. Conflating the two
 * vocabularies is exactly what made the old hero say "Good match" over an ATS
 * result that had never seen a job description.
 */
function worthiness(mode: string, score: number): { label: string; blurb: string } {
  if (mode === 'job_match') {
    if (score >= 85) return { label: 'Strong match', blurb: 'This CV is ready to lead with for this role.' };
    if (score >= 70) return { label: 'Good match', blurb: 'Solid alignment with this role — a few gaps remain.' };
    if (score >= 50) return { label: 'Stretch match', blurb: 'Meaningful gaps against this specific role.' };
    return { label: 'Weak match', blurb: 'Significant rework needed to fit this role.' };
  }
  if (score >= 90) return { label: 'Excellent readiness', blurb: 'This CV clears ATS checks with little friction.' };
  if (score >= 75) return { label: 'Strong foundation', blurb: 'Solid base — small refinements would strengthen it.' };
  if (score >= 60) return { label: 'Generally ready', blurb: 'Passable, but a few fixes would meaningfully help.' };
  if (score >= 40) return { label: 'Needs targeted improvements', blurb: 'Several gaps are holding this CV back.' };
  return { label: 'Significant work required', blurb: 'This CV needs substantial rework before it clears ATS checks.' };
}

export default function OverviewView({
  user,
  data,
}: {
  user: { name: string };
  data: DashboardData;
}) {
  const setTab = useDashboardStore((s) => s.setTab);
  const openAnalysis = useDashboardStore((s) => s.openAnalysis);
  const {
    analyses,
    totalAnalyses,
    cvs,
    profile,
    usage,
    aiAnalysesLimit,
    profileComplete,
    heroAnalysis,
    heroPrevious,
    heroInsight,
    readinessSplit,
  } = data;

  const chronological = [...analyses].slice(0, 12).reverse();
  const chartData: ScorePoint[] = chronological.map((a) => ({
    date: new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    jobMatch: a.mode === 'job_match' ? a.overallScore : null,
    ats: a.mode === 'job_match' ? null : a.overallScore,
  }));

  const completeness = profileCompleteness(profile);

  // The dashboard's own answer to "which career track am I looking at" — the
  // ROLE, not the track's internal name. This matters because a track is
  // still commonly labelled "Default" (nothing auto-suggests a name yet), so
  // leading with that label here would repeat the least meaningful string on
  // the page instead of telling the user what they're actually targeting.
  const targetRole =
    profile.personal.targetRoleTitle ||
    (isKnownOccupation(profile.personal.targetOccupation)
      ? getOccupationProfile(profile.personal.targetOccupation).label
      : '');
  const seniorityLabel = SENIORITY_LABELS[profile.personal.targetSeniority] ?? '';
  const sectorLabel = isKnownIndustry(profile.targetIndustry)
    ? (getIndustryDictionary(profile.targetIndustry)?.label ?? '')
    : '';
  const careerTargetSub = [seniorityLabel, sectorLabel].filter(Boolean).join(' · ');

  const bestAnalysis = analyses.length
    ? analyses.reduce((topScore, a) => (a.overallScore > topScore.overallScore ? a : topScore))
    : null;

  const analysesRemaining = aiAnalysesLimit === null ? null : Math.max(0, aiAnalysesLimit - usage.aiAnalyses);

  // Rule-based, derived only from state we actually have — never invents a
  // "gap" or "risk" the engine hasn't scored. Ordered by blocker severity:
  // nothing to work with, then profile, then artifact generation, then polish.
  const nextSteps: { title: string; detail: string; action: () => void; cta: string; icon: ComponentType<{ className?: string }> }[] = [];
  if (totalAnalyses === 0) {
    nextSteps.push({
      title: 'Run your first analysis',
      detail: 'Upload a CV to get an ATS score, or add a job description to see how you match it.',
      action: () => setTab('analyze'),
      cta: 'Analyze CV',
      icon: FileSearch,
    });
  }
  if (!profileComplete) {
    nextSteps.push({
      title: `Finish Profile — ${profile.label}`,
      detail: `Your career track is ${completeness}% complete — finish it to unlock CV generation.`,
      action: () => setTab('profile'),
      cta: 'Complete profile',
      icon: UserRound,
    });
  }
  if (totalAnalyses > 0 && cvs.length === 0) {
    nextSteps.push({
      title: 'Generate a tailored CV',
      detail: bestAnalysis
        ? `Build from your best result — ${describeAnalysis(bestAnalysis)} scored ${bestAnalysis.overallScore}/100.`
        : 'Turn your best analysis into a ready-to-send CV.',
      action: () => setTab('cvs'),
      cta: 'Generate CV',
      icon: FileStack,
    });
  }
  const lowAts = readinessSplit.avgAtsScore !== null && readinessSplit.avgAtsScore < 70;
  const lowMatch = readinessSplit.avgJobMatchScore !== null && readinessSplit.avgJobMatchScore < 70;
  if (lowAts || lowMatch) {
    nextSteps.push({
      title: 'Improve your weaker scores',
      detail: [
        lowAts ? `ATS average sits at ${Math.round(readinessSplit.avgAtsScore!)}/100` : null,
        lowMatch ? `job-match average sits at ${Math.round(readinessSplit.avgJobMatchScore!)}/100` : null,
      ]
        .filter(Boolean)
        .join(', ') + ' — re-run analysis after tightening weak sections.',
      action: () => setTab('analyze'),
      cta: 'Re-analyze',
      icon: TrendingDown,
    });
  }
  if (nextSteps.length === 0) {
    nextSteps.push({
      title: 'Keep momentum going',
      detail: 'Run a fresh analysis against a new role to keep your score history current.',
      action: () => setTab('analyze'),
      cta: 'New analysis',
      icon: ListChecks,
    });
  }

  const heroKind: 'job_match' | 'ats' | 'empty' = !heroAnalysis
    ? 'empty'
    : heroAnalysis.mode === 'job_match'
      ? 'job_match'
      : 'ats';
  const heroTitle = heroKind === 'job_match' ? 'Application readiness' : 'CV readiness';
  const heroWorthiness = heroAnalysis ? worthiness(heroAnalysis.mode, heroAnalysis.overallScore) : null;
  const scoreDelta = heroAnalysis && heroPrevious ? heroAnalysis.overallScore - heroPrevious.overallScore : null;

  // The hero's CTA is about the hero's OWN result, never a repeat of the
  // profile-completion ask that already lives in the banner and next steps —
  // that stays as a small note when it would otherwise block the action.
  const heroCta =
    heroKind === 'job_match'
      ? profileComplete
        ? { label: 'Tailor CV', onClick: () => setTab('cvs') }
        : { label: 'View match breakdown', onClick: () => openAnalysis(heroAnalysis!.id) }
      : heroKind === 'ats'
        ? { label: 'View breakdown', onClick: () => openAnalysis(heroAnalysis!.id) }
        : null;
  const heroNote =
    heroAnalysis && !profileComplete
      ? heroKind === 'job_match'
        ? 'Complete your profile to unlock CV generation.'
        : 'Complete your profile to generate a tailored CV from this.'
      : null;

  // Job-match facts are requirement-native (mandatory match, primary gap) —
  // never a raw dictionary miss count, which conflates "not in our keyword
  // list" with "actually required" and reads as alarming without being
  // actionable. ATS facts describe the CV itself, since there's no role to
  // measure against.
  const heroFacts =
    heroKind === 'job_match'
      ? [
          heroInsight?.occupationLabel ? { label: 'Evaluation type', value: heroInsight.occupationLabel } : null,
          heroInsight?.essentialTotal
            ? { label: 'Essential requirements', value: `${heroInsight.essentialMatched} of ${heroInsight.essentialTotal}` }
            : null,
          heroInsight?.primaryGap ? { label: 'Primary gap', value: heroInsight.primaryGap } : null,
          heroInsight?.domainStatus && heroInsight.domainStatus !== 'aligned'
            ? {
                label: 'Domain fit',
                value: heroInsight.domainStatus === 'partial' ? 'Partial overlap' : 'Mismatch flagged',
              }
            : null,
        ]
          .filter((f): f is { label: string; value: string } => f !== null)
          .slice(0, 3)
      : [
          heroInsight?.occupationLabel ? { label: 'Evaluation type', value: heroInsight.occupationLabel } : null,
          heroInsight?.weakestCategoryLabel ? { label: 'Top weak area', value: heroInsight.weakestCategoryLabel } : null,
          heroInsight?.credentialsStatus
            ? { label: 'Credentials', value: heroInsight.credentialsStatus === 'ready' ? 'Ready' : 'Needs attention' }
            : null,
        ].filter((f): f is { label: string; value: string } => f !== null);

  // Mode-appropriate digest for the low-data state — never a blended average,
  // never claims a "recurring" pattern from a single data point, and never
  // repeats whatever number the hero card already led with.
  const digestRows = (() => {
    if (totalAnalyses === 0) return [];
    const { jobMatchCount, latestAtsScore, bestJobMatchScore } = readinessSplit;

    const generatedCvRow = {
      icon: FileStack,
      tint: 'bg-accent-purple/10 text-accent-purple',
      label: 'Application documents',
      value: cvs.length > 0 ? `${cvs.length} ready` : 'None yet — generate one from this result',
    };
    const strongestCategoryRow = heroInsight?.strongestCategoryLabel
      ? { icon: Trophy, tint: 'bg-emerald-100 text-emerald-600', label: 'Strongest CV category', value: heroInsight.strongestCategoryLabel }
      : null;

    if (heroKind === 'job_match') {
      return [
        readinessSplit.atsCount > 0
          ? { icon: Gauge, tint: 'bg-accent-cyan/10 text-accent-cyan', label: 'Latest CV readiness', value: `${latestAtsScore}/100` }
          : { icon: Gauge, tint: 'bg-accent-cyan/10 text-accent-cyan', label: 'CV readiness', value: 'Run an ATS check to see this' },
        strongestCategoryRow,
        generatedCvRow,
      ].filter((r): r is NonNullable<typeof r> => r !== null);
    }

    // heroKind === 'ats': the hero already shows its own score, so lead with
    // the job-match side and the category strength the hero doesn't mention.
    return [
      jobMatchCount > 0
        ? { icon: Trophy, tint: 'bg-amber-100 text-amber-600', label: 'Best job match', value: `${bestJobMatchScore}/100` }
        : { icon: Trophy, tint: 'bg-amber-100 text-amber-600', label: 'Job match', value: 'Add a job description to see this' },
      strongestCategoryRow,
      generatedCvRow,
    ].filter((r): r is NonNullable<typeof r> => r !== null);
  })();

  return (
    <>
      <DashboardTopBar
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle={`Viewing career track: ${profile.label}`}
      />

      <div className="flex flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        {/* Row 1 — one dominant insight, everything else supports it. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(262_55%_16%)] via-[hsl(250_50%_14%)] to-[hsl(199_55%_14%)] p-6 text-white lg:col-span-3">
            <div
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent-cyan/20 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-20 -left-10 h-52 w-52 rounded-full bg-accent-purple/25 blur-3xl"
              aria-hidden
            />

            <div className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-white/60">
              <Sparkles className="h-3.5 w-3.5" />
              {heroKind === 'empty' ? 'Application readiness' : heroTitle}
            </div>

            {heroAnalysis && heroWorthiness ? (
              <div className="relative mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
                <ScoreRing score={heroAnalysis.overallScore} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                      {heroWorthiness.label}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70">
                      {heroKind === 'job_match' ? 'Job match' : 'ATS check'}
                    </span>
                    {scoreDelta !== null && (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          scoreDelta >= 0 ? 'bg-emerald-400/20 text-emerald-300' : 'bg-rose-400/20 text-rose-300'
                        )}
                      >
                        {scoreDelta >= 0 ? '+' : ''}
                        {scoreDelta} vs previous {heroKind === 'job_match' ? 'match' : 'ATS check'}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 truncate text-sm font-semibold text-white/90">
                    {describeAnalysis(heroAnalysis)}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">{heroWorthiness.blurb}</p>

                  {heroFacts.length > 0 && (
                    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                      {heroFacts.map((f) => (
                        <div key={f.label} className="flex items-center justify-between gap-3 border-b border-white/10 py-1 sm:justify-start">
                          <dt className="text-[11px] font-medium text-white/50">{f.label}</dt>
                          <dd className="truncate text-[11px] font-bold text-white/85 sm:ml-auto">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {heroCta && (
                      <button
                        type="button"
                        onClick={heroCta.onClick}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-[hsl(262_55%_18%)] transition-transform hover:scale-[1.02]"
                      >
                        {heroCta.label}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {heroNote && <p className="text-[11px] text-white/50">{heroNote}</p>}
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative mt-4">
                <p className="text-2xl font-black tracking-tight">No analyses yet</p>
                <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-white/60">
                  Run your first CV analysis to see your readiness score here.
                </p>
                <button
                  type="button"
                  onClick={() => setTab('analyze')}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-xs font-bold text-[hsl(262_55%_18%)] transition-transform hover:scale-[1.02]"
                >
                  Analyze your CV
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </section>

          {/* Right stack — supporting metrics, deliberately smaller than the hero.
              Profile completeness isn't repeated here — the banner above already
              owns that number; this space is for facts the banner doesn't carry. */}
          <div className="flex flex-col gap-3 lg:col-span-2">
            <MiniStat
              icon={Target}
              label="Current career target"
              value={targetRole || 'Not set yet'}
              tint="slate"
              sublabel={careerTargetSub || 'Set your target role in Profile'}
              onClick={() => setTab('profile')}
            />
            <MiniStat
              icon={Gauge}
              label="Applications analysed"
              value={String(totalAnalyses)}
              tint="cyan"
              sublabel={
                analysesRemaining === null
                  ? `${usage.aiAnalyses} used this month`
                  : `${usage.aiAnalyses} used, ${analysesRemaining} left this month`
              }
            />
            <MiniStat
              icon={FileStack}
              label="Application documents"
              value={cvs.length > 0 ? `${cvs.length} ready` : '0 ready'}
              tint="purple"
              sublabel={cvs.length === 0 ? 'Generate your first tailored CV' : 'All time'}
              onClick={() => setTab('cvs')}
            />
          </div>
        </div>

        {/* Row 2 — trend once there's enough history, a digest until then; plus next steps. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-3">
            {chartData.length >= CHART_MIN_POINTS ? (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">Score over time</h2>
                    <p className="mt-0.5 text-xs text-neutral-400">Last {chartData.length} analyses</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab('analyses')}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
                  >
                    View all
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-4">
                  <ScoreTrendChart data={chartData} />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-bold text-neutral-900">Your progress so far</h2>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {totalAnalyses === 0
                    ? 'Run an analysis to start building your history.'
                    : `A trend line needs ${CHART_MIN_POINTS}+ analyses — here's the digest until then.`}
                </p>
                {digestRows.length > 0 && (
                  <div className="mt-4 flex flex-col divide-y divide-neutral-100">
                    {digestRows.map((row) => (
                      <DigestRow key={row.label} icon={row.icon} tint={row.tint} label={row.label} value={row.value} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-accent-purple" />
              <h2 className="text-sm font-bold text-neutral-900">Recommended next steps</h2>
            </div>
            <ul className="mt-4 flex flex-col gap-3">
              {nextSteps.slice(0, 4).map((step) => (
                <li key={step.title} className="flex gap-3 rounded-xl bg-neutral-50 p-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-purple/10 text-accent-purple">
                    <step.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-neutral-900">{step.title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">{step.detail}</p>
                    <button
                      type="button"
                      onClick={step.action}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-accent-purple hover:underline"
                    >
                      {step.cta}
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Row 3 — one table instead of a table plus an overlapping activity feed. */}
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4">
            <div>
              <h2 className="text-sm font-bold text-neutral-900">Recent analyses</h2>
              {totalAnalyses > 0 && (
                <p className="mt-0.5 text-xs text-neutral-400">
                  Showing {Math.min(5, totalAnalyses)} of {totalAnalyses}
                </p>
              )}
            </div>
            {totalAnalyses > 5 && (
              <button
                type="button"
                onClick={() => setTab('analyses')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                View all
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>

          <AnalysesTable rows={analyses.slice(0, 5)} />
        </section>
      </div>
    </>
  );
}

/** Compact supporting-metric card — deliberately quieter than the hero card. */
function MiniStat({
  icon: Icon,
  label,
  value,
  sublabel,
  tint,
  onClick,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  sublabel?: string;
  tint: 'purple' | 'cyan' | 'slate';
  onClick?: () => void;
}) {
  const tints = {
    purple: 'bg-accent-purple/10 text-accent-purple',
    cyan: 'bg-accent-cyan/10 text-accent-cyan',
    slate: 'bg-neutral-100 text-neutral-500',
  } as const;

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      {...(onClick ? { type: 'button', onClick } : {})}
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left',
        onClick && 'transition-colors hover:border-neutral-300 hover:bg-neutral-50'
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', tints[tint])}>
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold text-neutral-500">{label}</p>
        <p className="truncate text-lg font-black tracking-tight text-neutral-900 tabular-nums">{value}</p>
        {sublabel && <p className="truncate text-[10px] font-medium text-neutral-400">{sublabel}</p>}
      </div>
    </Wrapper>
  );
}

function DigestRow({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  tint: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tint)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-neutral-500">{label}</p>
        <p className="truncate text-xs font-bold text-neutral-900">{value}</p>
      </div>
    </div>
  );
}

/** Small ring chart, built inline rather than pulling in a charting dep for one shape. */
function ScoreRing({ score }: { score: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="white"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-black tabular-nums">{score}</span>
        <span className="text-[10px] font-semibold text-white/50">/100</span>
      </div>
    </div>
  );
}
