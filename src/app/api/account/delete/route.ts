import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAccountDeletionAuthorization } from '@/shared/account-deletion/context';
import {
  AccountDeletionNotAuthorizedError,
  AccountDeletionStorageFailedError,
  ActiveSubscriptionBlocksDeletionError,
} from '@/shared/account-deletion/errors';
import { resolveBillingAccess } from '@/shared/billing/access';
import { auth } from '@/shared/lib/auth';
import {
  accountActionLimiter,
  applyRateLimit,
} from '@/shared/lib/rate-limit';

const DeleteAccountSchema = z
  .object({
    confirmation: z.literal('DELETE'),
    password: z.string().min(1).optional(),
  })
  .strict();

function betterAuthCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  if ('body' in error && error.body && typeof error.body === 'object') {
    const body = error.body as { code?: unknown };
    if (typeof body.code === 'string') return body.code;
  }
  return undefined;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const limited = await applyRateLimit(accountActionLimiter, session.user.id);
  if (limited) return limited;

  const parsed = DeleteAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: 'INVALID_CONFIRMATION' }, { status: 400 });
  }

  try {
    await withAccountDeletionAuthorization(session.user.id, () =>
      auth.api.deleteUser({
        headers: request.headers,
        body: parsed.data.password ? { password: parsed.data.password } : {},
      })
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const code = betterAuthCode(error);
    if (
      error instanceof ActiveSubscriptionBlocksDeletionError ||
      code === 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION'
    ) {
      const details = error instanceof ActiveSubscriptionBlocksDeletionError
        ? {
            paidThrough: error.paidThrough?.toISOString() ?? null,
            status: error.billingStatus,
          }
        : (() => {
            const body = (error as { body?: Record<string, unknown> }).body ?? {};
            return {
              paidThrough: typeof body.paidThrough === 'string' ? body.paidThrough : null,
              status: typeof body.status === 'string' ? body.status : 'ACTIVE',
            };
          })();
      const billing = await resolveBillingAccess(session.user.id).catch(() => null);
      return NextResponse.json(
        {
          code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
          ...details,
          portalAvailable: billing?.portalAvailable ?? false,
        },
        { status: 409 }
      );
    }
    if (
      error instanceof AccountDeletionStorageFailedError ||
      code === 'ACCOUNT_DELETION_STORAGE_FAILED'
    ) {
      return NextResponse.json({ code: 'ACCOUNT_DELETION_STORAGE_FAILED' }, { status: 503 });
    }
    if (
      error instanceof AccountDeletionNotAuthorizedError ||
      code === 'ACCOUNT_DELETION_NOT_AUTHORIZED'
    ) {
      return NextResponse.json({ code: 'ACCOUNT_DELETION_NOT_AUTHORIZED' }, { status: 403 });
    }
    if (code === 'SESSION_EXPIRED') {
      return NextResponse.json({ code: 'RECENT_AUTHENTICATION_REQUIRED' }, { status: 401 });
    }
    if (code === 'INVALID_PASSWORD') {
      return NextResponse.json({ code: 'INVALID_PASSWORD' }, { status: 400 });
    }
    return NextResponse.json({ code: 'ACCOUNT_DELETION_FAILED' }, { status: 500 });
  }
}
