import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { applyRateLimit, billingLimiter } from '@/shared/lib/rate-limit';
import { startPortal } from '@/shared/billing/portal';
import { rethrowBilling } from '@/shared/billing/http';

export const dynamic = 'force-dynamic';

/**
 * Open the provider's customer portal for the authenticated user. The provider
 * customer is resolved from the user's own account — never from client input — so
 * one user can never open another user's portal.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to manage billing.', 401);

    const limited = await applyRateLimit(billingLimiter, session.user.id);
    if (limited) return limited;

    try {
      const { url } = await startPortal(session.user.id);
      return NextResponse.json({ url });
    } catch (error) {
      rethrowBilling(error);
    }
  });
}
