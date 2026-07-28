import { prisma } from '../lib/prisma.ts';
import { greenhouseAdapter } from './job-providers/greenhouse-adapter.ts';
import { getOrCreateSnapshotFromNormalisedJob } from './job-snapshot.ts';

export type GreenhouseRefreshSummary = { attempted: number; successful: number; empty: number; failed: number; jobsRetrieved: number; invalidUrls: number; duplicateProviderJobIds: number; durationMs: number; sources: Array<{ sourceId: string; identifier: string; status: 'SUCCESS' | 'EMPTY' | 'FAILED'; jobs: number; errorCode?: string; durationMs: number }> };

/** Explicit background/administrative refresh only. Interactive search never calls this. */
export async function refreshGreenhouseEmployerSources(input: { sourceIds?: string[]; companyRecordId?: string; all?: boolean; concurrency?: number } = {}): Promise<GreenhouseRefreshSummary> {
  const started = Date.now();
  const where = { provider: 'GREENHOUSE' as const, verificationStatus: 'VERIFIED' as const, enabled: true, ...(input.sourceIds?.length ? { id: { in: input.sourceIds } } : {}), ...(input.companyRecordId ? { companyRecordId: input.companyRecordId } : {}) };
  const sources = await prisma.employerJobSource.findMany({ where, include: { companyRecord: { select: { id: true, displayName: true } } }, orderBy: { providerIdentifier: 'asc' } });
  const summary: GreenhouseRefreshSummary = { attempted: sources.length, successful: 0, empty: 0, failed: 0, jobsRetrieved: 0, invalidUrls: 0, duplicateProviderJobIds: 0, durationMs: 0, sources: [] };
  let cursor = 0; const workers = Math.max(1, Math.min(input.concurrency ?? 3, 5));
  async function worker() {
    while (cursor < sources.length) {
      const source = sources[cursor++]; const itemStarted = Date.now(); const attemptedAt = new Date();
      try {
        const result = await greenhouseAdapter.fetchBoard(source);
        for (const job of result.jobs) await getOrCreateSnapshotFromNormalisedJob(job);
        await prisma.employerJobSource.update({ where: { id: source.id }, data: { lastAttemptedAt: attemptedAt, lastSuccessfulSyncAt: new Date(), lastErrorCode: null, lastErrorAt: null } });
        summary.successful += 1; summary.jobsRetrieved += result.jobs.length; summary.invalidUrls += result.invalidUrls; summary.duplicateProviderJobIds += result.duplicateProviderJobIds;
        const status = result.jobs.length ? 'SUCCESS' as const : 'EMPTY' as const; if (!result.jobs.length) summary.empty += 1;
        summary.sources.push({ sourceId: source.id, identifier: source.providerIdentifier, status, jobs: result.jobs.length, durationMs: Date.now() - itemStarted });
      } catch (error) {
        const errorCode = error instanceof Error ? error.message.slice(0, 120) : 'GREENHOUSE_UNAVAILABLE';
        await prisma.employerJobSource.update({ where: { id: source.id }, data: { lastAttemptedAt: attemptedAt, lastErrorCode: errorCode, lastErrorAt: new Date() } });
        summary.failed += 1; summary.sources.push({ sourceId: source.id, identifier: source.providerIdentifier, status: 'FAILED', jobs: 0, errorCode, durationMs: Date.now() - itemStarted });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, sources.length) }, worker)); summary.durationMs = Date.now() - started; return summary;
}