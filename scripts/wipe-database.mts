// Delete every user and their data, plus the stored objects those rows reference.
//
// Written for clearing test data out of a hosted database before it carries
// anything real. Deleting rows alone is NOT enough: uploaded CVs and generated
// DOCX files live in object storage and are only reachable through the keys stored on those
// rows, so dropping the rows first would strand the files permanently — nothing
// in the app scans buckets, all pruning works off the database. Storage goes first,
// database second, for exactly that reason.
//
// Requires --confirm. Refuses to run otherwise, because the whole point of the
// script is that it is unrecoverable.
//
//   DATABASE_URL=... npx tsx scripts/wipe-database.mts --dry
//   DATABASE_URL=... npx tsx scripts/wipe-database.mts --confirm

import { prisma } from '../src/shared/lib/prisma.ts';
import { storage } from '../src/shared/lib/storage.ts';

const dryRun = !process.argv.includes('--confirm');

const host = (process.env.DATABASE_URL ?? '').match(/@([^/?]+)/)?.[1] ?? 'unknown host';
console.log(`Target: ${host}`);
console.log(dryRun ? 'DRY RUN — nothing will be deleted. Pass --confirm to execute.\n' : 'EXECUTING — this cannot be undone.\n');

// ── Collect storage keys while the rows that point at them still exist ────────────
const [uploads, rewrites, users] = await Promise.all([
  prisma.analysis.findMany({
    where: { sourceFileKey: { not: null } },
    select: { sourceFileKey: true },
  }),
  prisma.generatedCV.findMany({
    where: { fileKey: { not: null } },
    select: { fileKey: true },
  }),
  prisma.user.findMany({ select: { id: true, email: true, image: true } }),
]);

// Avatars are only ours to delete when they live in our bucket — a Google OAuth
// profile picture is a googleusercontent.com URL and must be left alone.
const avatarKeys = users
  .map((u) => u.image)
  .filter((img): img is string => Boolean(img && img.includes('avatars/')))
  .map((img) => img.slice(img.indexOf('avatars/')).split('?')[0]);

console.log(`Users:            ${users.length}`);
users.forEach((u) => console.log(`  - ${u.email}`));
console.log(`Stored uploads:      ${uploads.length}`);
console.log(`Stored rewrites:     ${rewrites.length}`);
console.log(`Stored avatars:      ${avatarKeys.length}`);

if (dryRun) {
  const counts = await tableCounts();
  console.log('\nRows that would be deleted:');
  console.table(counts);
  await prisma.$disconnect();
  process.exit(0);
}

// ── Object storage first ─────────────────────────────────────────────────────────────────
let deleted = 0;
let failed = 0;
const results = await Promise.all([
  ...uploads.map((a) => storage.delete('uploads', a.sourceFileKey as string)),
  ...rewrites.map((c) => storage.delete('rewrites', c.fileKey as string)),
  ...avatarKeys.map((k) => storage.delete('avatars', k)),
]);
for (const ok of results) (ok ? deleted++ : failed++);
console.log(`\nR2: ${deleted} deleted, ${failed} failed.`);
if (failed > 0) {
  // Surfaced rather than swallowed: these objects are about to become
  // unreachable, so a silent failure means paying to store them forever.
  console.warn('  Some objects could not be deleted and will be orphaned once rows are gone.');
}

// ── Database second ──────────────────────────────────────────────────────────
// Deleting users cascades to sessions, accounts, identity, profiles (and their
// children), analyses, generated CVs and usage counters — see schema.prisma.
const { count } = await prisma.user.deleteMany({});
console.log(`\nDeleted ${count} user(s) and all cascaded rows.`);

// Verification tables cascade from nothing, so they are cleared explicitly.
await prisma.verification.deleteMany({});

console.log('\nRemaining rows:');
console.table(await tableCounts());
await prisma.$disconnect();

async function tableCounts() {
  return {
    user: await prisma.user.count(),
    session: await prisma.session.count(),
    account: await prisma.account.count(),
    profileIdentity: await prisma.profileIdentity.count(),
    profile: await prisma.profile.count(),
    experience: await prisma.experience.count(),
    projectEntry: await prisma.projectEntry.count(),
    education: await prisma.education.count(),
    skillGroup: await prisma.skillGroup.count(),
    certification: await prisma.certification.count(),
    analysis: await prisma.analysis.count(),
    generatedCV: await prisma.generatedCV.count(),
    usageCounter: await prisma.usageCounter.count(),
    verification: await prisma.verification.count(),
  };
}
