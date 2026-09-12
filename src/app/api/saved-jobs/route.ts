import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { checkCapability, EntitlementRequiredError } from '@/shared/entitlements/server';
import { getOrCreateSnapshotFromNormalisedJob, removeSavedJob, saveSnapshotForUser } from '@/shared/services/job-snapshot';
import { assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const SavedJobInput = z.object({ profileId: z.string().optional(), job: z.object({ source: z.enum(['ADZUNA', 'REED', 'JOOBLE']), sourceJobId: z.string().min(1), canonicalUrl: z.string().url(), dedupeFingerprint: z.string().min(1), title: z.string().min(1).max(500), company: z.string().min(1).max(500), locationText: z.string().max(500) }).passthrough() });

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view saved jobs.', 401);
    const jobs = await (await import('@/shared/lib/prisma')).prisma.savedJob.findMany({
      where: { userId: session.user.id }, orderBy: { savedAt: 'desc' },
      select: { id: true, profileId: true, savedAt: true, applicationStatus: true, jobSnapshot: { select: { id: true, dedupeFingerprint: true, title: true, employerName: true, locationText: true } } },
    });
    return NextResponse.json({ jobs: jobs.map((row) => ({ id: row.id, profileId: row.profileId, savedAt: row.savedAt, applicationStatus: row.applicationStatus, jobSnapshotId: row.jobSnapshot.id, canonicalIdentity: row.jobSnapshot.dedupeFingerprint, title: row.jobSnapshot.title, company: row.jobSnapshot.employerName, locationText: row.jobSnapshot.locationText })) });
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to save a job.', 401);
    const parsed = SavedJobInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    if (parsed.data.profileId) {
      const { prisma } = await import('@/shared/lib/prisma');
      const profile = await prisma.profile.findFirst({ where: { id: parsed.data.profileId, userId: session.user.id }, select: { id: true } });
      if (!profile) throw new APIError('Career Track not found.', 404);
    }
    const snapshot = await getOrCreateSnapshotFromNormalisedJob(parsed.data.job as never);
    if (!snapshot) throw new APIError('Unable to create the job snapshot.', 500);
    const { prisma } = await import('@/shared/lib/prisma');
    const existing = await prisma.savedJob.findUnique({ where: { userId_jobSnapshotId: { userId: session.user.id, jobSnapshotId: snapshot.id } } });
    if (!existing) {
      const decision = await checkCapability(session.user.id, 'saved_jobs');
      if (!decision.allowed) throw new EntitlementRequiredError(decision);
    }
    await assessAndPersistJobIntelligence({ jobSnapshotId: snapshot.id, userId: session.user.id });
    const saved = await saveSnapshotForUser({ userId: session.user.id, jobSnapshotId: snapshot.id, profileId: parsed.data.profileId });
    return NextResponse.json({ saved: { id: saved.id, jobSnapshotId: saved.jobSnapshotId, canonicalIdentity: saved.jobSnapshot.dedupeFingerprint } }, { status: existing ? 200 : 201 });
  });
}

export async function DELETE(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to remove a saved job.', 401);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new APIError('Saved job id is required.', 400);
    await removeSavedJob(session.user.id, id);
    return NextResponse.json({ ok: true });
  });
}