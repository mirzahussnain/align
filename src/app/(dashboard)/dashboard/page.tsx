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
import { entitlementsFor } from '@/shared/lib/entitlements';
import { getStorageUsage } from '@/shared/services/storage-quota';
import { getUsage } from '@/shared/services/usage-meter';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const userId = session.user.id;
  const sessionTier =
    (session.user as typeof session.user & { subscriptionTier?: string | null }).subscriptionTier ??
    'free';

  // Switching career track is a soft navigation to ?profile=<id>, so the
  // server reloads that profile's content while client tab state survives.
  const requestedProfile = (await searchParams).profile;
  const activeProfileId = Array.isArray(requestedProfile) ? requestedProfile[0] : requestedProfile;

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
      },
    }),
    prisma.analysis.aggregate({
      where: scope,
      _avg: { overallScore: true },
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

  const entitlements = entitlementsFor(sessionTier);
  const [storage, usage] = await Promise.all([
    getStorageUsage(userId, sessionTier),
    getUsage(userId),
  ]);

  // Surfaced in the wizard so the reasoning opt-in can say how many runs are
  // left, rather than letting the user pick it and then fail at the API.
  const reasoningCap = entitlements.monthlyLimits.profileReasoning;
  const reasoningRemaining =
    reasoningCap === null ? null : Math.max(0, reasoningCap - usage.profileReasoning);

  return (
    <DashboardShell
      user={{ name: session.user.name, email: session.user.email, image: session.user.image }}
      tier={sessionTier}
      data={{
        analyses: analyses.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
        avgScore: scoreAgg._avg.overallScore,
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
        maxProfiles: entitlements.maxProfiles,
        profileReasoning: entitlements.profileReasoning,
        reasoningRemaining,
        usage,
        profileComplete: isProfileComplete(profileData),
        profileCompleteness: profileCompleteness(profileData),
        storage,
      }}
    />
  );
}
