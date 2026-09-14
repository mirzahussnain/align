# Deployment

The deployment contract is: **set the environment variables, run the migrations, deploy.** There are no per-environment code paths, no `if (production)` branches, and nothing to rebuild differently. Local and production differ only in the values below.

Verify a target's configuration before shipping to it:

```bash
npm run check:env        # names, shapes, and contradictory combinations
npm run check:env:live   # also proves storage credentials, buckets, and privacy
```

`check:env:live` is the one that matters against a fresh provider account. It uploads a probe object, signs it, fetches it, asserts the private bucket **rejects** unsigned reads, asserts the avatars bucket **accepts** them, then deletes the probe. Names being present proves nothing; this proves the buckets actually behave.

## Object storage

MinIO locally, Cloudflare R2 in production. Both speak S3, so the application code is identical — only these change:

| Variable | Local (MinIO) | Production (R2) |
| --- | --- | --- |
| `S3_ENDPOINT` | `http://localhost:9000` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID` | `minioadmin` | R2 API token |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | R2 API token secret |
| `S3_REGION` | `us-east-1` | `auto` — R2 accepts nothing else |
| `S3_FORCE_PATH_STYLE` | `true` | `false` |
| `S3_BUCKET_UPLOADS` | `align-cv-uploads` | same |
| `S3_BUCKET_REWRITES` | `align-cv-rewrites` | same |
| `S3_BUCKET_AVATARS` | `align-users` | same |
| `S3_PUBLIC_URL_AVATARS` | `http://localhost:9000/align-users` | CDN domain or the `*.r2.dev` URL |

Bucket **names** are deliberately identical in both environments, so object keys stored in the database mean the same thing wherever they were written.

`S3_FORCE_PATH_STYLE` is the one that bites: MinIO cannot do virtual-host bucket addressing without wildcard DNS, and R2 only does virtual-host. Getting it backwards produces confusing 404s rather than an obvious error, so `check:env` fails on the mismatch explicitly.

### Bucket setup on a new R2 account

Locally the `minio-init` container creates buckets and sets the avatar policy for you. On R2 that is manual, once:

1. Create the three buckets listed above.
2. Leave `align-cv-uploads` and `align-cv-rewrites` **private** — they hold CV PII and are only ever reached through short-lived presigned URLs.
3. Enable public access on `align-users` only, and point `S3_PUBLIC_URL_AVATARS` at its public hostname. Avatars are fetched by the browser with no credentials, so this bucket must be world-readable.
4. Run `npm run check:env:live` against the production values to confirm all of the above.

Objects do not migrate between environments. Anything already in R2 stays there and will not resolve locally; that is intended, since local dev should never read or write production PII.

## Database

Postgres locally via docker-compose, Neon in production.

- `DATABASE_URL` — the **pooled** Neon URL (`...-pooler...`) for the app.
- `DIRECT_URL` — the same host with `-pooler` removed. Prisma Migrate needs it for DDL and advisory locks, which PgBouncer does not reliably support. Unset locally.

Run `npx prisma migrate deploy` against the target before the new build serves traffic.

## Auth

- `BETTER_AUTH_SECRET` — **must** be rotated away from the development value. `check:env` fails a production build that still carries it. Generate with `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — the app's own public origin, e.g. `https://align.app`. Google OAuth redirects derive from it, so a stale value breaks sign-in.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — optional; social sign-in is skipped when unset. Add the production callback URL in the Google console.

## Rate limiting

`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are optional, and rate limiting **silently no-ops when they are unset**. That is fine locally and a real exposure in production, where the AI endpoints cost money per call. `check:env` warns rather than fails, because the app does run without them — but production should set them.

## Local development

```bash
npm run dev:up      # Postgres + MinIO, buckets created automatically
npm run db:setup    # migrations + prisma generate
npm run dev
```

MinIO's console is at http://localhost:9001 (`minioadmin` / `minioadmin`) if you want to see what was actually written.

`npm run dev:nuke` destroys both volumes for a clean slate.
