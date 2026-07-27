import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/shared/lib/auth';
import { APIError, withErrorHandler } from '@/shared/utils/api-error';
import { applyRateLimit, billingLimiter } from '@/shared/lib/rate-limit';
import { startCheckout } from '@/shared/billing/checkout';
import { rethrowBilling } from '@/shared/billing/http';

export const dynamic = 'force-dynamic';

const CheckoutSchema = z.object({ offerId: z.string().min(1).max(64) });

/**
 * Server-authoritative checkout. The client submits only an allow-listed offer id;
 * the server resolves everything else and returns a hosted checkout URL. Access is
 * never granted here — only a verified webhook can do that.
 */
export async function POST(request: Request) {
  return withErrorHandler(async () => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new APIError('Please sign in to upgrade.', 401);

    const limited = await applyRateLimit(billingLimiter, session.user.id);
    if (limited) return limited;

    const parsed = CheckoutSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new APIError('Invalid checkout request.', 400);

    try {
      const { url } = await startCheckout(session.user.id, parsed.data.offerId, session.user.email);
      return NextResponse.json({ url });
    } catch (error) {
      rethrowBilling(error);
    }
  });
}
