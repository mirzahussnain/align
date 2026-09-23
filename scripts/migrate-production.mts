import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'dotenv';

const ENV_FILE = '.env.production.local';
const LOCAL_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '::',
  '::1',
  'db',
  'database',
  'pg',
  'postgres',
  'postgresql',
  'host.docker.internal',
  'gateway.docker.internal',
  'docker.for.mac.localhost',
  'docker.for.win.localhost',
]);

function abort(message: string): never {
  console.error(`Production migration aborted: ${message}`);
  process.exit(1);
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');

  return (
    LOCAL_HOSTS.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.docker.internal') ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function requireRemoteDatabaseUrl(environment: Record<string, string>, name: string) {
  const value = environment[name];
  if (!value) abort(`${name} is required in ${ENV_FILE}.`);

  let hostname: string;
  try {
    hostname = new URL(value).hostname;
  } catch {
    abort(`${name} must be a valid database URL.`);
  }

  if (!hostname || isLocalHostname(hostname)) {
    abort(`${name} must use a non-local database host.`);
  }
}

let productionEnvironment: Record<string, string>;
try {
  productionEnvironment = parse(readFileSync(resolve(process.cwd(), ENV_FILE)));
} catch {
  abort(`${ENV_FILE} is required. Pull it explicitly before running this command.`);
}

requireRemoteDatabaseUrl(productionEnvironment, 'DATABASE_URL');
requireRemoteDatabaseUrl(productionEnvironment, 'DIRECT_URL');

const prismaEntrypoint = resolve(process.cwd(), 'node_modules/prisma/build/index.js');
const childEnvironment = { ...process.env, ...productionEnvironment };

function runPrisma(args: string[], label: string) {
  console.log(label);
  const result = spawnSync(process.execPath, [prismaEntrypoint, ...args], {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: 'inherit',
  });

  if (result.error) abort(`Could not start Prisma for ${args.join(' ')}.`);
  if (result.status !== 0) abort(`Prisma ${args.join(' ')} failed with exit code ${result.status}.`);
}

runPrisma(['migrate', 'deploy'], 'Applying production database migrations...');
runPrisma(['migrate', 'status'], 'Checking production migration status...');
