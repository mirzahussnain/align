import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { withErrorHandler, APIError } from '@/shared/utils/api-error';
import { cvRevisionDownloadUrl } from '@/shared/services/cv-revision';

export async function GET(request: NextRequest, context: RouteContext<'/api/cv-revisions/[id]/download'>) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to download this CV.', 401);
    const { id } = await context.params;
    return NextResponse.redirect(await cvRevisionDownloadUrl(session.user.id, id));
  });
}
