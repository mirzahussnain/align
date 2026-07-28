import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { checkCapability, EntitlementRequiredError } from '@/shared/entitlements/server';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const SavedJobInput = z.object({
  profileId: z.string().optional(),
  job: z.object({
    source: z.enum(['ADZUNA', 'REED', 'JOOBLE']), sourceJobId: z.string().min(1), canonicalUrl: z.string().url(), dedupeFingerprint: z.string().min(1),
    title: z.string().min(1).max(500), company: z.string().min(1).max(500), locationText: z.string().max(500),
  }).passthrough(),
});

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view saved jobs.', 401);
    // The stored `jobSnapshot` blob is deliberately not selected. Every caller
    // wants "which of these results have I saved, and under which id" — the
    // board reconciles its own already-loaded jobs by `canonicalIdentity` — so
    // returning a full vacancy payload per row would ship the whole saved list's
    // descriptions on every Job Board load to answer a set-membership question.
    const jobs = await prisma.savedJob.findMany({
      where: { userId: session.user.id },
      orderBy: { savedAt: 'desc' },
      select: {
        id: true, profileId: true, primaryProvider: true, sourceJobId: true,
        canonicalUrl: true, canonicalIdentity: true, title: true, company: true,
        locationText: true, availabilityStatus: true, savedAt: true,
      },
    });
    return NextResponse.json({ jobs });
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to save a job.', 401);
    const parsed = SavedJobInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const { job, profileId } = parsed.data;
    if (profileId) {
      const profile = await prisma.profile.findFirst({ where: { id: profileId, userId: session.user.id }, select: { id: true } });
      if (!profile) throw new APIError('Career Track not found.', 404);
    }
    const existing = await prisma.savedJob.findUnique({ where: { userId_canonicalIdentity: { userId: session.user.id, canonicalIdentity: job.dedupeFingerprint } } });
    if (!existing) {
      const decision = await checkCapability(session.user.id, 'saved_jobs');
      if (!decision.allowed) throw new EntitlementRequiredError(decision);
    }
    const saved = await prisma.savedJob.upsert({
      where: { userId_canonicalIdentity: { userId: session.user.id, canonicalIdentity: job.dedupeFingerprint } },
      create: { userId: session.user.id, profileId, primaryProvider: job.source, sourceJobId: job.sourceJobId, canonicalUrl: job.canonicalUrl, canonicalIdentity: job.dedupeFingerprint, title: job.title, company: job.company, locationText: job.locationText, jobSnapshot: JSON.parse(JSON.stringify(job)), availabilityStatus: 'UNKNOWN' },
      update: { profileId: profileId ?? undefined, canonicalUrl: job.canonicalUrl, title: job.title, company: job.company, locationText: job.locationText, jobSnapshot: JSON.parse(JSON.stringify(job)), snapshotVersion: { increment: 1 } },
    });
    return NextResponse.json({ saved }, { status: existing ? 200 : 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to remove a saved job.', 401);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new APIError('Saved job id is required.', 400);
    await prisma.savedJob.deleteMany({ where: { id, userId: session.user.id } });
    return NextResponse.json({ ok: true });
  });
}