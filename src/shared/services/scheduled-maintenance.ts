import { cacheKeys, CACHE_TTL_SECONDS } from '@/shared/lib/cache/cache-keys';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { acquireRefreshLock } from '@/shared/lib/cache/refresh-lock';
import { refreshAshbyEmployerSources } from './ashby-refresh';
import { refreshGreenhouseEmployerSources } from './greenhouse-refresh';
import { refreshLeverEmployerSources } from './lever-refresh';
import { runRetentionCleanup } from './retention-service';

type RefreshInput = { limit: number; concurrency: number };
type RefreshSummary = {
  attempted: number;
  successful: number;
  failed: number;
  jobsRetrieved: number;
  created?: number;
  updated?: number;
  reactivated?: number;
  unchanged?: number;
};
type Refresher = (input: RefreshInput) => Promise<RefreshSummary>;

type MaintenanceDependencies = {
  store?: CacheStore;
  retention?: typeof runRetentionCleanup;
  refreshers?: { greenhouse: Refresher; lever: Refresher; ashby: Refresher };
};

const REFRESH_INPUT: RefreshInput = { limit: 10, concurrency: 2 };
// Reassess the daily limit/concurrency once roughly 50-70 boards are enabled;
// at that scale a limit of ten per provider may no longer cover every board promptly.

const failureCode = (reason: unknown) =>
  reason instanceof Error ? reason.name : 'UNKNOWN_ERROR';

const boundedRefreshSummary = (summary: RefreshSummary) => ({
  status: 'completed' as const,
  attempted: summary.attempted,
  successful: summary.successful,
  failed: summary.failed,
  jobsRetrieved: summary.jobsRetrieved,
  ...(summary.created === undefined ? {} : { created: summary.created }),
  ...(summary.updated === undefined ? {} : { updated: summary.updated }),
  ...(summary.reactivated === undefined ? {} : { reactivated: summary.reactivated }),
  ...(summary.unchanged === undefined ? {} : { unchanged: summary.unchanged }),
});

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
    const taskNames = ['retention', 'greenhouse', 'lever', 'ashby'] as const;
    const failures = settled.flatMap((item, index) =>
      item.status === 'rejected'
        ? [{ task: taskNames[index], code: failureCode(item.reason) }]
        : [],
    );
    const retentionResult = settled[0];
    const providerResult = (index: 1 | 2 | 3) => {
      const item = settled[index];
      return item.status === 'fulfilled'
        ? boundedRefreshSummary(item.value as RefreshSummary)
        : {
            status: 'failed' as const,
            attempted: 0,
            successful: 0,
            failed: 1,
            jobsRetrieved: 0,
            code: failureCode(item.reason),
          };
    };
    const result = {
      status: 'completed' as const,
      durationMs: Date.now() - startedAt,
      retention: retentionResult.status === 'fulfilled'
        ? { status: 'completed' as const, ...retentionResult.value }
        : { status: 'failed' as const, code: failureCode(retentionResult.reason) },
      providers: {
        greenhouse: providerResult(1),
        lever: providerResult(2),
        ashby: providerResult(3),
      },
      failures,
    };
    console.info('scheduled_maintenance_completed', {
      durationMs: result.durationMs,
      retention: result.retention,
      providers: result.providers,
      failures: result.failures,
    });
    return result;
  } finally {
    await lock.release();
  }
}
