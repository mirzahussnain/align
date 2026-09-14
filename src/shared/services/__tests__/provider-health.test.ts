import { describe, expect, it } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import { isFailureStatus, readProviderHealth, recordProviderOutcome } from '@/shared/services/provider-health';

const fail = { status: 'FAILED' as const, durationMs: 120 };
const ok = { status: 'SUCCESS' as const, durationMs: 90 };

describe('provider health classification', () => {
  it('starts healthy for a provider nothing is known about', async () => {
    const store = new MemoryCacheStore();
    expect(await readProviderHealth(store, 'REED')).toEqual({ status: 'HEALTHY', consecutiveFailures: 0 });
  });

  it('does not call a provider unhealthy after a single blip', async () => {
    // A lone failure is routinely transient; describing it as degraded would put
    // an alarming chip on the page for a source that is working.
    const store = new MemoryCacheStore();
    const state = await recordProviderOutcome(store, 'REED', fail);
    expect(state.status).toBe('HEALTHY');
    expect(state.consecutiveFailures).toBe(1);
  });

  it('escalates through DEGRADED to UNAVAILABLE as failures accumulate', async () => {
    const store = new MemoryCacheStore();
    await recordProviderOutcome(store, 'REED', fail);
    expect((await recordProviderOutcome(store, 'REED', fail)).status).toBe('DEGRADED');
    await recordProviderOutcome(store, 'REED', fail);
    expect((await recordProviderOutcome(store, 'REED', fail)).status).toBe('UNAVAILABLE');
  });

  it('resets outright on a success — the question is whether it works NOW', async () => {
    const store = new MemoryCacheStore();
    for (let i = 0; i < 5; i += 1) await recordProviderOutcome(store, 'REED', fail);
    expect((await readProviderHealth(store, 'REED')).status).toBe('UNAVAILABLE');

    const recovered = await recordProviderOutcome(store, 'REED', ok);
    expect(recovered.status).toBe('HEALTHY');
    expect(recovered.consecutiveFailures).toBe(0);
  });

  it('keeps each provider\'s health independent', async () => {
    const store = new MemoryCacheStore();
    for (let i = 0; i < 4; i += 1) await recordProviderOutcome(store, 'REED', fail);

    expect((await readProviderHealth(store, 'REED')).status).toBe('UNAVAILABLE');
    expect((await readProviderHealth(store, 'ADZUNA')).status).toBe('HEALTHY');
  });

  it('treats a timeout as a failure but a missing configuration as neither', async () => {
    expect(isFailureStatus('TIMED_OUT')).toBe(true);
    expect(isFailureStatus('FAILED')).toBe(true);
    // NOT_CONFIGURED is a deployment fact; PENDING means we stopped waiting
    // while the request was still healthy. Neither says the source is unwell.
    expect(isFailureStatus('NOT_CONFIGURED')).toBe(false);
    expect(isFailureStatus('PENDING')).toBe(false);
    expect(isFailureStatus('EMPTY')).toBe(false);
  });

  it('leaves the record untouched for an unconfigured provider', async () => {
    const store = new MemoryCacheStore();
    await recordProviderOutcome(store, 'REED', fail);
    await recordProviderOutcome(store, 'REED', { status: 'NOT_CONFIGURED', durationMs: 0 });

    // Not reset to healthy, and not counted as another failure.
    expect((await readProviderHealth(store, 'REED')).consecutiveFailures).toBe(1);
  });

  it('never disables a provider — health is descriptive, not a circuit breaker', async () => {
    const store = new MemoryCacheStore();
    for (let i = 0; i < 10; i += 1) await recordProviderOutcome(store, 'REED', fail);

    // Even at UNAVAILABLE the next success is recorded normally, because nothing
    // stopped the provider from being called.
    expect((await recordProviderOutcome(store, 'REED', ok)).status).toBe('HEALTHY');
  });

  it('stores no raw error payload', async () => {
    const store = new MemoryCacheStore();
    const state = await recordProviderOutcome(store, 'REED', fail);
    expect(Object.keys(state).sort()).toEqual(
      ['consecutiveFailures', 'lastFailureAt', 'lastLatencyMs', 'lastSuccessAt', 'status'].sort()
    );
  });

  it('reports healthy when the cache holds nothing, rather than failing the search', async () => {
    const dead = {
      async get() { return null; },
      async set() {},
      async delete() {},
      async setIfAbsent() { return false; },
    };
    expect((await readProviderHealth(dead, 'REED')).status).toBe('HEALTHY');
    expect((await recordProviderOutcome(dead, 'REED', fail)).status).toBe('HEALTHY');
  });
});
