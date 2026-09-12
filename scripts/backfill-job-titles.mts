// Fill in immutable job-revision titles for imported descriptions created before
// title extraction was introduced. Safe to rerun and makes no AI calls.
//
//   DATABASE_URL=... npx tsx scripts/backfill-job-titles.mts [--dry]

import { prisma } from '../src/shared/lib/prisma.ts';
import { deriveJobTitleFromJd } from '../src/shared/utils/job-title.ts';

const dryRun = process.argv.includes('--dry');
const rows = await prisma.jobRevision.findMany({
  where: { title: '' },
  select: { id: true, description: true, descriptionSource: true },
});

console.log(`${rows.length} job revisions without a title.${dryRun ? ' (dry run)' : ''}\n`);

let filled = 0;
for (const row of rows) {
  const title = deriveJobTitleFromJd(row.description);
  if (!title) {
    console.log(`  skip  ${row.id} — no title stated in the JD`);
    continue;
  }
  if (!dryRun) await prisma.jobRevision.update({ where: { id: row.id }, data: { title } });
  filled++;
  console.log(`  fill  ${row.id} (${row.descriptionSource}) -> ${title}`);
}

console.log(`\n${filled} filled, ${rows.length - filled} left blank.`);
await prisma.$disconnect();
