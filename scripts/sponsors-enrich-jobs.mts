/**
 * Backfill: link vacancies to companies, and give companies current
 * sponsor-register evidence.
 *
 * WHY THIS EXISTS. The board accumulated snapshots long before either step ran
 * automatically. Aggregator vacancies were persisted with `companyRecordId`
 * permanently null, and `enrichCompanySponsorEvidence` had no caller at all, so
 * every CompanyRecord sat on its `NOT_CHECKED` default. Ingestion now does both
 * for new rows; this command repairs the existing ones, and re-checks evidence
 * whenever the Home Office publishes a new register.
 *
 * WHAT IT WILL NOT DO. It never creates a CompanyRecord, never links a vacancy
 * on a weak name resemblance, and never converts a failed check into "no match
 * found". An employer that cannot be resolved stays unresolved and is counted as
 * such — a smaller unresolved number bought with invented links would make the
 * whole feature untrustworthy.
 *
 * Usage:
 *   npm run sponsors:enrich-jobs -- --dry-run
 *   npm run sponsors:enrich-jobs -- --apply
 *   npm run sponsors:enrich-jobs -- --apply --provider=GREENHOUSE
 *   npm run sponsors:enrich-jobs -- --apply --only-unchecked
 *   npm run sponsors:enrich-jobs -- --apply --force-refresh
 */

import { prisma } from '../src/shared/lib/prisma.ts';
import { resolveCompanyForEmployer } from '../src/shared/services/company-resolution.ts';
import {
  ensureCompanySponsorEvidence,
  isSponsorEvidenceStale,
  SPONSOR_EVIDENCE_SELECT,
} from '../src/shared/services/company-sponsor-evidence.ts';
import { getEmployerSponsorEvidence } from '../src/shared/services/job-intelligence-store.ts';
import { getSponsorRegisterVersion } from '../src/shared/services/sponsor-registry.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;
const onlyUnchecked = args.includes('--only-unchecked');
const forceRefresh = args.includes('--force-refresh');
const provider = args.find((arg) => arg.startsWith('--provider='))?.split('=')[1]?.toUpperCase();
const BATCH = 500;

if (args.includes('--apply') && args.includes('--dry-run')) {
  throw new Error('Pass either --dry-run or --apply, not both.');
}

const report = {
  registerVersion: '' as string,
  jobsInspected: 0,
  jobsAlreadyLinked: 0,
  jobsNewlyLinked: 0,
  jobsAmbiguous: 0,
  jobsUnresolved: 0,
  companiesChecked: 0,
  companiesMatched: 0,
  companiesAmbiguous: 0,
  companiesNone: 0,
  companiesStillNotChecked: 0,
  staleEvidenceRefreshed: 0,
  unlinkedSnapshotsChecked: 0,
  unlinkedSnapshotsAlreadyCurrent: 0,
  unlinkedSnapshotsStillNotChecked: 0,
  errors: 0,
  durationMs: 0,
};

const started = Date.now();

async function main() {
  try {
    report.registerVersion = await getSponsorRegisterVersion();
  } catch {
    // Without a register version nothing can be judged stale and no check can
    // complete. Company linking is independent of the register, so it still runs.
    console.warn('[sponsors:enrich-jobs] The sponsor register is unavailable. Company linking will run; no sponsor check will be completed.');
  }

  // ── Stage 1: link vacancies that have no company ───────────────────────────
  //
  // Grouped by normalised employer name so one resolution serves every vacancy
  // from that employer, rather than repeating an identical lookup per row.
  // A previous AMBIGUOUS or NO_COMPANY_MATCH is deliberately retried: the company
  // directory grows, so an employer that was unresolvable last month may resolve
  // today. `--only-unchecked` restricts this to snapshots never attempted at all.
  const linkWhere = {
    companyRecordId: null,
    ...(onlyUnchecked ? { companyLinkStatus: 'NOT_ATTEMPTED' as const } : {}),
    ...(provider
      ? { providerReferences: { some: { provider: provider as never } } }
      : {}),
  };

  // Explicitly typed so the page argument's type never depends on the rows it
  // returns, which is otherwise a self-referential inference for the cursor.
  let cursor: string | undefined;
  const page = (): { skip?: number; cursor?: { id: string } } =>
    cursor ? { skip: 1, cursor: { id: cursor } } : {};
  const resolvedByName = new Map<string, Awaited<ReturnType<typeof resolveCompanyForEmployer>>>();
  for (;;) {
    const rows = await prisma.jobSnapshot.findMany({
      where: linkWhere,
      select: { id: true, employerName: true, normalisedEmployerName: true, companyLinkStatus: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...page(),
    });
    if (!rows.length) break;
    cursor = rows.at(-1)!.id;

    for (const row of rows) {
      report.jobsInspected += 1;
      try {
        const key = row.normalisedEmployerName || row.employerName;
        let resolution = resolvedByName.get(key);
        if (!resolution) {
          resolution = await resolveCompanyForEmployer({ employerName: row.employerName });
          resolvedByName.set(key, resolution);
        }
        if (resolution.outcome === 'MATCHED_COMPANY') report.jobsNewlyLinked += 1;
        else if (resolution.outcome === 'AMBIGUOUS_COMPANY') report.jobsAmbiguous += 1;
        else report.jobsUnresolved += 1;

        if (apply) {
          await prisma.jobSnapshot.update({
            where: { id: row.id },
            data: {
              companyLinkStatus: resolution.outcome,
              companyLinkedAt: new Date(),
              companyLinkEvidence: {
                method: resolution.method ?? null,
                candidateCount: resolution.candidateCount,
                reasons: resolution.reasons,
                ...(resolution.matchedDisplayName ? { matchedDisplayName: resolution.matchedDisplayName } : {}),
              },
              ...(resolution.outcome === 'MATCHED_COMPANY' && resolution.companyRecordId
                ? { companyRecordId: resolution.companyRecordId }
                : {}),
            },
          });
        }
      } catch (error) {
        report.errors += 1;
        console.error(`[sponsors:enrich-jobs] Failed to resolve a company for snapshot ${row.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  report.jobsAlreadyLinked = await prisma.jobSnapshot.count({ where: { companyRecordId: { not: null } } });

  // ── Stage 2: sponsor-register evidence for companies with vacancies ────────
  const companyWhere = {
    ...(onlyUnchecked ? { sponsorMatchStatus: 'NOT_CHECKED' as const } : {}),
    ...(provider
      ? { jobSources: { some: { provider: provider as never, verificationStatus: 'VERIFIED' as const } } }
      : {}),
  };

  cursor = undefined;
  for (;;) {
    const companies = await prisma.companyRecord.findMany({
      where: companyWhere,
      select: SPONSOR_EVIDENCE_SELECT,
      orderBy: { id: 'asc' },
      take: BATCH,
      ...page(),
    });
    if (!companies.length) break;
    cursor = companies.at(-1)!.id;

    for (const company of companies) {
      const wasStale = isSponsorEvidenceStale(company, report.registerVersion || undefined);
      const hadEvidence = company.sponsorMatchStatus !== 'NOT_CHECKED';
      if (!forceRefresh && !wasStale) {
        report.companiesChecked += 1;
        tallyStatus(company.sponsorMatchStatus);
        continue;
      }
      if (dryRun) {
        report.companiesChecked += 1;
        if (wasStale && hadEvidence) report.staleEvidenceRefreshed += 1;
        else report.companiesStillNotChecked += 1;
        continue;
      }
      try {
        const result = await ensureCompanySponsorEvidence(company.id, { force: forceRefresh });
        report.companiesChecked += 1;
        if (result.outcome === 'REFRESHED_STALE') report.staleEvidenceRefreshed += 1;
        if (result.outcome === 'CHECK_UNAVAILABLE' || result.outcome === 'EMPLOYER_UNIDENTIFIABLE') {
          report.companiesStillNotChecked += 1;
          continue;
        }
        if (result.status === 'MATCHED') report.companiesMatched += 1;
        else if (result.status === 'AMBIGUOUS') report.companiesAmbiguous += 1;
        else if (result.status === 'NONE') report.companiesNone += 1;
        else report.companiesStillNotChecked += 1;
      } catch (error) {
        report.errors += 1;
        console.error(`[sponsors:enrich-jobs] Failed to check company ${company.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

/**
 * Stage 3: employer-NAME evidence for vacancies that never resolved to a company.
 *
 * These are aggregator adverts whose employer text cannot be tied to a canonical
 * company confidently enough to link. They still deserve a real answer rather
 * than a permanent "not checked", so the register is consulted on the employer
 * name and the result is stored on the SNAPSHOT, where the details mapper reads
 * it as the fallback behind canonical company evidence.
 *
 * This is a weaker claim than a company-level check and is presented as such:
 * it is evidence about a name a job board supplied, not about a company record
 * anyone has verified.
 */
async function enrichUnlinkedSnapshots() {
  if (!report.registerVersion) return;
  let snapshotCursor: string | undefined;
  for (;;) {
    const rows = await prisma.jobSnapshot.findMany({
      where: {
        companyRecordId: null,
        ...(provider ? { providerReferences: { some: { provider: provider as never } } } : {}),
      },
      select: { id: true, employerName: true, employerSponsorEvidence: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(snapshotCursor ? { skip: 1, cursor: { id: snapshotCursor } } : {}),
    });
    if (!rows.length) break;
    snapshotCursor = rows.at(-1)!.id;

    // Deduplicated by employer name: the register answer is identical for every
    // vacancy from the same employer, and the Redis layer memoises it anyway.
    for (const row of rows) {
      const existing = row.employerSponsorEvidence as { registerVersion?: string } | null;
      if (!forceRefresh && existing?.registerVersion === report.registerVersion) {
        report.unlinkedSnapshotsAlreadyCurrent += 1;
        continue;
      }
      if (dryRun) {
        report.unlinkedSnapshotsChecked += 1;
        continue;
      }
      try {
        const evidence = await getEmployerSponsorEvidence(row.employerName);
        await prisma.jobSnapshot.update({
          where: { id: row.id },
          data: { employerSponsorEvidence: JSON.parse(JSON.stringify(evidence)) },
        });
        report.unlinkedSnapshotsChecked += 1;
        if (evidence.status === 'NOT_CHECKED') report.unlinkedSnapshotsStillNotChecked += 1;
      } catch (error) {
        report.errors += 1;
        console.error(`[sponsors:enrich-jobs] Failed to check employer evidence for snapshot ${row.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

function tallyStatus(status: string | null) {
  if (status === 'EXACT') report.companiesMatched += 1;
  else if (status === 'LIKELY' || status === 'AMBIGUOUS') report.companiesAmbiguous += 1;
  else if (status === 'NONE') report.companiesNone += 1;
  else report.companiesStillNotChecked += 1;
}

await main();
await enrichUnlinkedSnapshots();
report.durationMs = Date.now() - started;

console.log('');
console.log(`Sponsor enrichment backfill (${dryRun ? 'DRY RUN — nothing was written' : 'APPLIED'})`);
console.log('─'.repeat(60));
console.log(`Register version            ${report.registerVersion || 'UNAVAILABLE'}`);
console.log(`Jobs inspected              ${report.jobsInspected}`);
console.log(`Jobs already linked         ${report.jobsAlreadyLinked}`);
console.log(`Jobs newly linked           ${report.jobsNewlyLinked}`);
console.log(`Jobs ambiguous              ${report.jobsAmbiguous}`);
console.log(`Jobs unresolved             ${report.jobsUnresolved}`);
console.log(`Companies checked           ${report.companiesChecked}`);
console.log(`Companies matched           ${report.companiesMatched}`);
console.log(`Companies ambiguous         ${report.companiesAmbiguous}`);
console.log(`Companies none              ${report.companiesNone}`);
console.log(`Companies still not checked ${report.companiesStillNotChecked}`);
console.log(`Stale evidence refreshed    ${report.staleEvidenceRefreshed}`);
console.log(`Unlinked vacancies checked  ${report.unlinkedSnapshotsChecked}`);
console.log(`Unlinked already current    ${report.unlinkedSnapshotsAlreadyCurrent}`);
console.log(`Unlinked still not checked  ${report.unlinkedSnapshotsStillNotChecked}`);
console.log(`Errors                      ${report.errors}`);
console.log(`Duration                    ${report.durationMs} ms`);
console.log('');
if (dryRun) console.log('Re-run with --apply to persist these links and checks.');

await prisma.$disconnect();
process.exit(report.errors > 0 ? 1 : 0);
