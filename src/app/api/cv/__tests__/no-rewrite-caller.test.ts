import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

/** Every source file under src, excluding test files (which name the endpoint). */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue;
      sourceFiles(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

describe('cv/rewrite consolidation', () => {
  it('has no remaining caller of the deprecated /api/cv/rewrite endpoint', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      readFileSync(f, 'utf8').includes('/api/cv/rewrite')
    );
    expect(offenders).toEqual([]);
  });

  it('has removed the /api/cv/rewrite route and schema files', () => {
    expect(existsSync(join(SRC, 'app/api/cv/rewrite/route.ts'))).toBe(false);
    expect(existsSync(join(SRC, 'app/api/cv/rewrite/schema.ts'))).toBe(false);
  });
});
