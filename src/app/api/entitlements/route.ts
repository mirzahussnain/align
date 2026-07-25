import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { getEntitlementSnapshot } from '@/shared/entitlements/server';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';

export async function GET(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view entitlements.', 401);
    return NextResponse.json(await getEntitlementSnapshot(session.user.id));
  });
}
