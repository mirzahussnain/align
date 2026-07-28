import { prisma } from '../src/shared/lib/prisma.ts';
import { verifyAndPersistEmployerSource } from '../src/shared/services/employer-source-verification.ts';
import { isEmployerAtsProvider } from '../src/shared/types/job.ts';

const all = process.argv.includes('--all');
const requestedId = process.argv.find((value) => value.startsWith('--source='))?.slice('--source='.length);
const providerArgument = process.argv.find((value) => value.startsWith('--provider='))?.slice('--provider='.length);
const requestedProvider = providerArgument && isEmployerAtsProvider(providerArgument) ? providerArgument : undefined;
if (providerArgument && !requestedProvider) throw new Error('Unknown employer ATS provider.');
const providerFilter = requestedProvider ? { provider: requestedProvider } : {};
const where = requestedId ? { id: requestedId } : all ? providerFilter : { verificationStatus: 'PENDING' as const, ...providerFilter };
const sources = await prisma.employerJobSource.findMany({ where, select: { id: true, companyRecordId: true, provider: true, providerIdentifier: true, providerRegion: true } });
const concurrency = 3;
let cursor = 0;
const results: Array<{ status: string; code?: string }> = [];

async function worker() {
  while (cursor < sources.length) {
    const source = sources[cursor++];
    try {
      const updated = await verifyAndPersistEmployerSource({
        companyRecordId: source.companyRecordId,
        provider: source.provider,
        providerIdentifier: source.providerIdentifier,
        providerRegion: source.providerRegion ?? undefined,
      });
      results.push({ status: updated.verificationStatus, code: updated.lastErrorCode ?? undefined });
      console.log(`${source.provider}\t${source.providerIdentifier}\t${updated.verificationStatus}\t${updated.lastErrorCode ?? ''}`);
    } catch {
      results.push({ status: 'FAILED', code: 'NETWORK_ERROR' });
      console.log(`${source.provider}\t${source.providerIdentifier}\tFAILED\tNETWORK_ERROR`);
    }
  }
}

try {
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  const byStatus = (status: string) => results.filter((result) => result.status === status).length;
  const failures = new Map<string, number>();
  for (const result of results) if (result.code) failures.set(result.code, (failures.get(result.code) ?? 0) + 1);
  console.log(`Verification summary: attempted=${results.length} verified=${byStatus('VERIFIED')} failed=${byStatus('FAILED')}`);
  if (failures.size) console.log(`Failure breakdown: ${[...failures.entries()].map(([code, count]) => `${code}=${count}`).join(' ')}`);
} finally {
  await prisma.$disconnect();
}