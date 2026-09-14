import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { claimPublicAtsDemo, PUBLIC_ATS_COOKIE } from '@/shared/services/public-ats-service';

export async function POST(request: NextRequest) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to save this ATS result.', 401);
    const token = request.cookies.get(PUBLIC_ATS_COOKIE)?.value;
    if (!token) throw new APIError('No ATS demo is available to claim.', 404);
    const analysisId = await claimPublicAtsDemo({ userId: session.user.id, token });
    const response = NextResponse.json({ analysisId }, { status: 201 });
    response.cookies.delete(PUBLIC_ATS_COOKIE);
    return response;
  });
}
