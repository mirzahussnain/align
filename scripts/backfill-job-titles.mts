// Fill in `analysis.jobTitle` for job matches analysed before the matcher
// started extracting it.
//
// Uses the same text heuristic the analyze route falls back to, so it makes no
// AI calls and costs nothing to run. Rows whose job description genuinely never
// states a title are left NULL on purpose — the history table falls back to the
// filename, which is honest, whereas a truncated sentence pretending to be a
// title is the failure this whole module exists to prevent.
//
// Safe to re-run: only touches rows where jobTitle IS NULL.
//
//   DATABASE_URL=... npx tsx scripts/backfill-job-titles.mts [--dry]

import { prisma } from '../src/shared/lib/prisma.ts';
import { deriveJobTitleFromJd } from '../src/shared/utils/job-title.ts';

const dryRun = process.argv.includes('--dry');

const rows = await prisma.analysis.findMany({
  where: { mode: 'job_match', jobTitle: null, jobDescription: { not: null } },
  select: { id: true, jobDescription: true, sourceFileName: true },
});

console.log(`${rows.length} job-match analyses without a title.${dryRun ? ' (dry run)' : ''}\n`);

let filled = 0;
for (const row of rows) {
  const title = deriveJobTitleFromJd(row.jobDescription);

  if (!title) {
    console.log(`  skip  ${row.sourceFileName ?? row.id} — no title stated in the JD`);
    continue;
  }

  if (!dryRun) {
    await prisma.analysis.update({ where: { id: row.id }, data: { jobTitle: title } });
  }
  filled++;
  console.log(`  fill  ${row.sourceFileName ?? row.id} -> ${title}`);
}

console.log(`\n${filled} filled, ${rows.length - filled} left blank.`);
await prisma.$disconnect();
