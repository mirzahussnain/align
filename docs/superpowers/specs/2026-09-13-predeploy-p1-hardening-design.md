# Pre-deployment P1 Hardening Design

## Scope

Implement only the five approved P1 fixes: atomic Saved Job limits, atomic Career Profile limits, trusted provider-job persistence, bounded CV-regeneration context, and Vercel-compatible direct Stored CV uploads. Existing pricing, Stripe integration, billing models, ATS/Job Match scoring, navigation, and unrelated UI remain unchanged.

## Shared conventions

- Authentication stays at route/server-action boundaries; services receive a trusted `userId`.
- Resource mutations use Prisma interactive transactions and the existing two-key PostgreSQL advisory-lock convention.
- Plan resolution occurs inside the locked operation when it controls a resource mutation.
- Routes validate strict, minimal inputs and delegate business rules to one authoritative service.
- Stable API errors expose product-safe codes without storage or billing internals.
- New behavior is developed test-first and verified with real PostgreSQL and MinIO where concurrency or storage semantics matter.
- Comments are limited to short explanations of non-obvious security or concurrency invariants.

## Saved Jobs

Create one Saved Job mutation boundary exposing `saveJobForUser` and `unsaveJobForUser`. The save service accepts only `userId`, `jobSnapshotId`, and optional `profileId`; it verifies access to shared or user-owned private snapshots and ownership of the optional profile.

Inside one transaction it takes an advisory lock keyed by user and `saved_jobs`, resolves the effective plan, reloads an existing save for idempotency, counts saved jobs, applies the registry limit, and creates or updates the save before releasing the lock. A duplicate save updates only its optional profile association and does not consume capacity. Limit failures use `SAVED_JOB_LIMIT_REACHED` alongside the repository entitlement payload.

Both `/api/saved-jobs` and `/api/jobs/[jobSnapshotId]/save` call this boundary. Their delete variants call the same unsave service, supporting deletion by Saved Job ID or snapshot ID without duplicating mutation logic.

## Career Profiles

Create one Career Profile service exposing `createProfileWithinPlanLimit`. It validates and normalises the label and optional targeting fields, then takes a user-scoped `additional_career_profiles` advisory lock inside an interactive transaction. Under that lock it resolves the plan, counts profiles, checks the registry limit, selects a collision-free label when requested by onboarding, and creates the row.

The first profile becomes the default; later profiles do not. Dashboard creation, onboarding draft creation, and implicit first-profile creation use this boundary. Default switching and deletion use the same profile lock so concurrent operations cannot produce multiple defaults or leave a surviving profile without a default. Existing unique `(userId, label)` enforcement remains authoritative for labels; no partial-index migration is needed.

Limit failures use `PROFILE_LIMIT_REACHED` with the existing entitlement decision. One user's lock and count never affect another user.

## Trusted provider-job persistence

Provider search already materialises every returned result into a durable `JobSnapshot` on the server and returns its server-created `id`. The call graph confirms those results come from provider adapters, server refresh jobs, or existing shared snapshots; that ID becomes the sole browser reference for details and saves.

`/api/saved-jobs` changes from a passthrough provider object to a strict `{ jobSnapshotId, profileId? }` body. `/api/jobs/snapshots` remains only as a strict snapshot-ID lookup for legacy compatibility and cannot create or update a snapshot. Canonical snapshot writers are renamed and scoped as provider-ingestion functions accepting only internal `NormalisedJob` values produced by provider adapters or trusted server discovery.

The active Job Board already uses snapshot IDs. Any retained legacy client is updated to use the ID projection and cannot submit title, company, provider identifiers, canonical IDs, descriptions, or metadata.

Shared provider snapshots never receive user-pasted descriptions. A fuller description for a shared vacancy remains private in `JobMatchRequest.descriptionText` and becomes the user's match-specific `JobRevision`. Private/manual imported jobs remain user-authored and ownership-scoped. Tests cover forged and unknown fields, invalid/foreign references, cross-user privacy, imported jobs, and saves.

## CV regeneration input limits

Add reusable limits beside the existing analysis-domain configuration:

- HITL entries: 20
- HITL key length: 120 characters
- HITL value length: 2,000 characters
- HITL serialized bytes: 40,000
- approved profile evidence items: 100
- application evidence context IDs: 100
- contextual identifier length: 128 characters
- total serialized contextual payload: 65,536 bytes

The strict Zod request schema rejects unknown fields, duplicate semantic IDs, and any individual or aggregate overflow. Byte limits use UTF-8 byte length, not JavaScript character count. Parsing and aggregate validation run immediately after authentication, before entitlement lookup, reservation, analysis/profile database reads, or provider invocation. Inputs are rejected rather than truncated.

## Direct Stored CV uploads

### Data model

Add `CvUploadIntent` with a forward Prisma migration. It records the owner, random object key, bounded display filename, expected MIME and byte size, status, expiry, creation time, and completion time. Statuses are `PENDING`, `VALIDATING`, `COMPLETED`, `FAILED`, and `EXPIRED`.

Live intents count as reserved `stored_source_cvs` slots. The exact predicate is `status IN (PENDING, VALIDATING) AND expiresAt > now`; `FAILED`, `EXPIRED`, and `COMPLETED` never count. Intent creation and finalization share the existing stored-CV advisory lock so concurrent intents/finalizations cannot exceed the plan cap.

### Intent creation

`POST /api/stored-cvs/upload-intent` authenticates, rate-limits, and validates strict filename, extension, MIME, and size metadata. It supports PDF and DOCX up to 10 MiB. Under the stored-CV resource lock it resolves the plan, counts active Stored CVs plus live intents, and creates one five-minute intent with a UUID-based key under `users/{userId}/stored-cv-intents/`.

The storage abstraction gains presigned PUT and object-stat operations. The PUT is private, scoped to one server-owned key, short-lived, and bound to the expected content type and length where supported by the S3-compatible signer. The response contains only the URL, required headers, intent ID, and expiry.

### Finalization

`POST /api/stored-cvs/upload-complete` authenticates and atomically claims an unused, unexpired intent belonging to the caller. Claiming changes `PENDING` to `VALIDATING` and extends `expiresAt` to a ten-minute validation lease, preventing both concurrent finalizers and expiry during processing. It then stats the object, rejects missing or mismatched size, downloads the object once, and applies the existing PDF/DOCX signature and container validation. It derives canonical MIME, format, checksum, and safe display filename server-side.

Under the resource lock, finalization rechecks the intent state. A duplicate checksum returns the existing Stored CV and deletes the redundant object. Otherwise it creates or revives the Stored CV while atomically completing the reserved intent. Reuse, ownership failures, expiry, malformed content, and size mismatch return stable upload errors and never create an active Stored CV.

### Cleanup and browser flow

A retry-safe cleanup service finds expired `PENDING` or stale `VALIDATING` intents and failed intents, deletes their exact objects, and marks non-terminal expired rows `EXPIRED`. Missing objects are treated as already clean. Capacity is released by the time-based count predicate even before cleanup runs, so an abandoned intent can block a user for at most five minutes and a crashed finalizer for at most ten. Request handlers await only work required for their operation; cleanup is exposed for maintenance and may be invoked in bounded awaited batches.

The onboarding/shared Stored CV API requests an intent, uploads the `File` directly with PUT, finalizes it, then continues the existing extraction/import flow. The 10 MiB product limit remains. The old multipart Stored CV POST is removed.

Authenticated ATS and Job Match routes can already consume `storedCvId`; their direct multipart alternative receives a 4 MiB limit and matching UI copy instead of advertising a 10 MiB Vercel upload. The public demo receives the same 4 MiB multipart ceiling because its temporary semantics should not consume Stored CV capacity.

### MinIO and R2

The Docker MinIO initializer applies CORS to the private uploads bucket for the local origins used by the app, allowing only presigned `PUT` requirements. Production documentation provides the equivalent R2 rule for `https://align.vyndra.tech`. Neither configuration grants public read or list access.

## Error handling

Stable codes include `SAVED_JOB_LIMIT_REACHED`, `PROFILE_LIMIT_REACHED`, `INVALID_JOB_REFERENCE`, `CV_UPLOAD_INTENT_EXPIRED`, `CV_UPLOAD_SIZE_MISMATCH`, `CV_UPLOAD_INVALID_CONTENT`, and `CV_UPLOAD_LIMIT_REACHED`. Existing response wrappers translate these into safe HTTP responses.

Storage validation failure marks the intent failed and deletes its object before returning. A recoverable delete failure leaves a retryable cleanup record. Database transactions never include an object-storage network call.

## Testing and validation

Unit/route tests cover strict schemas, shared service use, stable errors, idempotency, ownership, forged provider fields, private JD isolation, regeneration boundaries, provider/reservation non-invocation, upload intent lifecycle, byte validation, and browser direct-upload behavior.

PostgreSQL integration tests use parallel promises to prove Saved Job, Profile, and Stored CV final-slot enforcement. MinIO integration tests create an intent, PUT through the presigned URL, finalize PDF and DOCX files, verify private access, test mismatch/malformed/reuse cases, and run cleanup repeatedly.

Final validation uses repository scripts for Prisma validation/generation/migration status, focused tests, full tests, typecheck, lint, and production build. Docker Compose supplies PostgreSQL, Redis where existing suites require it, and MinIO. Stripe-related files and behavior are excluded.
