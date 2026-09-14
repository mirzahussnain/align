import { NextResponse } from 'next/server';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { applyRateLimit, billingLimiter } from '@/shared/lib/rate-limit';
import { cancelActiveSubscription } from '@/shared/billing/portal';
import { rethrowBilling } from '@/shared/billing/http';

export const dynamic = 'force-dynamic';

/**
 * Schedule cancellation at period end for the user's active subscription. The
 * preferred UX is the portal; this exists for an in-app "cancel" action. Paid
 * access is preserved until the period ends; no data or usage is touched.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to manage billing.', 401);

    const limited = await applyRateLimit(billingLimiter, session.user.id);
    if (limited) return limited;

    try {
      const result = await cancelActiveSubscription(session.user.id);
      return NextResponse.json({ scheduled: true, accessEndsAt: result.accessEndsAt });
    } catch (error) {
      rethrowBilling(error);
    }
  });
}
