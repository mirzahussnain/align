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
import { getEntitlementSnapshot } from '@/shared/entitlements/server';
import { resolveBillingAccess } from '@/shared/billing/access';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const params = await searchParams;
  const requestedProfile = Array.isArray(params.profile) ? params.profile[0] : params.profile;
  const requestedTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const requestedAnalysis = Array.isArray(params.analysis) ? params.analysis[0] : params.analysis;
  const tabs = ['overview', 'analyze', 'job_match', 'profile', 'ats', 'job_matches', 'cvs', 'billing'] as const;
  const initialTab = tabs.find((tab) => tab === requestedTab);
  const userId = session.user.id;
  const profileId = await resolveProfileId(userId, requestedProfile);

  const [atsAnalyses, jobMatches, cvs, profileData, profiles, entitlements] = await Promise.all([
    prisma.atsAnalysis.findMany({
      where: { userId, OR: [{ profileId }, { profileId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        overallScore: true,
        occupation: true,
        aiEnhanced: true,
        cvRevision: { select: { filename: true } },
      },
    }),
    prisma.jobMatch.findMany({
      where: { userId, profileSnapshot: { sourceProfileId: profileId } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        matchScore: true,
        cvRevision: { select: { filename: true } },
        jobRevision: { select: { title: true, company: true } },
        profileSnapshot: { select: { profileLabel: true } },
      },
    }),
    prisma.generatedCV.findMany({
      where: {
        userId,
        OR: [{ profileId }, { profileSnapshot: { sourceProfileId: profileId } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 250,
      select: {
        id: true,
        template: true,
        title: true,
        createdAt: true,
        jobMatchId: true,
        versionNumber: true,
        sourceCvRevision: { select: { filename: true } },
        jobRevision: { select: { title: true, company: true } },
        jobMatch: { select: { matchScore: true } },
        profileSnapshot: { select: { profileLabel: true } },
        profile: { select: { label: true } },
      },
    }),
    loadProfileData(userId, requestedProfile),
    listProfiles(userId),
    getEntitlementSnapshot(userId),
  ]);

  const [storage, usage, billing] = await Promise.all([
    getStorageUsage(userId, entitlements.plan),
    getUsage(userId),
    resolveBillingAccess(userId),
  ]);
  const reconciliation = entitlements.capabilities.profile_reconciliation;

  return (
    <DashboardShell
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      tier={entitlements.plan.toLowerCase()}
      entitlementSnapshot={entitlements}
      initialTab={initialTab}
      initialAnalysisId={requestedAnalysis}
      data={{
        atsAnalyses: atsAnalyses.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          overallScore: row.overallScore,
          sourceFileName: row.cvRevision.filename,
          occupation: row.occupation,
          aiEnhanced: row.aiEnhanced,
        })),
        jobMatches: jobMatches.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          matchScore: row.matchScore,
          sourceFileName: row.cvRevision.filename,
          jobTitle: row.jobRevision.title,
          jobCompany: row.jobRevision.company,
          profileLabel: row.profileSnapshot.profileLabel,
        })),
        cvs: cvs.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          template: row.template,
          title: row.title,
          jobMatchId: row.jobMatchId,
          versionNumber: row.versionNumber,
          sourceFileName: row.sourceCvRevision?.filename ?? null,
          jobTitle: row.jobRevision?.title ?? null,
          jobCompany: row.jobRevision?.company ?? null,
          matchScore: row.jobMatch?.matchScore ?? null,
          profileLabel: row.profileSnapshot?.profileLabel ?? row.profile?.label ?? null,
        })),
        profile: profileData,
        profiles,
        maxProfiles: entitlements.capabilities.additional_career_profiles.limit ?? 1,
        profileReasoning: reconciliation.allowed,
        reasoningRemaining: reconciliation.mode === 'quota' ? (reconciliation.remaining ?? 0) : reconciliation.allowed ? null : 0,
        storage,
        usage,
        profileComplete: isProfileComplete(profileData),
        profileCompleteness: profileCompleteness(profileData),
        aiAnalysesLimit: entitlements.capabilities.ai_enhanced_ats_analysis.limit ?? null,
        billing: {
          plan: billing.effectivePlan,
          status: billing.status,
          cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
          accessEndsAt: billing.accessEndsAt?.toISOString() ?? null,
          graceEndsAt: billing.graceEndsAt?.toISOString() ?? null,
          checkoutAvailable: billing.checkoutAvailable,
          portalAvailable: billing.portalAvailable,
        },
      }}
    />
  );
}
