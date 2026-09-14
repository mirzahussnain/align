import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VerifiedBillingEvent, ProviderPurchaseSnapshot } from '../provider-contract';
import { BillingError } from '../errors';

const prismaMock = vi.hoisted(() => {
  const billingEventReceipt = { findUnique: vi.fn(), upsert: vi.fn(async () => ({})) };
  return {
    billingEventReceipt,
    // The receipt is written with the TRANSACTION client, so the stand-in tx must
    // expose the same delegate.
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({ billingEventReceipt })),
  };
});

const syncMock = vi.hoisted(() => ({
  syncProviderPurchase: vi.fn(),
  classifyPurchaseConflict: vi.fn(() => null),
  prismaErrorCode: vi.fn(() => undefined),
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../purchase-sync', () => syncMock);

import { processVerifiedEvent } from '../webhook-handler';

const NOW = new Date('2026-07-27T12:00:00.000Z');

function event(overrides: Partial<VerifiedBillingEvent> = {}): VerifiedBillingEvent {
  return {
    provider: 'STRIPE',
    providerEventId: 'evt_1',
    type: 'PURCHASE_UPDATED',
    occurredAt: NOW,
    subscriptionRef: 'sub_1',
    ...overrides,
  };
}

const snapshot: ProviderPurchaseSnapshot = {
  providerPurchaseId: 'sub_1',
  providerSubscriptionId: 'sub_1',
  providerCustomerId: 'cus_1',
  providerPriceId: 'price_x',
  status: 'ACTIVE',
  currentPeriodStart: NOW,
  currentPeriodEnd: NOW,
  cancelAtPeriodEnd: false,
  trialEndsAt: null,
};

function adapter(getPurchase: () => Promise<ProviderPurchaseSnapshot>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { getPurchase: vi.fn(getPurchase) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.billingEventReceipt.findUnique.mockResolvedValue(null);
  prismaMock.billingEventReceipt.upsert.mockResolvedValue({});
  prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ billingEventReceipt: prismaMock.billingEventReceipt })
  );
  syncMock.classifyPurchaseConflict.mockReturnValue(null);
  syncMock.prismaErrorCode.mockReturnValue(undefined);
});

describe('processVerifiedEvent', () => {
  it('short-circuits a duplicate of a terminal receipt without side effects', async () => {
    prismaMock.billingEventReceipt.findUnique.mockResolvedValue({ outcome: 'processed' });
    const a = adapter(async () => snapshot);
    const result = await processVerifiedEvent(event(), a);
    expect(result).toEqual({ status: 200, outcome: 'duplicate' });
    expect(a.getPurchase).not.toHaveBeenCalled();
    expect(syncMock.syncProviderPurchase).not.toHaveBeenCalled();
  });

  it('reprocesses a previously-failed receipt (retry policy)', async () => {
    prismaMock.billingEventReceipt.findUnique.mockResolvedValue({ outcome: 'failed' });
    syncMock.syncProviderPurchase.mockResolvedValue({ outcome: 'processed', purchaseId: 'p1', planId: 'PRO', status: 'ACTIVE', accessChange: 'upgraded' });
    const a = adapter(async () => snapshot);
    const result = await processVerifiedEvent(event(), a);
    expect(result).toEqual({ status: 200, outcome: 'processed' });
    expect(a.getPurchase).toHaveBeenCalledOnce();
  });

  it('ignores an event with no subscription reference', async () => {
    const a = adapter(async () => snapshot);
    const result = await processVerifiedEvent(event({ subscriptionRef: undefined, purchaseRef: undefined }), a);
    expect(result).toEqual({ status: 200, outcome: 'ignored' });
    expect(a.getPurchase).not.toHaveBeenCalled();
    expect(prismaMock.billingEventReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ outcome: 'ignored' }) })
    );
  });

  it('returns 500 so the provider retries when the snapshot fetch fails', async () => {
    const a = adapter(async () => {
      throw new BillingError('BILLING_PROVIDER_UNAVAILABLE', 'down');
    });
    const result = await processVerifiedEvent(event(), a);
    expect(result).toEqual({ status: 500, outcome: 'failed' });
    expect(prismaMock.billingEventReceipt.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ outcome: 'failed' }) })
    );
  });

  it('processes a normal subscription update', async () => {
    syncMock.syncProviderPurchase.mockResolvedValue({ outcome: 'processed', purchaseId: 'p1', planId: 'PRO', status: 'ACTIVE', accessChange: 'unchanged' });
    const result = await processVerifiedEvent(event(), adapter(async () => snapshot));
    expect(result).toEqual({ status: 200, outcome: 'processed' });
  });

  it('acknowledges (200) an unknown-price failure without retry-looping', async () => {
    syncMock.syncProviderPurchase.mockResolvedValue({ outcome: 'failed', reason: 'unknown_price' });
    const result = await processVerifiedEvent(event(), adapter(async () => snapshot));
    expect(result).toEqual({ status: 200, outcome: 'failed' });
  });

  it('acknowledges (200) and does not apply a stale event', async () => {
    syncMock.syncProviderPurchase.mockResolvedValue({ outcome: 'ignored', reason: 'stale_event', purchaseId: 'p1' });
    const result = await processVerifiedEvent(event(), adapter(async () => snapshot));
    expect(result).toEqual({ status: 200, outcome: 'ignored' });
  });
});
