import { describe, expect, it, vi } from 'vitest';
import { createGenerationLeaseRepository, GENERATION_LEASE_MS } from '../generation-lease';

const NOW = new Date('2026-10-13T20:00:00.000Z');

function harness() {
  let current = {
    id: 'generation-1', userId: 'user-1', operationId: 'operation-1', status: 'PLAN_APPROVED',
    generationLeaseToken: null as string | null, generationLeaseExpiresAt: null as Date | null,
    generationAttemptCount: 0, validatedAiCheckpoint: null as unknown,
  };
  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (where.id !== current.id || where.userId !== current.userId) return { count: 0 };
    if (where.generationLeaseToken && where.generationLeaseToken !== current.generationLeaseToken) return { count: 0 };
    if (where.status === 'GENERATING' && current.status !== 'GENERATING') return { count: 0 };
    if (where.status && typeof where.status === 'object') {
      const accepted = (where.status as { in: string[] }).in;
      if (!accepted.includes(current.status)) return { count: 0 };
    }
    current = {
      ...current,
      ...data,
      generationAttemptCount: data.generationAttemptCount && typeof data.generationAttemptCount === 'object'
        ? current.generationAttemptCount + 1
        : current.generationAttemptCount,
    } as typeof current;
    return { count: 1 };
  });
  const findFirst = vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
    where.id === current.id && where.userId === current.userId ? { ...current } : null);
  const tokens = ['token-1', 'token-2'];
  return {
    repository: createGenerationLeaseRepository(
      { cvGeneration: { updateMany, findFirst } },
      { newToken: () => tokens.shift() ?? 'token-next' },
    ),
    current: () => current,
  };
}

describe('fenced generation leases', () => {
  it('grants one claim and returns in-progress to a concurrent caller', async () => {
    const h = harness();
    const first = await h.repository.claimGeneration({ userId: 'user-1', generationId: 'generation-1', now: NOW });
    expect(first).toMatchObject({ status: 'claimed', token: 'token-1', operationId: 'operation-1', checkpoint: null });
    expect(h.current()).toMatchObject({
      status: 'GENERATING', generationAttemptCount: 1,
      generationLeaseExpiresAt: new Date(NOW.getTime() + GENERATION_LEASE_MS),
    });
    await expect(h.repository.claimGeneration({ userId: 'user-1', generationId: 'generation-1', now: NOW }))
      .resolves.toMatchObject({ status: 'in_progress', operationId: 'operation-1' });
  });

  it('reclaims an expired lease with a new fence and reuses the AI checkpoint', async () => {
    const h = harness();
    const first = await h.repository.claimGeneration({ userId: 'user-1', generationId: 'generation-1', now: NOW });
    if (first.status !== 'claimed') throw new Error('Expected first claim');
    const checkpoint = { spec: { version: 4 }, provider: { model: 'test' } };
    await expect(h.repository.checkpointAiResult({
      userId: 'user-1', generationId: 'generation-1', token: first.token, checkpoint,
    })).resolves.toBe(true);
    h.current().generationLeaseExpiresAt = new Date(NOW.getTime() - 1);

    const reclaimed = await h.repository.claimGeneration({ userId: 'user-1', generationId: 'generation-1', now: NOW });
    expect(reclaimed).toMatchObject({ status: 'claimed', token: 'token-2', checkpoint });
    expect(h.current().generationAttemptCount).toBe(2);
    await expect(h.repository.canPublishGeneration({ userId: 'user-1', generationId: 'generation-1', token: first.token, now: NOW }))
      .resolves.toBe(false);
  });

  it('denies stale renewal/checkpoint/publication and preserves one operation identity', async () => {
    const h = harness();
    const claim = await h.repository.claimGeneration({ userId: 'user-1', generationId: 'generation-1', now: NOW });
    if (claim.status !== 'claimed') throw new Error('Expected claim');
    await expect(h.repository.renewGenerationLease({ userId: 'user-1', generationId: 'generation-1', token: 'stale', now: NOW }))
      .resolves.toBe(false);
    await expect(h.repository.checkpointAiResult({ userId: 'user-1', generationId: 'generation-1', token: 'stale', checkpoint: { spec: {} } }))
      .resolves.toBe(false);
    await expect(h.repository.canPublishGeneration({ userId: 'user-1', generationId: 'generation-1', token: claim.token, now: NOW }))
      .resolves.toBe(true);
    expect(claim.operationId).toBe('operation-1');
  });

  it('reclaims a controlled failed generation while retaining its checkpoint', async () => {
    const h = harness();
    h.current().status = 'GENERATION_FAILED';
    h.current().validatedAiCheckpoint = { spec: { version: 4 } };
    const claim = await h.repository.claimGeneration({
      userId: 'user-1', generationId: 'generation-1', now: NOW,
    });
    expect(claim).toMatchObject({
      status: 'claimed', token: 'token-1',
      checkpoint: { spec: { version: 4 } },
    });
  });
});
