import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { getOrCreateSnapshotFromNormalisedJob } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
const Input = z.object({ job: z.object({ source: z.enum(['ADZUNA', 'REED', 'JOOBLE']), sourceJobId: z.string().min(1), canonicalUrl: z.string().url(), dedupeFingerprint: z.string().min(1), title: z.string().min(1), company: z.string().min(1), locationText: z.string() }).passthrough() });
export async function POST(request: NextRequest) { return withErrorHandler(async () => { const session = await auth.api.getSession({ headers: request.headers }); if (!session) throw new APIError('Please sign in to view vacancy details.', 401); const parsed = Input.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new APIError(parsed.error.message, 400); const snapshot = await getOrCreateSnapshotFromNormalisedJob(parsed.data.job as never); if (!snapshot) throw new APIError('Unable to create the job snapshot.', 500); return NextResponse.json({ jobSnapshotId: snapshot.id }, { status: 201 }); }); }