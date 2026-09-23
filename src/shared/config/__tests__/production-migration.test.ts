import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const migrationScript = resolve(repositoryRoot, 'scripts/migrate-production.mts');
const temporaryDirectories: string[] = [];

function createProject(envFile: string) {
  const directory = mkdtempSync(resolve(tmpdir(), 'align-production-migration-'));
  const prismaEntrypoint = resolve(directory, 'node_modules/prisma/build/index.js');
  const marker = resolve(directory, 'prisma-invocations.jsonl');

  temporaryDirectories.push(directory);
  mkdirSync(resolve(prismaEntrypoint, '..'), { recursive: true });
  writeFileSync(resolve(directory, '.env.production.local'), envFile);
  writeFileSync(
    prismaEntrypoint,
    [
      "const { appendFileSync } = require('node:fs');",
      "appendFileSync(process.env.TEST_MIGRATION_MARKER, JSON.stringify(process.argv.slice(2)) + '\\n');",
    ].join('\n')
  );

  return { directory, marker };
}

function runMigration(directory: string, marker: string) {
  const environment: NodeJS.ProcessEnv = { ...process.env, TEST_MIGRATION_MARKER: marker };
  delete environment.DATABASE_URL;
  delete environment.DIRECT_URL;

  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', migrationScript],
    { cwd: directory, env: environment, encoding: 'utf8' }
  );
}

function invocations(marker: string) {
  if (!existsSync(marker)) return [];
  return readFileSync(marker, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('safe production migrations', () => {
  test.each([
    ['DATABASE_URL', 'DIRECT_URL=postgresql://user:secret@db.example.com/align\n'],
    ['DIRECT_URL', 'DATABASE_URL=postgresql://user:secret@db.example.com/align\n'],
  ])('refuses to run when %s is missing', (missingVariable, envFile) => {
    const { directory, marker } = createProject(envFile);

    const result = runMigration(directory, marker);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${missingVariable} is required`);
    expect(result.stderr).not.toContain('secret');
    expect(invocations(marker)).toEqual([]);
  });

  test.each([
    'localhost',
    'api.localhost',
    '127.0.0.1',
    '127.42.0.9',
    '[::1]',
    '0.0.0.0',
    'db',
    'postgres',
    'host.docker.internal',
    'database.local',
  ])('refuses the local database hostname %s', (hostname) => {
    const envFile = [
      `DATABASE_URL=postgresql://user:database-secret@${hostname}/align`,
      'DIRECT_URL=postgresql://user:direct-secret@remote.example.com/align',
    ].join('\n');
    const { directory, marker } = createProject(envFile);

    const result = runMigration(directory, marker);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL must use a non-local database host');
    expect(result.stderr).not.toContain('database-secret');
    expect(result.stderr).not.toContain('direct-secret');
    expect(invocations(marker)).toEqual([]);
  });

  test('runs deploy then status for remote URLs without logging secrets', () => {
    const databaseSecret = 'database-password-not-for-output';
    const directSecret = 'direct-password-not-for-output';
    const envFile = [
      `DATABASE_URL=postgresql://user:${databaseSecret}@prod-locality.example.com/align`,
      `DIRECT_URL=postgresql://user:${directSecret}@direct.example.com/align`,
    ].join('\n');
    const { directory, marker } = createProject(envFile);

    const result = runMigration(directory, marker);

    expect(result.status).toBe(0);
    expect(invocations(marker)).toEqual([
      ['migrate', 'deploy'],
      ['migrate', 'status'],
    ]);
    expect(`${result.stdout}${result.stderr}`).not.toContain(databaseSecret);
    expect(`${result.stdout}${result.stderr}`).not.toContain(directSecret);
  });
});
