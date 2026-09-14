import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { getBillingStatus } from '@/shared/billing/status';

export const dynamic = 'force-dynamic';

/**
 * Authoritative billing status for the current user. The success page polls this
 * after checkout return and shows Pro ONLY once the resolver confirms active
 * access — never from a query parameter.
 */
export async function GET(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to view billing status.', 401);
    return NextResponse.json(await getBillingStatus(session.user.id));
  });
}
