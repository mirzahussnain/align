import { NextResponse } from 'next/server';
import { resolveProviderAdapter } from '@/shared/billing/providers';
import { processVerifiedEvent } from '@/shared/billing/webhook-handler';
import { BillingError } from '@/shared/billing/errors';
import { logBillingEvent } from '@/shared/billing/logging';

// Webhooks must always run at request time and never be cached; the raw body is
// read directly from the request for signature verification.
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook endpoint (§8). This route does the minimum: it hands the RAW
 * request to the adapter for signature verification, then delegates ALL business
 * logic to the provider-neutral handler. An unverified payload is never parsed or
 * trusted; a signature failure is a 400; a verified-but-unsupported event is a
 * deliberate 200 ignore; genuine processing failures are 5xx so the provider
 * retries.
 */
export async function POST(request: Request) {
  const adapter = resolveProviderAdapter('STRIPE');

  logBillingEvent('webhook_received', { provider: 'STRIPE' });

  let event;
  try {
    event = await adapter.verifyWebhook(request);
  } catch (error) {
    if (error instanceof BillingError && error.code === 'WEBHOOK_SIGNATURE_INVALID') {
      logBillingEvent('webhook_signature_invalid', { provider: 'STRIPE', errorCode: error.code });
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
    }
    if (error instanceof BillingError && error.code === 'WEBHOOK_EVENT_UNSUPPORTED') {
      // Verified but a type we deliberately do not process — acknowledge so the
      // provider stops retrying an irrelevant event.
      logBillingEvent('webhook_ignored', { provider: 'STRIPE' });
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }
    // Verification could not run (e.g. provider not configured) — do not 200.
    const code = error instanceof BillingError ? error.code : 'WEBHOOK_PROCESSING_FAILED';
    logBillingEvent('webhook_failed', { provider: 'STRIPE', errorCode: code });
    return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 500 });
  }

  logBillingEvent('webhook_verified', {
    provider: event.provider,
    providerEventId: event.providerEventId,
    eventType: event.type,
  });

  const result = await processVerifiedEvent(event, adapter);
  return NextResponse.json({ received: true, outcome: result.outcome }, { status: result.status });
}
