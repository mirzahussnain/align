import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Legacy plan-authority guard (§1, §21).
 *
 * `User.subscriptionTier` is deprecated. Product code must NOT read it — the
 * effective plan comes only from `resolveBillingAccess`. This test scans the
 * source tree and fails if the field is referenced anywhere outside a small,
 * explicitly named allow-list of compatibility/infrastructure modules.
 *
 * The allow-list is deliberately tiny so that a new authoritative read re-appears
 * as a test failure rather than silent dual authority. It shrinks to nothing when
 * the column is dropped at the end of Stage 2.
 */

const SRC = join(process.cwd(), 'src');

/**
 * Matches an actual USE of the field — a property read (`.subscriptionTier`), an
 * object key in a Prisma `select`/`data` or a type (`subscriptionTier:`), or a
 * string-literal reference. Deliberately does NOT match the bare word inside
 * comment prose, so modules may still describe the deprecation without tripping.
 */
const LEGACY_USE = /\.subscriptionTier\b|(?<![`\w])subscriptionTier\s*:|['"]subscriptionTier['"]/;

/**
 * The compatibility bridge and the column itself were removed in Stage 2, so NO
 * product module may reference the legacy field. The allow-list is empty; any
 * reappearance is a test failure.
 */
const ALLOW_LIST = new Set<string>([]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'generated') continue;
      walk(full, acc);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function isTestFile(rel: string): boolean {
  return rel.includes('__tests__') || /\.test\.(ts|tsx)$/.test(rel);
}

describe('legacy plan-authority guard', () => {
  it('no product module reads subscriptionTier outside the compatibility allow-list', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      const relPosix = rel.replaceAll('\\', '/');
      if (isTestFile(relPosix)) continue; // tests may mock the column
      if (ALLOW_LIST.has(relPosix)) continue;
      if (LEGACY_USE.test(readFileSync(file, 'utf8'))) offenders.push(relPosix);
    }
    expect(offenders, `subscriptionTier read outside allow-list:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('keeps the allow-list empty (the legacy field is fully removed)', () => {
    expect(ALLOW_LIST.size).toBe(0);
  });
});
