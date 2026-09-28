import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import {
  newSession,
  saveSession,
  saveSessionBuffer,
} from '@/shared/services/job-search-session';
import type { NormalisedJob } from '@/shared/types/job';

const { prisma } = vi.hoisted(() => ({
  prisma: { jobSnapshot: { findFirst: vi.fn() } },
}));
vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import {
  resolveDurableJobReference,
  resolveJobReference,
} from '@/shared/services/job-reference';

const job = (identityStability: 'STABLE' | 'SESSION_ONLY' = 'STABLE'): NormalisedJob => ({
  source: 'JOOBLE',
  sourceJobId: 'one',
  providerReferences: [{
    provider: 'JOOBLE',
    sourceJobId: 'one',
    identityStability,
    sourceUrl: 'https://example.test/jobs/one',
  }],
  canonicalUrl: 'https://example.test/jobs/one',
  title: 'Platform Engineer',
  company: 'Acme',
  locationText: 'London, UK',
  descriptionAvailability: 'PARTIAL',
  remoteType: 'HYBRID',
  sponsorSignal: { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'Fixture' },
  eligibilityHints: [],
  dedupeFingerprint: 'same-vacancy',
  canonicalJobId: 'canonical-one',
  fetchedAt: '2026-09-27T10:00:00.000Z',
});

beforeEach(() => {
  vi.resetAllMocks();
  prisma.jobSnapshot.findFirst.mockResolvedValue(null);
});

describe('job reference resolution', () => {
  it('resolves an explicit durable snapshot without reading the session', async () => {
    const store = new MemoryCacheStore();
    prisma.jobSnapshot.findFirst.mockResolvedValue({ id: 'snapshot-1' });

    await expect(resolveJobReference(store, {
      canonicalJobId: 'canonical-one',
      jobSnapshotId: 'snapshot-1',
      sessionId: crypto.randomUUID(),
      userId: 'user-1',
    })).resolves.toEqual({ kind: 'persisted', jobSnapshotId: 'snapshot-1' });
  });

  it('resolves a canonical id from an owner-validated session buffer', async () => {
    const store = new MemoryCacheStore();
    const session = newSession('query-one', 'user-1');
    await saveSession(store, session);
    await saveSessionBuffer(store, session.id, [job()]);

    await expect(resolveJobReference(store, {
      canonicalJobId: 'canonical-one',
      sessionId: session.id,
      userId: 'user-1',
    })).resolves.toMatchObject({ kind: 'ephemeral', job: { canonicalJobId: 'canonical-one' } });
  });

  it('falls back to a safe public snapshot after the Redis result expires', async () => {
    const store = new MemoryCacheStore();
    prisma.jobSnapshot.findFirst.mockResolvedValue({ id: 'snapshot-existing' });

    await expect(resolveJobReference(store, {
      canonicalJobId: 'same-vacancy',
      sessionId: crypto.randomUUID(),
      userId: null,
    })).resolves.toEqual({ kind: 'persisted', jobSnapshotId: 'snapshot-existing' });
    expect(prisma.jobSnapshot.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ importedByUserId: null }),
    }));
  });

  it('rejects a session owned by another user without exposing its buffer', async () => {
    const store = new MemoryCacheStore();
    const session = newSession('query-one', 'user-1');
    await saveSession(store, session);
    await saveSessionBuffer(store, session.id, [job()]);

    await expect(resolveJobReference(store, {
      canonicalJobId: 'canonical-one',
      sessionId: session.id,
      userId: 'user-2',
    })).rejects.toMatchObject({ statusCode: 410, code: 'EPHEMERAL_JOB_EXPIRED' });
  });

  it('returns a typed expiry and never refetches an upstream provider', async () => {
    const store = new MemoryCacheStore();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(resolveJobReference(store, {
      canonicalJobId: 'canonical-one',
      sessionId: crypto.randomUUID(),
      userId: null,
    })).rejects.toMatchObject({ statusCode: 410, code: 'EPHEMERAL_JOB_EXPIRED' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps a session-only result displayable but rejects it for durable actions', async () => {
    const store = new MemoryCacheStore();
    const session = newSession('query-one', null);
    await saveSession(store, session);
    await saveSessionBuffer(store, session.id, [job('SESSION_ONLY')]);

    const input = { canonicalJobId: 'canonical-one', sessionId: session.id, userId: null };
    await expect(resolveJobReference(store, input)).resolves.toMatchObject({ kind: 'ephemeral' });
    await expect(resolveDurableJobReference(store, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'JOB_IDENTITY_UNSTABLE',
    });
  });
});
