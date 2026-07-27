import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import DashboardShell from '@/features/dashboard/components/DashboardShell';
import {
  loadProfileData,
  listProfiles,
  isProfileComplete,
  profileCompleteness,
  resolveProfileId,
} from '@/features/dashboard/data/load-profile';
import { getStorageUsage } from '@/shared/services/storage-quota';
import { getUsage } from '@/shared/services/usage-meter';
import { parseStoredAnalysisResult } from '@/shared/schemas/analysis-result';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import { parseStoredJobMatchData } from '@/shared/schemas/ai-output';
import { getRequirementSummary } from '@/shared/utils/job-match-view';
import type { CategoryScore } from '@/shared/types/cv';
import { getEntitlementSnapshot } from '@/shared/entitlements/server';
import { resolveBillingAccess } from '@/shared/billing/access';

/** Best-scoring non-excellent-only pick — direction flips which end of the sort wins. */
function pickCategory(categories: CategoryScore[], direction: 'weakest' | 'strongest') {
  const ranked = categories
    .filter((c) => c.maxScore > 0)
    .sort((a, b) => a.score / a.maxScore - b.score / b.maxScore);
  if (direction === 'weakest') return ranked.find((c) => c.status !== 'excellent') ?? null;
  return [...ranked].reverse().find((c) => c.status === 'excellent') ?? null;
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userId = session.user.id;

  // Switching career track is a soft navigation to ?profile=<id>, so the
  // server reloads that profile's content while client tab state survives.
  const resolvedSearchParams = await searchParams;
  const requestedProfile = resolvedSearchParams.profile;
  const activeProfileId = Array.isArray(requestedProfile) ? requestedProfile[0] : requestedProfile;

  // A checkout return (or the upgrade CTA) deep-links straight to the billing tab.
  const requestedTab = Array.isArray(resolvedSearchParams.tab) ? resolvedSearchParams.tab[0] : resolvedSearchParams.tab;
  const initialTab = requestedTab === 'billing' ? ('billing' as const) : undefined;

  // Resolved before the queries because everything below is scoped to it, and
  // because an id belonging to another user must be rejected rather than used.
  const scopedProfileId = await resolveProfileId(userId, activeProfileId);

  /**
   * History is filed per career track, so the engineering profile doesn't list
   * warehouse matches. Rows with a null `profileId` are included in every track:
   * they are analyses whose profile was later deleted, and hiding them would
   * look to the user like their history had silently disappeared.
   */
  const scope = { userId, OR: [{ profileId: scopedProfileId }, { profileId: null }] };

  const [analyses, scoreAgg, cvs, profileData, profiles] = await Promise.all([
    prisma.analysis.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        mode: true,
        overallScore: true,
        sourceFileName: true,
        jobTitle: true,
        jobCompany: true,
        occupation: true,
      },
    }),
    prisma.analysis.aggregate({
      where: scope,
      _count: { _all: true },
    }),
    prisma.generatedCV.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        template: true,
        title: true,
        createdAt: true,
        analysisId: true,
        // Provenance for the card's pills: which CV this was rewritten from, and
        // which role it was targeted at. `data` is deliberately NOT selected —
        // the title column exists precisely so listing CVs stays cheap.
        analysis: {
          select: {
            sourceFileName: true,
            jobTitle: true,
            jobCompany: true,
            overallScore: true,
          },
        },
        profile: { select: { label: true } },
      },
    }),
    loadProfileData(userId, activeProfileId),
    listProfiles(userId),
  ]);

  const entitlementSnapshot = await getEntitlementSnapshot(userId);
  const [storage, usage, billingAccess] = await Promise.all([
    getStorageUsage(userId, entitlementSnapshot.plan),
    getUsage(userId),
    resolveBillingAccess(userId),
  ]);

  // Surfaced in the wizard so the reasoning opt-in can say how many runs are
  // left, rather than letting the user pick it and then fail at the API.
  const profileReconciliation = entitlementSnapshot.capabilities.profile_reconciliation;
  const reasoningRemaining = profileReconciliation.mode === 'quota'
    ? profileReconciliation.remaining ?? 0
    : profileReconciliation.allowed
      ? null
      : 0;

  /**
   * A job-match score and an ATS score answer different questions — "will this
   * beat the competition for THIS role" vs "will this clear a parser at all" —
   * so they must never be blended into one number or one hero label. The hero
   * always prefers the most recent job match (it's the closer proxy for
   * "application readiness"); only when none exists does the ATS result stand
   * in, and it's labelled as CV readiness rather than application readiness.
   */
  const jobMatchAnalyses = analyses.filter((a) => a.mode === 'job_match');
  const atsAnalyses = analyses.filter((a) => a.mode !== 'job_match');
  const heroAnalysis = jobMatchAnalyses[0] ?? atsAnalyses[0] ?? null;
  const heroPrevious = heroAnalysis
    ? (heroAnalysis.mode === 'job_match' ? jobMatchAnalyses : atsAnalyses).find((a) => a.id !== heroAnalysis.id) ??
      null
    : null;

  const average = (rows: typeof analyses) =>
    rows.length ? rows.reduce((sum, a) => sum + a.overallScore, 0) / rows.length : null;
  const best = (rows: typeof analyses) =>
    rows.length ? rows.reduce((top, a) => (a.overallScore > top.overallScore ? a : top)) : null;

  const readinessSplit = {
    atsCount: atsAnalyses.length,
    jobMatchCount: jobMatchAnalyses.length,
    avgAtsScore: average(atsAnalyses),
    avgJobMatchScore: average(jobMatchAnalyses),
    latestAtsScore: atsAnalyses[0]?.overallScore ?? null,
    bestJobMatchScore: best(jobMatchAnalyses)?.overallScore ?? null,
  };

  // One extra, targeted read of the hero's own stored result — cheap (single
  // row) and lets the hero surface real engine output instead of decorating
  // the score with nothing. Job-match facts come from the structured
  // canonical requirement ledger, never from a
  // raw dictionary miss count — that number conflates "not in our keyword
  // list" with "actually required for this role" and reads as alarming
  // (hundreds of "missing" terms) without being actionable.
  let heroInsight: {
    occupationLabel: string | null;
    weakestCategoryLabel: string | null;
    strongestCategoryLabel: string | null;
    credentialsStatus: 'ready' | 'attention' | null;
    essentialMatched: number | null;
    essentialTotal: number | null;
    primaryGap: string | null;
    domainStatus: 'aligned' | 'partial' | 'mismatch' | null;
  } | null = null;

  if (heroAnalysis) {
    const heroRow = await prisma.analysis.findUnique({
      where: { id: heroAnalysis.id },
      select: { rawResult: true, jobMatchData: true },
    });
    const parsed = heroRow ? parseStoredAnalysisResult(heroRow.rawResult) : null;
    const categories = parsed?.result.categories ?? [];
    // Legacy (pre-rebuild) rows carry the old dictionary-era category labels —
    // surfacing those would undo the "evidence coverage" rebrand, so category
    // facts are simply withheld on legacy rows rather than shown stale.
    const weakest = parsed && !parsed.legacy ? pickCategory(categories, 'weakest') : null;
    const strongest = parsed && !parsed.legacy ? pickCategory(categories, 'strongest') : null;
    const credentials = categories.find((c) => c.id === 'credentials') ?? null;

    let essentialMatched: number | null = null;
    let essentialTotal: number | null = null;
    let primaryGap: string | null = null;
    let domainStatus: 'aligned' | 'partial' | 'mismatch' | null = null;

    if (heroAnalysis.mode === 'job_match' && heroRow) {
      const jobMatch = parseStoredJobMatchData(heroRow.jobMatchData);
      if (jobMatch) {
        const summary = getRequirementSummary(jobMatch);
        essentialMatched = summary.essentialMatched;
        essentialTotal = summary.essentialTotal;
        primaryGap = summary.primaryGap;
        domainStatus = summary.domainStatus;
      }
    }

    heroInsight = {
      occupationLabel: isKnownOccupation(heroAnalysis.occupation)
        ? getOccupationProfile(heroAnalysis.occupation).label
        : null,
      weakestCategoryLabel: weakest?.label || null,
      strongestCategoryLabel: strongest?.label || null,
      credentialsStatus: credentials ? (credentials.status === 'excellent' || credentials.status === 'good' ? 'ready' : 'attention') : null,
      essentialMatched,
      essentialTotal,
      primaryGap,
      domainStatus,
    };
  }

  return (
    <DashboardShell
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      tier={entitlementSnapshot.plan.toLowerCase()}
      entitlementSnapshot={entitlementSnapshot}
      initialTab={initialTab}
      data={{
        analyses: analyses.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
        totalAnalyses: scoreAgg._count._all,
        cvs: cvs.map(({ analysis, profile, ...c }) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
          sourceFileName: analysis?.sourceFileName ?? null,
          jobTitle: analysis?.jobTitle ?? null,
          jobCompany: analysis?.jobCompany ?? null,
          matchScore: analysis?.overallScore ?? null,
          profileLabel: profile?.label ?? null,
        })),
        profile: profileData,
        profiles,
        maxProfiles: entitlementSnapshot.capabilities.additional_career_profiles.limit ?? 1,
        profileReasoning: profileReconciliation.allowed,
        reasoningRemaining,
        usage,
        profileComplete: isProfileComplete(profileData),
        profileCompleteness: profileCompleteness(profileData),
        aiAnalysesLimit: entitlementSnapshot.capabilities.ai_enhanced_ats_analysis.limit ?? null,
        storage,
        billing: {
          plan: billingAccess.effectivePlan,
          status: billingAccess.status,
          cancelAtPeriodEnd: billingAccess.cancelAtPeriodEnd,
          accessEndsAt: billingAccess.accessEndsAt?.toISOString() ?? null,
          graceEndsAt: billingAccess.graceEndsAt?.toISOString() ?? null,
          checkoutAvailable: billingAccess.checkoutAvailable,
          portalAvailable: billingAccess.portalAvailable,
        },
        heroAnalysis: heroAnalysis
          ? { ...heroAnalysis, createdAt: heroAnalysis.createdAt.toISOString() }
          : null,
        heroPrevious: heroPrevious
          ? { ...heroPrevious, createdAt: heroPrevious.createdAt.toISOString() }
          : null,
        heroInsight,
        readinessSplit,
      }}
    />
  );
}
