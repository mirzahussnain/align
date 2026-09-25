import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { acquireRefreshLock } from '@/shared/lib/cache/refresh-lock';
import { refreshAshbyEmployerSources } from './ashby-refresh';
import { refreshGreenhouseEmployerSources } from './greenhouse-refresh';
import { refreshLeverEmployerSources } from './lever-refresh';
import { runRetentionCleanup } from './retention-service';

type RefreshInput = { limit: number; concurrency: number };
type RefreshSummary = { attempted: number; successful: number; failed: number; jobsRetrieved: number };
type Refresher = (input: RefreshInput) => Promise<RefreshSummary>;

type MaintenanceDependencies = {
  store?: CacheStore;
  retention?: typeof runRetentionCleanup;
  refreshers?: { greenhouse: Refresher; lever: Refresher; ashby: Refresher };
};

const REFRESH_INPUT: RefreshInput = { limit: 10, concurrency: 2 };

export async function runScheduledMaintenance(dependencies: MaintenanceDependencies = {}) {
  const store = dependencies.store ?? getCacheStore();
  const lock = await acquireRefreshLock(
    store,
    cacheKeys.scheduledMaintenanceLock(),
    CACHE_TTL_SECONDS.scheduledMaintenanceLock,
  );
  if (!lock.acquired) return { status: 'already_running' as const };

  const startedAt = Date.now();
  const retention = dependencies.retention ?? runRetentionCleanup;
  const refreshers = dependencies.refreshers ?? {
    greenhouse: refreshGreenhouseEmployerSources,
    lever: refreshLeverEmployerSources,
    ashby: refreshAshbyEmployerSources,
  };

  try {
    const settled = await Promise.allSettled([
      retention(),
      refreshers.greenhouse(REFRESH_INPUT),
      refreshers.lever(REFRESH_INPUT),
      refreshers.ashby(REFRESH_INPUT),
    ]);
    const failed = settled.find((item): item is PromiseRejectedResult => item.status === 'rejected');
    if (failed) throw failed.reason;
    const [retentionResult, greenhouse, lever, ashby] = settled.map(
      (item) => (item as PromiseFulfilledResult<unknown>).value,
    ) as [Awaited<ReturnType<typeof retention>>, RefreshSummary, RefreshSummary, RefreshSummary];
    const result = {
      status: 'completed' as const,
      durationMs: Date.now() - startedAt,
      retention: retentionResult,
      providers: { greenhouse, lever, ashby },
    };
    console.info('scheduled_maintenance_completed', {
      durationMs: result.durationMs,
      retention: result.retention,
      providers: Object.fromEntries(Object.entries(result.providers).map(([provider, value]) => [provider, {
        attempted: value.attempted,
        successful: value.successful,
        failed: value.failed,
        jobsRetrieved: value.jobsRetrieved,
      }])),
    });
    return result;
  } finally {
    await lock.release();
  }
}
