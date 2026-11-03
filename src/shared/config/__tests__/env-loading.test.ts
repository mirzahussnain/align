import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../..');
const prismaConfigUrl = pathToFileURL(resolve(repositoryRoot, 'prisma.config.ts')).href;
const checkEnvScript = resolve(repositoryRoot, 'scripts/check-env.mts');
const temporaryDirectories: string[] = [];

function temporaryProject(envLocal: string) {
  const directory = mkdtempSync(resolve(tmpdir(), 'align-env-loading-'));
  temporaryDirectories.push(directory);
  writeFileSync(resolve(directory, '.env.local'), envLocal);
  return directory;
}

function isolatedEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const environment = { ...process.env, ...overrides };
  delete environment.DIRECT_URL;
  delete environment.STRIPE_SECRET_KEY;
  delete environment.STRIPE_WEBHOOK_SECRET;
  delete environment.STRIPE_PRO_MONTHLY_PRICE_ID;
  delete environment.NEXT_PUBLIC_GOTENBERG_PASSWORD;
  delete environment.NEXT_PUBLIC_GOTENBERG_USERNAME;
  delete environment.NEXT_PUBLIC_GOTENBERG_URL;
  delete environment.NEXT_PUBLIC_CF_ACCESS_CLIENT_ID;
  delete environment.NEXT_PUBLIC_CF_ACCESS_CLIENT_SECRET;
  delete environment.CF_ACCESS_CLIENT_ID;
  delete environment.CF_ACCESS_CLIENT_SECRET;
  return environment;
}

function validNonProductionEnvironment(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return isolatedEnvironment({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://external.example/align',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'https://example.test',
    S3_ENDPOINT: 'https://storage.example.test',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_REGION: 'test-region',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET_UPLOADS: 'uploads',
    S3_BUCKET_REWRITES: 'rewrites',
    S3_BUCKET_AVATARS: 'avatars',
    S3_PUBLIC_URL_AVATARS: 'https://avatars.example.test',
    ...overrides,
  });
}

function assertPrismaUrl(cwd: string, environment: NodeJS.ProcessEnv, expected: string) {
  const assertion = [
    `const config = (await import(${JSON.stringify(prismaConfigUrl)})).default;`,
    'if (process.env.DATABASE_URL !== process.argv[1]) process.exit(10);',
    'if (config.datasource?.url !== process.argv[1]) process.exit(11);',
  ].join('\n');

  execFileSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', '--input-type=module', '--eval', assertion, expected],
    { cwd, env: environment, stdio: 'pipe' }
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('manual environment loading', () => {
  test('Prisma keeps an external DATABASE_URL authoritative over local database values', () => {
    const externalUrl = 'postgresql://external.example/align';
    const cwd = temporaryProject(
      [
        'DATABASE_URL=postgresql://localhost/local-database',
        'DIRECT_URL=postgresql://localhost/local-direct',
      ].join('\n')
    );

    assertPrismaUrl(cwd, isolatedEnvironment({ DATABASE_URL: externalUrl }), externalUrl);
  });

  test('Prisma uses .env.local DATABASE_URL when no database URL is supplied externally', () => {
    const localUrl = 'postgresql://localhost/local-fallback';
    const cwd = temporaryProject(`DATABASE_URL=${localUrl}\n`);
    const environment = isolatedEnvironment();
    delete environment.DATABASE_URL;

    assertPrismaUrl(cwd, environment, localUrl);
  });

  test('the environment validator preserves external values and still validates them', () => {
    const cwd = temporaryProject('DATABASE_URL=postgresql://localhost/local-fallback\n');
    const environment = isolatedEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: 'mysql://external.example/align',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://example.test',
      S3_ENDPOINT: 'https://storage.example.test',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_REGION: 'test-region',
      S3_FORCE_PATH_STYLE: 'true',
      S3_BUCKET_UPLOADS: 'uploads',
      S3_BUCKET_REWRITES: 'rewrites',
      S3_BUCKET_AVATARS: 'avatars',
      S3_PUBLIC_URL_AVATARS: 'https://avatars.example.test',
    });

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', checkEnvScript],
      { cwd, env: environment, encoding: 'utf8' }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL must be a postgres:// URL');
    expect(result.stderr).toContain('1 problem(s) must be fixed');
    expect(result.stderr).not.toContain(environment.DATABASE_URL);
  });

  test('production rejects enabled document rendering without protected configuration', () => {
    const cwd = temporaryProject('DATABASE_URL=postgresql://localhost/local-fallback\n');
    const environment = isolatedEnvironment({
      NODE_ENV: 'production',
      DOCUMENT_RENDERER_ENABLED: 'true',
      GOTENBERG_URL: 'http://renderer.example.test',
      DATABASE_URL: 'postgresql://external.example/align',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://example.test',
      S3_ENDPOINT: 'https://storage.example.test',
      S3_ACCESS_KEY_ID: 'test-access-key',
      S3_SECRET_ACCESS_KEY: 'test-secret-key',
      S3_REGION: 'test-region',
      S3_FORCE_PATH_STYLE: 'true',
      S3_BUCKET_UPLOADS: 'uploads',
      S3_BUCKET_REWRITES: 'rewrites',
      S3_BUCKET_AVATARS: 'avatars',
      S3_PUBLIC_URL_AVATARS: 'https://avatars.example.test',
      RESEND_API_KEY: 're_test',
      AUTH_EMAIL_FROM: 'Align <test@example.test>',
      UPSTASH_REDIS_REST_URL: 'https://redis.example.test',
      UPSTASH_REDIS_REST_TOKEN: 'token',
      CRON_SECRET: 'x'.repeat(16),
      REDIS_URL: 'rediss://redis.example.test',
    });

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', checkEnvScript],
      { cwd, env: environment, encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('GOTENBERG_URL must use https:// in production');
    expect(result.stderr).toContain('GOTENBERG_USERNAME is required');
    expect(result.stderr).toContain('GOTENBERG_PASSWORD is required');
    expect(result.stderr).toContain('GOTENBERG_EXPECTED_VERSION is required');
    expect(result.stderr).toContain('GOTENBERG_IMAGE_DIGEST is required');
    expect(result.stderr).toContain('CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are both required');
  });

  test('the environment validator rejects an incomplete remote Cloudflare Access pair without echoing it', () => {
    const cwd = temporaryProject('DATABASE_URL=postgresql://localhost/local-fallback\n');
    const environment = validNonProductionEnvironment({
      DOCUMENT_RENDERER_ENABLED: 'true',
      GOTENBERG_URL: 'https://align-pdf-renderer.vyndra.tech',
      GOTENBERG_USERNAME: 'align-renderer',
      GOTENBERG_PASSWORD: 'renderer-secret',
      GOTENBERG_EXPECTED_VERSION: '8.38.1',
      CF_ACCESS_CLIENT_ID: 'renderer-service-token.access',
    });

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', checkEnvScript],
      { cwd, env: environment, encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are both required for a remote document renderer',
    );
    expect(result.stderr).not.toContain(environment.CF_ACCESS_CLIENT_ID);
  });

  test('the environment validator keeps local Docker rendering compatible without Cloudflare Access', () => {
    const cwd = temporaryProject('DATABASE_URL=postgresql://localhost/local-fallback\n');
    const environment = validNonProductionEnvironment({
      DOCUMENT_RENDERER_ENABLED: 'true',
      GOTENBERG_URL: 'http://127.0.0.1:3001',
      GOTENBERG_USERNAME: 'align-renderer',
      GOTENBERG_PASSWORD: 'local-renderer-change-me',
      GOTENBERG_EXPECTED_VERSION: '8.38.1',
    });

    const result = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', checkEnvScript],
      { cwd, env: environment, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('CF_ACCESS_CLIENT');
  });
});
