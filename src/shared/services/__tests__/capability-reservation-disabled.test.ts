import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = {
  $executeRawUnsafe: vi.fn(async () => 0),
  capabilityReservation: {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('@/shared/lib/prisma', () => ({
  prisma: { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) },
}));
vi.mock('@/shared/billing/access', () => ({
  resolveBillingAccess: vi.fn(async () => ({ effectivePlan: 'FREE' })),
}));

import { CapabilityReservationDeniedError, reserveCapability } from '../capability-reservation';

describe('reserveCapability disabled boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed before creating a reservation when Job Match is disabled', async () => {
    await expect(reserveCapability({
      userId: 'user-1',
      capability: 'job_match_analysis',
      operationId: 'operation-1',
    })).rejects.toMatchObject({
      name: CapabilityReservationDeniedError.name,
      decision: { allowed: false, mode: 'disabled', plan: 'FREE' },
    });
    expect(tx.capabilityReservation.create).not.toHaveBeenCalled();
    expect(tx.capabilityReservation.updateMany).not.toHaveBeenCalled();
  });
});
