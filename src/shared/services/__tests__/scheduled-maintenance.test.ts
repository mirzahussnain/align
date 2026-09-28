import { describe, expect, it, vi } from 'vitest';

import { MemoryCacheStore } from '@/shared/lib/cache/memory-cache-store';
import { runScheduledMaintenance } from '../scheduled-maintenance';

const summary = {
  attempted: 2,
  successful: 2,
  failed: 0,
  jobsRetrieved: 8,
  created: 3,
  sources: [{ identifier: 'must-not-leak' }],
};
const retentionSummary = {
  anonymousDemoResults: 0,
  jobMatchRequests: 0,
  reservations: 0,
  sourceCvObjects: 0,
  jobSnapshots: {
    examined: 3,
    archived: 3,
    purged: 0,
    protectedSkipped: 0,
    failures: 0,
  },
};

describe('scheduled maintenance', () => {
  it('runs retention and bounded provider refreshes under one overlap lock', async () => {
    const retention = vi.fn(async () => retentionSummary);
    const greenhouse = vi.fn(async () => summary);
    const lever = vi.fn(async () => summary);
    const ashby = vi.fn(async () => summary);

    const result = await runScheduledMaintenance({
      store: new MemoryCacheStore(),
      retention,
      refreshers: { greenhouse, lever, ashby },
    });

    expect(result.status).toBe('completed');
    expect(retention).toHaveBeenCalledOnce();
    expect(greenhouse).toHaveBeenCalledWith({ limit: 10, concurrency: 2 });
    expect(lever).toHaveBeenCalledWith({ limit: 10, concurrency: 2 });
    expect(ashby).toHaveBeenCalledWith({ limit: 10, concurrency: 2 });
  });

  it('does not overlap an active maintenance run', async () => {
    const store = new MemoryCacheStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const retention = vi.fn(async () => {
      await gate;
      return {
        ...retentionSummary,
        jobSnapshots: { ...retentionSummary.jobSnapshots, examined: 0, archived: 0 },
      };
    });
    const refresher = vi.fn(async () => summary);
    const deps = { store, retention, refreshers: { greenhouse: refresher, lever: refresher, ashby: refresher } };

    const first = runScheduledMaintenance(deps);
    await vi.waitFor(() => expect(retention).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(refresher).toHaveBeenCalledTimes(3));
    await expect(runScheduledMaintenance(deps)).resolves.toEqual({ status: 'already_running' });
    expect(refresher).toHaveBeenCalledTimes(3);
    release();
    await first;
  });

  it('keeps partial successes and the overlap lock when one task fails', async () => {
    const store = new MemoryCacheStore();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const retention = vi.fn(async () => { throw new Error('retention failed'); });
    const refresher = vi.fn(async () => { await gate; return summary; });
    const deps = { store, retention, refreshers: { greenhouse: refresher, lever: refresher, ashby: refresher } };

    const first = runScheduledMaintenance(deps);
    await vi.waitFor(() => expect(refresher).toHaveBeenCalledTimes(3));
    await expect(runScheduledMaintenance(deps)).resolves.toEqual({ status: 'already_running' });
    release();
    const result = await first;
    expect(result).toMatchObject({
      status: 'completed',
      failures: [{ task: 'retention', code: 'Error' }],
      providers: {
        greenhouse: { status: 'completed', attempted: 2, created: 3 },
        lever: { status: 'completed', attempted: 2, created: 3 },
        ashby: { status: 'completed', attempted: 2, created: 3 },
      },
    });
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });
});
