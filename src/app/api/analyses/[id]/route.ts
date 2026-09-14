import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

/**
 * Read-only migration bridge for old bookmarks. New clients use the dedicated
 * ATS and Job Match resources; no generic analysis is read or written here.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view this result.', 401);
    const { id } = await params;
    const [ats, match] = await Promise.all([
      prisma.atsAnalysis.findFirst({ where: { id, userId: session.user.id }, select: { id: true } }),
      prisma.jobMatch.findFirst({ where: { id, userId: session.user.id }, select: { id: true } }),
    ]);
    if (!ats && !match) throw new APIError('Result not found.', 404);
    const destination = ats ? `/api/ats-analyses/${id}` : `/api/job-matches/${id}`;
    return NextResponse.redirect(new URL(destination, request.url), 308);
  });
}
