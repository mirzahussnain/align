import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { saveJobForUser, unsaveJobForUser } from '@/shared/services/saved-job';
import { assessAndPersistJobIntelligence } from '@/shared/services/job-intelligence-store';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

const SavedJobInput = z.object({
  jobSnapshotId: z.string().min(1).max(128),
  profileId: z.string().min(1).max(128).optional(),
}).strict();

export async function GET(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view saved jobs.', 401);
    const jobs = await prisma.savedJob.findMany({
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
    if (!parsed.success) throw new APIError('Invalid save request.', 400);
    const result = await saveJobForUser({ userId: session.user.id, ...parsed.data });
    await assessAndPersistJobIntelligence({ jobSnapshotId: result.savedJob.jobSnapshotId, userId: session.user.id });
    return NextResponse.json({ saved: { id: result.savedJob.id, jobSnapshotId: result.savedJob.jobSnapshotId, canonicalIdentity: result.savedJob.jobSnapshot.dedupeFingerprint } }, { status: result.created ? 201 : 200 });
  });
}

export async function DELETE(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to remove a saved job.', 401);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) throw new APIError('Saved job id is required.', 400);
    await unsaveJobForUser({ userId: session.user.id, savedJobId: id });
    return NextResponse.json({ ok: true });
  });
}