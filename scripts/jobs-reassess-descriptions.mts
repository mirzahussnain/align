/**
 * Re-run the deterministic description-completeness assessment over persisted
 * JobSnapshot rows.
 *
 * WHY A COMMAND RATHER THAN A MIGRATION. The previous ingestion classifier
 * tested only a literal trailing `...` and demoted only SNIPPET/UNKNOWN provider
 * contracts, so Adzuna and Reed records were persisted FULL in bulk even though
 * both providers declare PARTIAL semantics. Correcting ingestion fixes the next
 * refresh; it does not fix what is already stored, and a snapshot only refreshes
 * when a search happens to rediscover it. This reclassifies what is already
 * there, on demand, with a dry run first.
 *
 * SAFETY CONTRACT.
 *  - User-pasted descriptions are never read, rewritten or deleted here. The
 *    provider description and its availability are the only fields touched.
 *  - Description-derived intelligence is invalidated ONLY where the
 *    classification or the description hash actually changed, because that
 *    intelligence describes text that is no longer the selected text.
 *  - Idempotent: a second run over unchanged data reports 0 changed.
 *  - `--dry-run` (the default) writes nothing. `--apply` is explicit.
 *
 * Usage:
 *   npm run jobs:reassess-descriptions -- --dry-run
 *   npm run jobs:reassess-descriptions -- --apply
 *   npm run jobs:reassess-descriptions -- --apply --provider=REED
 */

import { Prisma } from '../src/generated/prisma/client.ts';
import { prisma } from '../src/shared/lib/prisma.ts';
import { assessDescriptionCompleteness } from '../src/shared/services/job-description-completeness.ts';
import { getProviderCapabilities } from '../src/shared/services/job-providers/capabilities.ts';
import type { JobProvider } from '../src/shared/types/job.ts';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = !apply;
const providerFilter = args
  .find((arg) => arg.startsWith('--provider='))
  ?.slice('--provider='.length)
  .toUpperCase();
const BATCH = 500;

if (args.includes('--apply') && args.includes('--dry-run')) {
  console.error('Pass either --dry-run or --apply, not both.');
  process.exit(1);
}

type Row = {
  id: string;
  providerDescription: string | null;
  descriptionAvailability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY';
  selectedDescriptionHash: string | null;
  userSuppliedDescription: string | null;
  providerReferences: Array<{ provider: string }>;
};

/**
 * Which provider contract this snapshot's stored text came from.
 *
 * A snapshot can carry references from several providers after a merge. The
 * WEAKEST contract wins: if any contributing source only promises a snippet, the
 * stored text may be that snippet, and claiming otherwise is the over-claim this
 * whole change exists to stop.
 */
const RANK: Record<string, number> = { SNIPPET: 0, UNKNOWN: 1, PARTIAL: 2, FULL: 3 };
function weakestProvider(row: Row): JobProvider | undefined {
  let chosen: JobProvider | undefined;
  let best = Number.POSITIVE_INFINITY;
  for (const reference of row.providerReferences) {
    const provider = reference.provider as JobProvider;
    const semantics = getProviderCapabilities(provider)?.descriptionSemantics;
    if (!semantics) continue;
    const rank = RANK[semantics] ?? 1;
    if (rank < best) {
      best = rank;
      chosen = provider;
    }
  }
  return chosen;
}

const totals = { scanned: 0, changed: 0, unchanged: 0, skippedNoProvider: 0, errors: 0 };
const transitions = new Map<string, number>();
const byProvider = new Map<string, { changed: number; scanned: number }>();

try {
  let cursor: string | undefined;
  for (;;) {
    const rows = (await prisma.jobSnapshot.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      ...(providerFilter
        ? { where: { providerReferences: { some: { provider: providerFilter as never } } } }
        : {}),
      select: {
        id: true,
        providerDescription: true,
        descriptionAvailability: true,
        selectedDescriptionHash: true,
        userSuppliedDescription: true,
        providerReferences: { select: { provider: true } },
      },
    })) as unknown as Row[];
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

    for (const row of rows) {
      totals.scanned += 1;
      const provider = weakestProvider(row);
      const providerKey = provider ?? 'UNKNOWN';
      const seen = byProvider.get(providerKey) ?? { changed: 0, scanned: 0 };
      seen.scanned += 1;
      byProvider.set(providerKey, seen);

      if (!provider && row.providerDescription) {
        // No usable contract at all. `assessDescriptionCompleteness` treats that
        // as UNKNOWN → PARTIAL, which is the conservative answer, so this is
        // reported rather than skipped.
        totals.skippedNoProvider += 1;
      }

      try {
        const assessed = assessDescriptionCompleteness({
          ...(provider ? { provider } : {}),
          description: row.providerDescription,
        });
        if (assessed.availability === row.descriptionAvailability) {
          totals.unchanged += 1;
          continue;
        }

        const key = `${row.descriptionAvailability} → ${assessed.availability}`;
        transitions.set(key, (transitions.get(key) ?? 0) + 1);
        totals.changed += 1;
        seen.changed += 1;

        if (dryRun) continue;

        // Intelligence derived from the OLD classification no longer describes
        // the selected description, so it is dropped. A user-pasted description
        // owns the selected hash, so its intelligence is left entirely alone.
        const invalidate = !row.userSuppliedDescription;
        await prisma.jobSnapshot.update({
          where: { id: row.id },
          data: {
            descriptionAvailability: assessed.availability,
            ...(invalidate
              ? {
                  descriptionAssessment: Prisma.JsonNull,
                  requirementEvidence: Prisma.JsonNull,
                  intelligenceAssessedAt: null,
                  selectedDescriptionHash: null,
                  selectedDescriptionSource: null,
                }
              : {}),
          },
        });
      } catch (error) {
        totals.errors += 1;
        console.error(`  ! ${row.id}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }
  }

  console.log(`\nMode: ${dryRun ? 'DRY RUN (nothing written)' : 'APPLY'}`);
  if (providerFilter) console.log(`Provider filter: ${providerFilter}`);
  console.log(JSON.stringify(totals, null, 2));

  if (transitions.size) {
    console.log('\nClassification transitions:');
    console.table(
      [...transitions].map(([transition, count]) => ({ Transition: transition, Snapshots: count })),
    );
  } else {
    console.log('\nNo classification changes. The stored assessment already matches the classifier.');
  }

  console.log('\nPer contributing provider:');
  console.table(
    [...byProvider].map(([provider, value]) => ({
      Provider: provider,
      Scanned: value.scanned,
      Changed: value.changed,
    })),
  );

  if (dryRun && totals.changed) console.log('\nRe-run with --apply to persist these changes.');
} finally {
  await prisma.$disconnect();
}
