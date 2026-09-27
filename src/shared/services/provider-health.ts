/**
 * Rolling, reconstructable health for each vacancy source.
 *
 * PURPOSE, AND ITS LIMIT. This exists so the UI can say "Reed is currently
 * unavailable" honestly, and so operations can see a source degrading. It is
 * NOT a circuit breaker: a provider is never skipped because of this state.
 * Two reasons that matters —
 *
 *   - A single failure, or even three, is routinely transient. Automatically
 *     disabling a source on that evidence turns a blip into an outage of our own
 *     making, and the user simply sees fewer jobs with no explanation.
 *   - The state lives in a cache that may be empty (cold Redis, outage,
 *     unconfigured). Behaviour that depended on it would silently change with
 *     cache availability, which is the class of bug this whole phase removes.
 *
 * So health is DESCRIPTIVE. Everything here is derived from the last few
 * outcomes, is bounded by a TTL, and is fully reconstructable by making the next
 * request. Losing all of it costs a slightly less specific status chip.
 *
 * No raw upstream body, error message, URL or credential is ever stored — only a
 * status, timestamps, a small counter and a latency.
 */

import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import type { JobProvider, ProviderSearchStatus } from '@/shared/types/job';
import { logJobBoardEvent } from './job-board-observability';

export interface ProviderHealthState {
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  lastSuccessAt?: string;
  lastFailureAt?: string;
  consecutiveFailures: number;
  lastLatencyMs?: number;
}

/** Failures before a source is described as degraded, then as unavailable. */
const DEGRADED_AT = 2;
const UNAVAILABLE_AT = 4;

const HEALTHY: ProviderHealthState = { status: 'HEALTHY', consecutiveFailures: 0 };

function classify(consecutiveFailures: number): ProviderHealthState['status'] {
  if (consecutiveFailures >= UNAVAILABLE_AT) return 'UNAVAILABLE';
  if (consecutiveFailures >= DEGRADED_AT) return 'DEGRADED';
  return 'HEALTHY';
}

/** Which provider outcomes count as a failure for health purposes. */
export function isFailureStatus(status: ProviderSearchStatus): boolean {
  // NOT_CONFIGURED is a deployment fact, not a provider fault, and PENDING means
  // the interactive deadline arrived first — neither says the source is unwell.
  return status === 'FAILED' || status === 'TIMED_OUT' || status === 'RATE_LIMITED';
}

export async function readProviderHealth(
  store: CacheStore,
  provider: JobProvider
): Promise<ProviderHealthState> {
  const stored = await store.get<ProviderHealthState>(cacheKeys.providerHealth(provider));
  if (!stored || typeof stored.consecutiveFailures !== 'number') return HEALTHY;
  return stored;
}

export async function readProviderHealthMap(
  store: CacheStore,
  providers: readonly JobProvider[]
): Promise<Map<JobProvider, ProviderHealthState>> {
  const entries = await Promise.all(
    providers.map(async (provider) => [provider, await readProviderHealth(store, provider)] as const)
  );
  return new Map(entries);
}

/**
 * Fold one outcome into the stored state.
 *
 * A success resets the counter to zero outright rather than decaying it: the
 * question this answers is "is the source working NOW", and a source that just
 * answered is working now regardless of what it did ten minutes ago.
 */
export async function recordProviderOutcome(
  store: CacheStore,
  provider: JobProvider,
  outcome: { status: ProviderSearchStatus; durationMs: number }
): Promise<ProviderHealthState> {
  // NOT_CONFIGURED carries no evidence either way; leave the record untouched
  // so an unconfigured source does not look healthy or unwell.
  if (outcome.status === 'NOT_CONFIGURED') return readProviderHealth(store, provider);

  const previous = await readProviderHealth(store, provider);
  const failed = isFailureStatus(outcome.status);
  const now = new Date().toISOString();

  const next: ProviderHealthState = failed
    ? {
        status: classify(previous.consecutiveFailures + 1),
        consecutiveFailures: previous.consecutiveFailures + 1,
        lastFailureAt: now,
        lastSuccessAt: previous.lastSuccessAt,
        lastLatencyMs: outcome.durationMs,
      }
    : {
        status: 'HEALTHY',
        consecutiveFailures: 0,
        lastSuccessAt: now,
        lastFailureAt: previous.lastFailureAt,
        lastLatencyMs: outcome.durationMs,
      };

  await store.set(cacheKeys.providerHealth(provider), next, CACHE_TTL_SECONDS.providerHealth);

  if (next.status !== 'HEALTHY' && next.status !== previous.status) {
    logJobBoardEvent('provider_health_degraded', {
      provider,
      providerStatus: outcome.status,
      count: next.consecutiveFailures,
      durationMs: outcome.durationMs,
    });
  }
  return next;
}
