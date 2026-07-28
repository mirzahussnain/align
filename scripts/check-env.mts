// Pre-deploy environment check.
//
// The deployment contract for this app is "set the environment variables and it
// runs" — no code changes, no per-environment branches. That contract is only
// worth anything if breaking it is loud, so this script asserts every variable
// the app cannot start without, and with `--live` proves the storage
// credentials actually work against the configured provider.
//
//   npm run check:env          names and shapes only (no network)
//   npm run check:env:live     also does a real upload/sign/delete round trip
//
// Run it in CI before a deploy, or locally after editing .env.local.
import { config } from 'dotenv';

// Mirrors Next.js's own precedence: .env.local wins over .env. On a real
// platform (Vercel, Fly, a container) neither file exists and the variables are
// already in the environment — override:false leaves those untouched.
config({ path: '.env.local', override: false, quiet: true });
config({ path: '.env', override: false, quiet: true });

type Check = {
  name: string;
  required: boolean;
  note: string;
  /** Returns an error string when the value is present but malformed. */
  validate?: (value: string) => string | undefined;
};

const url = (value: string) =>
  /^https?:\/\//.test(value) ? undefined : 'must start with http:// or https://';

const CHECKS: Check[] = [
  // ── Database ───────────────────────────────────────────────────────────────
  {
    name: 'DATABASE_URL',
    required: true,
    note: 'Postgres connection string (Neon pooled URL in production)',
    validate: (v) => (v.startsWith('postgres') ? undefined : 'must be a postgres:// URL'),
  },
  {
    name: 'DIRECT_URL',
    required: false,
    note: 'Neon unpooled URL — required for `prisma migrate` against Neon, unset locally',
  },

  // ── Auth ───────────────────────────────────────────────────────────────────
  {
    name: 'BETTER_AUTH_SECRET',
    required: true,
    note: 'Session signing secret — MUST differ from the local value in production',
    validate: (v) =>
      v.length >= 32 ? undefined : 'too short; generate with `openssl rand -base64 32`',
  },
  {
    name: 'BETTER_AUTH_URL',
    required: true,
    note: "The app's own public origin, e.g. https://align.app",
    validate: url,
  },
  { name: 'GOOGLE_CLIENT_ID', required: false, note: 'Google sign-in (optional)' },
  { name: 'GOOGLE_CLIENT_SECRET', required: false, note: 'Google sign-in (optional)' },

  // ── Object storage ─────────────────────────────────────────────────────────
  {
    name: 'S3_ENDPOINT',
    required: true,
    note: 'MinIO http://localhost:9000 locally; https://<account>.r2.cloudflarestorage.com on R2',
    validate: url,
  },
  { name: 'S3_ACCESS_KEY_ID', required: true, note: 'Storage access key' },
  { name: 'S3_SECRET_ACCESS_KEY', required: true, note: 'Storage secret key' },
  {
    name: 'S3_REGION',
    required: true,
    note: "'auto' on R2 (it accepts nothing else); 'us-east-1' for MinIO",
  },
  {
    name: 'S3_FORCE_PATH_STYLE',
    required: true,
    note: "'true' for MinIO, 'false' for R2",
    validate: (v) => (v === 'true' || v === 'false' ? undefined : "must be 'true' or 'false'"),
  },
  { name: 'S3_BUCKET_UPLOADS', required: true, note: 'Private bucket: raw CV uploads' },
  { name: 'S3_BUCKET_REWRITES', required: true, note: 'Private bucket: generated CVs' },
  { name: 'S3_BUCKET_AVATARS', required: true, note: 'Public-read bucket: avatars' },
  {
    name: 'S3_PUBLIC_URL_AVATARS',
    required: true,
    note: 'Public base URL of the avatars bucket (CDN domain, or <endpoint>/<bucket>)',
    validate: url,
  },

  // ── AI + third-party data ──────────────────────────────────────────────────
  { name: 'GEMINI_API_KEY', required: true, note: 'Primary analysis model' },
  { name: 'GROQ_API_KEY', required: false, note: 'Fallback model' },
  { name: 'REED_API_KEY', required: false, note: 'Job source (that source is skipped if unset)' },
  { name: 'ADZUNA_APP_ID', required: false, note: 'Job source' },
  { name: 'ADZUNA_APP_KEY', required: false, note: 'Job source' },
  { name: 'JOOBLE_API_KEY', required: false, note: 'Job source' },
  { name: 'GOVUK_SPONSOR_CSV_URL', required: false, note: 'Sponsor register (falls back to a pinned URL)' },
  {
    name: 'UPSTASH_REDIS_REST_URL',
    required: false,
    note: 'Rate limiting — NO-OPS ENTIRELY IF UNSET, so production really wants this',
  },
  { name: 'UPSTASH_REDIS_REST_TOKEN', required: false, note: 'Rate limiting' },
  {
    name: 'REDIS_URL',
    required: false,
    note: 'Job Board cache — searches still work if unset, but nothing is cached or shared across instances',
    validate: (v) =>
      v.startsWith('redis://') || v.startsWith('rediss://')
        ? undefined
        : 'must be a redis:// or rediss:// URL (this is NOT the Upstash REST URL)',
  },

  // ── Billing (Stripe) ─────────────────────────────────────────────────────────
  // Optional in Stage 1: the app runs without them; only Stripe-specific paths
  // (checkout/webhooks/portal, none of which are live yet) require them. The
  // secret and webhook secret are server-only and must NEVER be NEXT_PUBLIC_*.
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    note: 'Stripe server secret (server-only) — needed only once checkout goes live',
    validate: (v) => (v.startsWith('sk_') ? undefined : "must start with 'sk_'"),
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    note: 'Stripe webhook signing secret (server-only)',
    validate: (v) => (v.startsWith('whsec_') ? undefined : "must start with 'whsec_'"),
  },
  {
    name: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
    required: false,
    note: 'Stripe publishable key (safe on the client)',
    validate: (v) => (v.startsWith('pk_') ? undefined : "must start with 'pk_'"),
  },
  {
    name: 'STRIPE_PRO_MONTHLY_PRICE_ID',
    required: false,
    note: 'Stripe price id for the Pro Monthly offer (server-only)',
    validate: (v) => (v.startsWith('price_') ? undefined : "must start with 'price_'"),
  },
  {
    name: 'NEXT_PUBLIC_APP_URL',
    required: false,
    note: 'Public origin used to build checkout return URLs (defaults to localhost)',
    validate: url,
  },
];

const errors: string[] = [];
const warnings: string[] = [];

for (const check of CHECKS) {
  const value = process.env[check.name];

  if (!value) {
    if (check.required) errors.push(`${check.name} is not set — ${check.note}`);
    else warnings.push(`${check.name} is not set — ${check.note}`);
    continue;
  }

  const problem = check.validate?.(value);
  if (problem) errors.push(`${check.name} ${problem}`);
}

// Cross-field checks: individually valid values that contradict each other. These
// are the failures that otherwise survive review and only show up in production.
const endpoint = process.env.S3_ENDPOINT ?? '';
const pathStyle = process.env.S3_FORCE_PATH_STYLE;
const region = process.env.S3_REGION;
const isR2 = endpoint.includes('r2.cloudflarestorage.com');

if (isR2 && pathStyle === 'true') {
  errors.push('S3_FORCE_PATH_STYLE must be false for R2 (it uses virtual-host bucket addressing)');
}
if (isR2 && region && region !== 'auto') {
  errors.push(`S3_REGION must be 'auto' for R2, got '${region}'`);
}
if (!isR2 && endpoint.includes('localhost') && pathStyle === 'false') {
  errors.push('S3_FORCE_PATH_STYLE must be true for MinIO (no wildcard DNS for virtual-host buckets)');
}
// Stripe is all-or-nothing: once the secret key is present the app is expected to
// transact, so the webhook secret and the Pro price id must be present too — a
// half-configured Stripe is worse than none (checkout or webhook verification
// fails at runtime instead of at deploy). Absent entirely is fine (billing is
// simply not live).
if (process.env.STRIPE_SECRET_KEY) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    errors.push('STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not — webhooks cannot be verified');
  }
  if (!process.env.STRIPE_PRO_MONTHLY_PRICE_ID) {
    errors.push('STRIPE_SECRET_KEY is set but STRIPE_PRO_MONTHLY_PRICE_ID is not — checkout has no price to sell');
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  // Live/test key mismatch is a classic footgun: a live secret with a test
  // publishable key (or vice-versa) silently talks to the wrong Stripe mode.
  if (publishable && secret.startsWith('sk_live_') && !publishable.startsWith('pk_live_')) {
    errors.push('STRIPE_SECRET_KEY is a live key but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not — Stripe mode mismatch');
  }
  if (publishable && secret.startsWith('sk_test_') && publishable.startsWith('pk_live_')) {
    errors.push('STRIPE_SECRET_KEY is a test key but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is live — Stripe mode mismatch');
  }
}

if (process.env.NODE_ENV === 'production') {
  if (endpoint.includes('localhost')) {
    errors.push('S3_ENDPOINT points at localhost in a production build');
  }
  if (process.env.DATABASE_URL?.includes('localhost')) {
    errors.push('DATABASE_URL points at localhost in a production build');
  }
  if (process.env.BETTER_AUTH_SECRET === 'I20XhOLyHIBFWrB/RKCGlHVj3DapSgf9J0Edv7tiYDo=') {
    errors.push('BETTER_AUTH_SECRET is still the development value — rotate it');
  }
}

for (const warning of warnings) console.log(`  ~ ${warning}`);
for (const error of errors) console.error(`  x ${error}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} problem(s) must be fixed before this will run.`);
  process.exit(1);
}

console.log(
  `\nOK: ${CHECKS.filter((c) => c.required).length} required variable(s) present` +
    (warnings.length ? `, ${warnings.length} optional one(s) unset.` : '.')
);

// ── Live storage round trip ──────────────────────────────────────────────────
// Names being present proves nothing about whether the credentials work, the
// buckets exist, or the avatars bucket is actually public. Against a brand new
// R2 account those are exactly the things that are wrong, so prove them.
if (process.argv.includes('--live')) {
  const { storage, keyFor } = await import('../src/shared/lib/storage.ts');

  console.log('\nLive storage check…');
  const body = Buffer.from(`check-env ${new Date().toISOString()}`);
  const probeKey = keyFor.upload('_healthcheck', '_probe', 'probe.txt');

  await storage.upload({ bucket: 'uploads', key: probeKey, body, contentType: 'text/plain' });
  console.log('  ok  upload to private bucket');

  const roundTripped = await storage.download('uploads', probeKey);
  if (!roundTripped.equals(body)) throw new Error('downloaded bytes did not match uploaded bytes');
  console.log('  ok  download round trip');

  const signed = await storage.createSignedUrl('uploads', probeKey, 60);
  const signedResponse = await fetch(signed);
  if (!signedResponse.ok) throw new Error(`presigned URL returned ${signedResponse.status}`);
  console.log('  ok  presigned URL is fetchable');

  // The private buckets holding CV PII must NOT be world-readable. A bucket
  // accidentally left public is the single worst misconfiguration here, so it
  // fails the check rather than merely warning.
  const unsignedResponse = await fetch(
    `${endpoint.replace(/\/$/, '')}/${process.env.S3_BUCKET_UPLOADS}/${probeKey}`
  );
  if (unsignedResponse.ok) {
    throw new Error(
      `PRIVATE BUCKET IS PUBLIC: ${process.env.S3_BUCKET_UPLOADS} served an unsigned request ` +
        `(${unsignedResponse.status}). Remove public access before deploying.`
    );
  }
  console.log(`  ok  private bucket rejects unsigned reads (${unsignedResponse.status})`);

  await storage.delete('uploads', probeKey);
  console.log('  ok  delete');

  // Avatars must be readable with no credentials, or every profile picture 403s.
  const avatarKey = keyFor.avatar('_healthcheck', 'probe.txt');
  await storage.upload({ bucket: 'avatars', key: avatarKey, body, contentType: 'text/plain' });
  const publicResponse = await fetch(storage.publicUrl(avatarKey));
  if (!publicResponse.ok) {
    throw new Error(
      `avatars bucket is not publicly readable at ${storage.publicUrl(avatarKey)} ` +
        `(${publicResponse.status}). Check S3_PUBLIC_URL_AVATARS and the bucket's public-access setting.`
    );
  }
  console.log('  ok  avatars bucket is publicly readable');
  await storage.delete('avatars', avatarKey);

  console.log('\nStorage is correctly configured.');
}
