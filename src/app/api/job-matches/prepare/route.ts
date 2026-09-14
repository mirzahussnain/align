import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { createMatchRequest } from '@/shared/services/job-snapshot';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { ANALYSIS_LIMITS } from '@/shared/config/analysis-domain';

const Input = z.object({
  jobSnapshotId: z.string().min(1),
  profileId: z.string().min(1),
  descriptionOverride: z.string().trim().min(50).max(ANALYSIS_LIMITS.maxJobDescriptionCharacters).optional(),
  partialDescriptionAccepted: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to prepare a Job Match.', 401);
    const parsed = Input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new APIError(parsed.error.message, 400);
    const requestRow = await createMatchRequest({ userId: session.user.id, ...parsed.data });
    if (!requestRow) throw new APIError('Vacancy not found.', 404);
    return NextResponse.json({ matchRequestId: requestRow.id });
  });
}
