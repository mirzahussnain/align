import { prisma } from '../src/shared/lib/prisma.ts';
import { refreshGreenhouseEmployerSources } from '../src/shared/services/greenhouse-refresh.ts';

type TerminalStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
const source = process.argv.find((value) => value.startsWith('--source='))?.slice('--source='.length);
const company = process.argv.find((value) => value.startsWith('--company='))?.slice('--company='.length);
const concurrency = Number(process.argv.find((value) => value.startsWith('--concurrency='))?.slice('--concurrency='.length) ?? 3);
const timeoutMs = Number(process.argv.find((value) => value.startsWith('--timeout-ms='))?.slice('--timeout-ms='.length) ?? 120_000);
const startedAt = Date.now();
const failed = (error?: unknown) => ({ status: 'FAILED' as TerminalStatus, attempted: 0, successful: 0, empty: 0, failed: 0, timedOut: 0, jobsRetrieved: 0, uniqueJobsPersisted: 0, duplicateJobsMerged: 0, invalidUrls: 0, malformedPayloads: 0, durationMs: Date.now() - startedAt, perSourceFailures: error ? { COMMAND_ERROR: 1 } : {}, ...(error instanceof Error ? { error: error.message } : {}) });
try {
  if (!source && !company && !process.argv.includes('--all')) throw new Error('Select --source=<id>, --company=<id>, or --all. This command never refreshes boards implicitly.');
  const timer = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('GREENHOUSE_COMMAND_TIMEOUT')), Math.max(1_000, timeoutMs)));
  const summary = await Promise.race([refreshGreenhouseEmployerSources({ ...(source ? { sourceIds: [source] } : {}), ...(company ? { companyRecordId: company } : {}), all: process.argv.includes('--all'), concurrency }), timer]);
  const status: TerminalStatus = summary.failed === 0 ? 'SUCCESS' : summary.successful > 0 ? 'PARTIAL_SUCCESS' : 'FAILED';
  console.log(JSON.stringify({ status, ...summary }, null, 2));
  if (status === 'FAILED') process.exitCode = 1;
} catch (error) { console.log(JSON.stringify(failed(error), null, 2)); process.exitCode = 1; }
finally { await prisma.$disconnect(); }