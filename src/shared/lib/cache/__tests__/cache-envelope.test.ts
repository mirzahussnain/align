import { describe, expect, it } from 'vitest';

import { createEnvelope, envelopeTtlSeconds, readEnvelope } from '../cache-envelope';

const AT = Date.parse('2026-07-28T12:00:00.000Z');
const seconds = (n: number) => n * 1000;

describe('envelope freshness', () => {
  it('is FRESH inside the fresh window', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    const read = readEnvelope<string>(envelope, AT + seconds(299));
    expect(read.freshness).toBe('FRESH');
    expect(read.value).toBe('page');
  });

  it('is STALE between the fresh and stale boundaries — still a usable value', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    const read = readEnvelope<string>(envelope, AT + seconds(900));

    // The whole point of stale-while-revalidate: past `freshUntil` the value is
    // still served. A stale vacancy list beats a spinner.
    expect(read.freshness).toBe('STALE');
    expect(read.value).toBe('page');
    expect(read.ageMs).toBe(seconds(900));
  });

  it('is a MISS once past the stale boundary', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    expect(readEnvelope(envelope, AT + seconds(1800)).freshness).toBe('MISS');
  });

  it('treats the fresh boundary as exclusive so a value is never both', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    expect(readEnvelope(envelope, AT + seconds(300)).freshness).toBe('STALE');
  });
});

describe('envelope robustness', () => {
  it.each([
    ['null', null],
    ['a bare value written by an older schema', { jobs: [] }],
    ['a string', 'not-an-envelope'],
    ['an envelope with unparseable dates', { value: 1, createdAt: 'x', freshUntil: 'y', staleUntil: 'z' }],
  ])('reads %s as a MISS rather than throwing', (_label, stored) => {
    // A cache read must never be able to fail a request. A malformed payload
    // costs one upstream call; trusting it would crash at runtime.
    const read = readEnvelope(stored, AT);
    expect(read.freshness).toBe('MISS');
    expect(read.value).toBeNull();
  });

  it('cannot be configured to expire while still claiming to be fresh', () => {
    // A stale window shorter than the fresh window is a contradiction; it is
    // clamped rather than stored.
    const envelope = createEnvelope('page', 600, 60, AT);
    expect(readEnvelope(envelope, AT + seconds(300)).freshness).toBe('FRESH');
    expect(Date.parse(envelope.staleUntil)).toBe(Date.parse(envelope.freshUntil));
  });
});

describe('physical TTL', () => {
  it('is the remaining stale lifetime, which is what the key must be set to', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    expect(envelopeTtlSeconds(envelope, AT)).toBe(1800);
    expect(envelopeTtlSeconds(envelope, AT + seconds(1000))).toBe(800);
  });

  it('never returns a negative TTL, which set() would read as "do not cache"', () => {
    const envelope = createEnvelope('page', 300, 1800, AT);
    expect(envelopeTtlSeconds(envelope, AT + seconds(5000))).toBe(0);
  });
});
