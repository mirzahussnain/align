import { describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import { CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import {
  activeProviders,
  bufferedRemainder,
  newSession,
  nextProviderPages,
  recordPage,
  resolveSession,
  saveSession,
  servedPageCount,
} from '@/shared/services/job-search-session';
import type { SearchJobProvider } from '@/shared/types/job';

const ALL: SearchJobProvider[] = ['ADZUNA', 'REED', 'JOOBLE'];
const HASH = 'query-hash-1';

describe('creating and resuming a session', () => {
  it('creates a fresh session when no id is supplied', async () => {
    const store = new MemoryCacheStore();
    const resolution = await resolveSession(store, { queryHash: HASH, userId: 'user-1' });
    expect(resolution.outcome).toBe('CREATED');
  });

  it('resumes a saved session for the same user and query', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, 'user-1');
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: 'user-1' });
    expect(resolution.outcome).toBe('RESUMED');
  });

  it('reports MISSING for an expired session rather than inventing one', async () => {
    let now = 1_000_000;
    const store = new MemoryCacheStore(() => now);
    const session = newSession(HASH, 'user-1');
    await saveSession(store, session);

    now += (CACHE_TTL_SECONDS.searchSession + 1) * 1000;

    // The caller must be able to tell "continue this" from "start again":
    // silently starting again would serve page one under a Load-more button.
    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: 'user-1' });
    expect(resolution.outcome).toBe('MISSING');
  });

  it('reports MISSING when the cache backend holds nothing at all', async () => {
    // Stands in for a Redis outage or an unconfigured cache: degrade to a clear
    // signal, never to a wrong continuation.
    const store = new MemoryCacheStore();
    const resolution = await resolveSession(store, { sessionId: crypto.randomUUID(), queryHash: HASH, userId: null });
    expect(resolution.outcome).toBe('MISSING');
  });
});

describe('session ownership', () => {
  it('refuses another signed-in user\'s session', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, 'user-1');
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: 'user-2' });
    expect(resolution).toEqual({ outcome: 'REJECTED', reason: 'owner_mismatch' });
  });

  it('refuses a guest presenting a signed-in user\'s session id', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, 'user-1');
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: null });
    expect(resolution).toEqual({ outcome: 'REJECTED', reason: 'owner_mismatch' });
  });

  it('refuses a signed-in user adopting a guest session', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, null);
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: 'user-1' });
    expect(resolution).toEqual({ outcome: 'REJECTED', reason: 'owner_mismatch' });
  });

  it('lets a guest resume its own session', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, null);
    await saveSession(store, session);
    expect((await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: null })).outcome).toBe('RESUMED');
  });

  it('stores no raw user id — only a hash', async () => {
    const session = newSession(HASH, 'user-1@example.com');
    expect(JSON.stringify(session)).not.toContain('user-1@example.com');
    expect(session.ownerHash).toMatch(/^[a-f0-9]{12}$/);
  });

  it('mints an unguessable id for a guest session', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newSession(HASH, null).id));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a session whose filters no longer match', async () => {
    const store = new MemoryCacheStore();
    const session = newSession(HASH, 'user-1');
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: 'different-hash', userId: 'user-1' });
    expect(resolution).toEqual({ outcome: 'REJECTED', reason: 'query_mismatch' });
  });
});

describe('load more does not replay page one', () => {
  it('advances each provider to its own next page', () => {
    const session = recordPage(newSession(HASH, null), {
      pages: { ADZUNA: 1, REED: 1, JOOBLE: 1 },
      exhausted: [],
      shownCanonicalJobIds: ['a', 'b'],
    });

    expect(nextProviderPages(session, ALL)).toEqual({ ADZUNA: 2, REED: 2, JOOBLE: 2 });
  });

  it('stops asking a provider that reported no further pages', () => {
    // Providers do not exhaust together. A shared counter would either re-ask
    // Reed for a page it has already said is empty, or hold Adzuna back.
    const session = recordPage(newSession(HASH, null), {
      pages: { ADZUNA: 1, REED: 1, JOOBLE: 1 },
      exhausted: ['REED'],
      shownCanonicalJobIds: [],
    });

    expect(nextProviderPages(session, ALL)).toEqual({ ADZUNA: 2, JOOBLE: 2 });
    expect(activeProviders(session, ALL)).toEqual(['ADZUNA', 'JOOBLE']);
  });

  it('accumulates seen ids so a repeated vacancy is not shown twice', () => {
    let session = recordPage(newSession(HASH, null), { pages: { REED: 1 }, exhausted: [], shownCanonicalJobIds: ['job-1', 'job-2'] });
    session = recordPage(session, { pages: { REED: 2 }, exhausted: [], shownCanonicalJobIds: ['job-2', 'job-3'] });

    expect(session.seenCanonicalJobIds).toEqual(['job-1', 'job-2', 'job-3']);
    expect(session.providerPages).toEqual({ REED: 2 });
  });

  it('bounds the seen-id list so a long run cannot grow one cache value without limit', () => {
    let session = newSession(HASH, null);
    for (let page = 1; page <= 60; page += 1) {
      session = recordPage(session, {
        pages: { REED: page },
        exhausted: [],
        shownCanonicalJobIds: Array.from({ length: 15 }, (_, index) => `page-${page}-job-${index}`),
      });
    }

    expect(session.seenCanonicalJobIds.length).toBeLessThanOrEqual(500);
    // The most recent ids are the ones worth keeping — they are the likeliest
    // to reappear on the next page.
    expect(session.seenCanonicalJobIds).toContain('page-60-job-0');
  });

  it('reports the page count actually served, not the highest provider page requested', () => {
    // These used to be the same number only because every page cost a provider
    // fan-out. A page served from the session buffer requests nothing from any
    // provider, so deriving the count from provider cursors reported every
    // buffered page as page one.
    const first = recordPage(newSession(HASH, null), { pages: { ADZUNA: 3, REED: 2 }, exhausted: [], shownCanonicalJobIds: ['job-1'] });
    expect(servedPageCount(first)).toBe(1);

    // A buffered continuation asks no provider for anything and is still page two.
    const second = recordPage(first, { pages: {}, exhausted: [], shownCanonicalJobIds: ['job-2'] });
    expect(servedPageCount(second)).toBe(2);
  });

  it('slices the ordered buffer at the number of results already served', () => {
    const seeded = recordPage(newSession(HASH, null), {
      pages: { REED: 1 },
      exhausted: [],
      shownCanonicalJobIds: ['job-1', 'job-2'],
      orderedCanonicalJobIds: ['job-1', 'job-2', 'job-3', 'job-4'],
    });
    // Two shown, two held back for the next page — no provider call needed.
    expect(bufferedRemainder(seeded)).toEqual(['job-3', 'job-4']);

    const continued = recordPage(seeded, { pages: {}, exhausted: [], shownCanonicalJobIds: ['job-3', 'job-4'] });
    expect(bufferedRemainder(continued)).toEqual([]);
  });

  it('appends a provider continuation to the buffer without reordering what was shown', () => {
    const first = recordPage(newSession(HASH, null), {
      pages: { REED: 1 },
      exhausted: [],
      shownCanonicalJobIds: ['job-1'],
      orderedCanonicalJobIds: ['job-1', 'job-2'],
    });
    const second = recordPage(first, {
      pages: { REED: 2 },
      exhausted: [],
      shownCanonicalJobIds: ['job-2'],
      orderedCanonicalJobIds: ['job-3', 'job-4'],
    });
    // Order already presented to the user is never rewritten underneath them.
    expect(second.orderedCanonicalJobIds).toEqual(['job-1', 'job-2', 'job-3', 'job-4']);
  });
});

describe('round trip through the store', () => {
  it('survives serialisation with its pages and seen ids intact', async () => {
    const store = new MemoryCacheStore();
    const session = recordPage(newSession(HASH, 'user-1'), {
      pages: { ADZUNA: 2 },
      exhausted: ['REED'],
      shownCanonicalJobIds: ['job-1'],
    });
    await saveSession(store, session);

    const resolution = await resolveSession(store, { sessionId: session.id, queryHash: HASH, userId: 'user-1' });
    expect(resolution.outcome).toBe('RESUMED');
    if (resolution.outcome !== 'RESUMED') return;
    expect(resolution.session.providerPages).toEqual({ ADZUNA: 2 });
    expect(resolution.session.exhaustedProviders).toEqual(['REED']);
    expect(resolution.session.seenCanonicalJobIds).toEqual(['job-1']);
  });
});
