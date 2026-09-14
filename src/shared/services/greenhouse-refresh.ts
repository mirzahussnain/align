import { prisma } from '../lib/prisma.ts';
import { greenhouseAdapter } from './job-providers/greenhouse-adapter.ts';
import { persistTrustedProviderJob } from './job-snapshot.ts';
import { ensureCompanySponsorEvidence } from './company-sponsor-evidence.ts';

export type GreenhouseRefreshSummary = { attempted: number; successful: number; empty: number; failed: number; timedOut: number; jobsRetrieved: number; uniqueJobsPersisted: number; duplicateJobsMerged: number; invalidUrls: number; invalidJobRecords: number; invalidUrlReasons: Record<string, number>; malformedPayloads: number; durationMs: number; perSourceFailures: Record<string, number>; sources: Array<{ sourceId: string; identifier: string; status: 'SUCCESS' | 'EMPTY' | 'FAILED'; jobs: number; errorCode?: string; durationMs: number }> };
const chunks = <T>(values: T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
const errorCodeOf = (error: unknown) => error instanceof Error ? error.message.slice(0, 120) : 'GREENHOUSE_UNAVAILABLE';

/** Explicit background/administrative refresh only. Interactive search never calls this. */
export async function refreshGreenhouseEmployerSources(input: { sourceIds?: string[]; companyRecordId?: string; all?: boolean; concurrency?: number } = {}): Promise<GreenhouseRefreshSummary> {
  const started = Date.now();
  const where = { provider: 'GREENHOUSE' as const, verificationStatus: 'VERIFIED' as const, enabled: true, ...(input.sourceIds?.length ? { id: { in: input.sourceIds } } : {}), ...(input.companyRecordId ? { companyRecordId: input.companyRecordId } : {}) };
  const sources = await prisma.employerJobSource.findMany({ where, include: { companyRecord: { select: { id: true, displayName: true, websiteUrl: true, careersUrl: true } } }, orderBy: { providerIdentifier: 'asc' } });
  const summary: GreenhouseRefreshSummary = { attempted: sources.length, successful: 0, empty: 0, failed: 0, timedOut: 0, jobsRetrieved: 0, uniqueJobsPersisted: 0, duplicateJobsMerged: 0, invalidUrls: 0, invalidJobRecords: 0, invalidUrlReasons: {}, malformedPayloads: 0, durationMs: 0, perSourceFailures: {}, sources: [] };
  const persisted = new Set<string>(); let cursor = 0; const workers = Math.max(1, Math.min(input.concurrency ?? 3, 5));
  async function worker() { while (cursor < sources.length) {
    const source = sources[cursor++]; const itemStarted = Date.now(); const attemptedAt = new Date();
    try {
      const result = await greenhouseAdapter.fetchBoard(source);
      for (const batch of chunks(result.jobs, 20)) await Promise.all(batch.map(async (job) => { const existed = persisted.has(job.canonicalJobId); persisted.add(job.canonicalJobId); await persistTrustedProviderJob(job); if (existed) summary.duplicateJobsMerged += 1; else summary.uniqueJobsPersisted += 1; }));
      await prisma.employerJobSource.update({ where: { id: source.id }, data: { lastAttemptedAt: attemptedAt, lastSuccessfulSyncAt: new Date(), lastErrorCode: null, lastErrorAt: null } });
      // Employer-direct ingestion is the cheapest moment to keep register
      // evidence current: the company is already known and the check is a no-op
      // when it was last run against this register version. Awaited, never a
      // detached background task, and a failure here never fails the refresh.
      try { await ensureCompanySponsorEvidence(source.companyRecordId); } catch { /* enrichment is advisory; ingestion outcome stands */ }
      summary.successful += 1; summary.jobsRetrieved += result.jobs.length; summary.invalidUrls += result.invalidUrls; summary.invalidJobRecords += result.invalidJobRecords; summary.duplicateJobsMerged += result.duplicateProviderJobIds; for (const [reason, count] of Object.entries(result.urlRejections)) summary.invalidUrlReasons[reason] = (summary.invalidUrlReasons[reason] ?? 0) + count;
      const status = result.jobs.length ? 'SUCCESS' as const : 'EMPTY' as const; if (!result.jobs.length) summary.empty += 1;
      summary.sources.push({ sourceId: source.id, identifier: source.providerIdentifier, status, jobs: result.jobs.length, durationMs: Date.now() - itemStarted });
    } catch (error) {
      const errorCode = errorCodeOf(error); await prisma.employerJobSource.update({ where: { id: source.id }, data: { lastAttemptedAt: attemptedAt, lastErrorCode: errorCode, lastErrorAt: new Date() } });
      summary.failed += 1; if (errorCode === 'GREENHOUSE_TIMEOUT') summary.timedOut += 1; if (errorCode === 'GREENHOUSE_MALFORMED_RESPONSE') summary.malformedPayloads += 1; summary.perSourceFailures[errorCode] = (summary.perSourceFailures[errorCode] ?? 0) + 1;
      summary.sources.push({ sourceId: source.id, identifier: source.providerIdentifier, status: 'FAILED', jobs: 0, errorCode, durationMs: Date.now() - itemStarted });
    }
  }}
  await Promise.all(Array.from({ length: Math.min(workers, sources.length) }, worker)); summary.durationMs = Date.now() - started; return summary;
}