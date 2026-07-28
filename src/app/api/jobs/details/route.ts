import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { checkCapability } from '@/shared/entitlements/server';
import { listProfileTargets } from '@/features/dashboard/data/load-profile';
import { resolveJobReference } from '@/shared/services/job-reference';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    const reference = new URL(request.url).searchParams.get('ref') ?? undefined;
    const job = resolveJobReference(reference, session?.user.id ?? null);
    if (!job) throw new APIError('This job link has expired. Return to the Job Board and select it again.', 404);

    if (!session) return NextResponse.json({ job, profiles: [], selectedProfile: null, usage: null, analysis: null });
    const [profiles, usage, candidates] = await Promise.all([
      listProfileTargets(session.user.id),
      checkCapability(session.user.id, 'job_match_analysis'),
      prisma.analysis.findMany({ where: { userId: session.user.id, mode: 'job_match' }, select: { id: true, overallScore: true, createdAt: true, rawResult: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    const selectedProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
    const analysis = candidates.find((candidate) => {
      const provenance = (candidate.rawResult as { jobSourceProvenance?: { canonicalJobId?: string } } | null)?.jobSourceProvenance;
      return provenance?.canonicalJobId === job.canonicalJobId;
    }) ?? null;
    return NextResponse.json({ job, profiles, selectedProfile, usage, analysis: analysis ? { id: analysis.id, score: analysis.overallScore, createdAt: analysis.createdAt, stale: false } : null });
  });
}
