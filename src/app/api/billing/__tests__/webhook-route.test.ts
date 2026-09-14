import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/shared/billing/errors';

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  process: vi.fn(),
}));

vi.mock('@/shared/billing/providers', () => ({
  resolveProviderAdapter: vi.fn(() => ({ verifyWebhook: mocks.verifyWebhook })),
}));
vi.mock('@/shared/billing/webhook-handler', () => ({ processVerifiedEvent: mocks.process }));

import { POST } from '@/app/api/billing/webhook/route';

function req() {
  return new Request('https://app.test/api/billing/webhook', { method: 'POST', body: 'raw-body' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/billing/webhook', () => {
  it('rejects an invalid signature with 400 and never processes', async () => {
    mocks.verifyWebhook.mockRejectedValue(new BillingError('WEBHOOK_SIGNATURE_INVALID', 'bad sig'));
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('acknowledges (200) a verified but unsupported event without processing', async () => {
    mocks.verifyWebhook.mockRejectedValue(new BillingError('WEBHOOK_EVENT_UNSUPPORTED', 'nope'));
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe(true);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('returns 500 when verification cannot run (unconfigured)', async () => {
    mocks.verifyWebhook.mockRejectedValue(new BillingError('PROVIDER_NOT_CONFIGURED', 'no key'));
    const res = await POST(req());
    expect(res.status).toBe(500);
  });

  it('delegates a verified event to the neutral handler and returns its status', async () => {
    mocks.verifyWebhook.mockResolvedValue({ provider: 'STRIPE', providerEventId: 'evt_1', type: 'PURCHASE_UPDATED', occurredAt: new Date() });
    mocks.process.mockResolvedValue({ status: 200, outcome: 'processed' });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledOnce();
    expect((await res.json()).outcome).toBe('processed');
  });
});
