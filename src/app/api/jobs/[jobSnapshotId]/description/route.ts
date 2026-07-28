import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { attachUserDescription } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
const Input = z.object({ description: z.string().trim().min(50).max(50_000) });
export async function POST(request: NextRequest, context: RouteContext<'/api/jobs/[jobSnapshotId]/description'>) { return withErrorHandler(async () => { const session = await auth.api.getSession({ headers: request.headers }); if (!session) throw new APIError('Please sign in to add a job description.', 401); const parsed = Input.safeParse(await request.json().catch(() => null)); if (!parsed.success) throw new APIError(parsed.error.message, 400); const { jobSnapshotId } = await context.params; const snapshot = await attachUserDescription({ userId: session.user.id, jobSnapshotId, description: parsed.data.description }); if (!snapshot) throw new APIError('Vacancy not found.', 404); return NextResponse.json({ snapshot }); }); }