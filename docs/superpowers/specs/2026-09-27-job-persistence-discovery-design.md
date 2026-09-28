# Job Persistence and Discovery Refinement Design

**Date:** 2026-09-27
**Status:** Approved architecture, ready for implementation planning
**Scope:** Jobs discovery, durable job actions, ATS catalogue discovery, retention, and scheduled maintenance

## Purpose

Reduce unnecessary PostgreSQL writes by keeping market-wide search results ephemeral until a durable product action needs a `JobSnapshot`, while preserving stable details, Saved Jobs, Job Match history, ATS catalogue discovery, provenance, deduplication, and provider behavior.

This is a boundary refactor, not a provider rewrite. Redis remains the store for ephemeral normalized search documents. PostgreSQL remains the durable store for ATS catalogue rows and user-owned or historically reproducible job state.

## Goals

- Anonymous and authenticated live-provider search, filtering, sorting, pagination, and detail viewing perform zero `JobSnapshot` writes.
- Save Job and Job Match materialize an ephemeral live job exactly once through one idempotent service.
- ACTIVE Greenhouse, Lever, and Ashby catalogue rows participate in ordinary Jobs discovery without an employer selection.
- A source-specific live search does not leak ATS catalogue results.
- Redis expiry produces a typed, recoverable result unless an existing durable snapshot can be resolved safely.
- ATS jobs rediscovered by refresh become ACTIVE again.
- Retention follows ACTIVE -> ARCHIVED -> PURGED without deleting any snapshot protected by durable product data.
- Existing daily Vercel maintenance scheduling, authentication, locking, bounded concurrency, and manual recovery paths remain authoritative.
- No Prisma schema migration is required.

## Non-goals

- Rewriting live-provider adapters or integrating new providers.
- Converting ATS feeds to on-demand live search.
- Redesigning the Jobs UI, Career Market, sponsorship, billing, Redis, or PostgreSQL.
- Adding BullMQ, a worker service, a second durable database, or a per-job Redis keyspace.
- Introducing a new database status solely to represent the seven-day ATS discovery freshness window.

## Current-state conclusions

### Identity dependency map

The active search API returns `JobSnapshot.id` to authenticated users because `materialiseSearchJobCards()` persists the entire displayed page. Cards, detail selection, `/dashboard/jobs/[jobSnapshotId]`, `/api/jobs/[jobSnapshotId]`, Save Job, match preparation, and description attachment consequently treat the displayed `id` as a database identifier. Anonymous cards already use `NormalisedJob.canonicalJobId` and do not persist.

Saved Jobs and Job Match require durable snapshot identifiers. Job Match additionally creates an immutable `JobRevision`, which must remain unchanged. Generated CVs refer to `JobMatch` and/or `JobRevision`, not directly to `JobSnapshot`. Application tracking is represented by `SavedJob.applicationStatus` rather than a separate application model.

### Existing identities have different meanings

The implementation must preserve and explicitly name three different identities:

1. **Search identity — `NormalisedJob.canonicalJobId`.** A deterministic identity for a normalized provider result within Redis search/session state. It is derived from provider, employer board identity when present, and source job ID. It is suitable for cards and ephemeral details, but it is not a database primary key.
2. **Equivalence identity — `NormalisedJob.dedupeFingerprint` / `JobSnapshot.canonicalJobId`.** A cross-provider content-equivalence key based on normalized title, employer, and location. The historical column name is retained; no migration or semantic rewrite is required.
3. **Persistent identity — `JobSnapshot.id`.** The PostgreSQL identifier required by durable relations and historical workflows.

Provider references `(provider, sourceJobId)` are the strongest durable provenance identity because the schema enforces their uniqueness. Canonical/application URLs are supporting provenance only; they are not currently unique and must not become an unsafe primary identity in this refactor.

### Current write path

`GET /api/jobs` normalizes, deduplicates, filters, ranks, and buffers full `NormalisedJob` objects in Redis. Its authenticated response path then calls `materialiseSearchJobCards()`, which calls `materialiseTrustedProviderSnapshotIds()` and creates/updates snapshots for every displayed job. Authentication alone therefore crosses the durable boundary. Anonymous responses call `projectPublicSearchJobCards()` and are already write-free.

### Redis recovery

Each search session stores the complete ordered `NormalisedJob[]` under `searchBuffer(sessionId)` for 15 minutes, plus session ownership/query metadata. A job can be recovered by scanning that bounded buffer for `canonicalJobId`. There is no standalone canonical-job lookup, and this design does not add one initially.

### ATS discovery and population

`getAtsSnapshotProviderResults()` is already called on the normal search path and loads verified, enabled, ACTIVE, recently seen ATS snapshots. The observed absence is principally operational: the inspected environment has zero verified/enabled Greenhouse, Lever, or Ashby boards and therefore zero current ATS snapshots.

There are also two search-composition defects:

- ATS results are appended even when a specific live source is selected.
- ATS rows are not made eligible by the user's keyword and location before ranking, so catalogue rows can be irrelevant or rank unpredictably.

The seven-day `lastSeenAt` window is correct for discovery. It is not the same as archival status and does not require writing a STALE state.

### Scheduling and retention

`vercel.json` already invokes `/api/cron/maintenance` daily at 03:17 UTC. The route uses `CRON_SECRET`; `runScheduledMaintenance()` uses the existing Redis distributed lock, bounded board batches (`limit: 10`) and concurrency (`2`), and runs retention plus all three ATS refreshers. Manual scripts remain useful for diagnosis and recovery.

Current retention archives eligible shared snapshots after roughly 45 days but does not purge. Its protection checks are incomplete. The schema establishes four direct purge blockers:

- `importedByUserId != null`
- any `SavedJob`
- any `JobMatchRequest`
- any `JobRevision`

Generated CV history is covered through its immutable `JobRevision` relation. A protected snapshot is never purged merely because it is old.

## Target architecture

```text
Market-wide/official provider
  -> normalize -> deduplicate -> Redis search session -> display/details
  -> Save or Job Match -> resolve session job -> ensurePersistedJob -> durable workflow

Verified employer ATS board
  -> scheduled refresh -> normalize -> ensurePersistedJob -> ACTIVE PostgreSQL catalogue
  -> ordinary Jobs discovery -> normalize/project -> deduplicate with live results -> display
```

All providers continue to expose only `NormalisedJob` beyond their adapter boundary. Provider-specific payloads never reach React or API contracts.

## Search-card and reference contract

Search cards will carry:

```ts
type SearchJobCard = {
  id: string;                 // canonicalJobId; React/UI search identity
  canonicalJobId: string;
  jobSnapshotId?: string;     // present when a safe durable snapshot already exists
  // existing presentation fields
};
```

The search response already carries `sessionId`; it remains the capability used to retrieve an ephemeral job. The UI retains `{ sessionId, canonicalJobId, jobSnapshotId? }` for the selected card. It must not infer that `id` is a UUID.

Persisted ATS results and already-materialized live results may include `jobSnapshotId` through a read-only batched lookup. This permits details and durable actions to bypass Redis without writing. Saved state is also joined read-only against those resolved snapshot IDs.

## Read-only job resolution

Introduce a provider-neutral `job-reference` service with a discriminated result:

```ts
type JobReference = {
  canonicalJobId: string;
  jobSnapshotId?: string;
  sessionId?: string;
};

type ResolvedJobReference =
  | { kind: "persisted"; jobSnapshotId: string }
  | { kind: "ephemeral"; job: NormalisedJob };
```

Resolution order is:

1. If `jobSnapshotId` is supplied, verify visibility/ownership using the existing snapshot rules.
2. Otherwise, attempt a safe existing-snapshot lookup using known stable provider references and then the equivalence fingerprint available from the session job.
3. Validate the search session owner (`userId` or anonymous ownership semantics already enforced by session resolution), load its buffer, and locate the exact `canonicalJobId`.
4. If neither a safe existing snapshot nor the session job is available, throw `APIError` with HTTP 410 and code `EPHEMERAL_JOB_EXPIRED`.

Resolution never refetches an upstream provider and never constructs incomplete job content from URL/query fields.

### Detail behavior

Opening details is read-only. `/api/jobs/[jobReference]` accepts optional `sessionId` and optional explicit `jobSnapshotId` metadata from the UI contract. For a persisted reference it uses the current snapshot view. For an ephemeral reference it projects a detail view directly from `NormalisedJob`, including description, provenance links, salary, sponsorship evidence, and other already-normalized fields. The dashboard route may keep its current dynamic segment, but the segment becomes a job reference rather than an assumed database UUID.

Description attachment remains a durable action because it creates user-owned state; it first ensures the job is persisted.

## Stable provider identity

Add provider-neutral identity confidence to the in-memory contract:

```ts
type ProviderReference = {
  provider: JobProvider;
  sourceJobId: string;
  sourceUrl: string;
  applicationUrl?: string;
  identityStability?: "STABLE" | "SESSION_ONLY";
};
```

Absence defaults to `STABLE` for existing adapters and persisted ATS projections. The Jooble adapter marks its array-index fallback reference `SESSION_ONLY`; such a reference remains valid for card identity during that session but is not written to `JobProviderReference` and is not sufficient by itself to create a durable snapshot. If no stable reference or safely matched existing snapshot exists, durable action returns a typed `JOB_IDENTITY_UNSTABLE` conflict instead of guessing. Future adapters inherit this same rule.

`NormalisedJob.canonicalJobId` may still incorporate the fallback because it only needs to identify the buffered result within the current search session.

## One durable materialization boundary

`ensurePersistedJob(job: NormalisedJob)` becomes the sole provider-neutral durable boundary. Existing ATS refresh and all user durable actions call it; `persistTrustedProviderJob()` is removed or retained only as a compatibility wrapper delegating to it during the transition.

Lookup and mutation order:

1. Normalize and sort stable provider reference keys.
2. In one transaction, serialize competing materializations for those keys (using transaction-scoped PostgreSQL advisory locking or an equivalently safe existing Prisma/PostgreSQL technique).
3. Query `JobProviderReference` by `(provider, providerJobId)`; this is authoritative.
4. If no reference matches, query the existing snapshot equivalence key (`JobSnapshot.canonicalJobId = dedupeFingerprint`) subject to existing public/private ownership rules.
5. Update the matched snapshot or create one only when neither identity resolves.
6. Upsert every stable provider reference, retaining canonical/provider and application URLs.
7. Set a rediscovered provider snapshot to ACTIVE and update freshness/provenance timestamps.
8. Preserve the richer existing description when a refresh supplies shorter or incomplete content, following the current merge rules.
9. Return `{ snapshot, outcome }`, where outcome is `CREATED`, `UPDATED`, `REACTIVATED`, or `UNCHANGED`, so refresh and maintenance summaries can report useful counts without extra writes.

The unique provider-reference constraint remains a final concurrency guard. A unique-conflict retry re-runs resolution inside a bounded retry rather than returning a duplicate or losing provenance.

Private imported/user-owned snapshots are never merged into public provider snapshots merely because their content fingerprint matches.

## Durable workflows

### Save Job

The Save route accepts `{ canonicalJobId, sessionId, jobSnapshotId?, profileId? }`. It authenticates first, resolves the reference, calls `ensurePersistedJob()` only for an ephemeral result, then invokes existing `saveJobForUser()` with the durable ID. Repeated saves/materializations return the same snapshot and SavedJob row.

Unsave operates on the durable `jobSnapshotId` returned after save; it does not attempt to materialize an ephemeral card.

### Job Match

Both match-preparation endpoints resolve and ensure persistence before description/intelligence assessment and request creation. The existing `createMatchRequest()` flow continues to create an immutable `JobRevision`, and all downstream Job Match and Generated CV behavior remains based on that revision.

### User description/import

Attaching a description to an ephemeral provider result ensures persistence first. Imported vacancies continue using their existing explicit durable intake path and remain protected by `importedByUserId`.

## Search projection without writes

Replace `materialiseSearchJobCards()` with a read-only projection:

1. Batch-resolve already-existing snapshots from stable provider references, then equivalence keys.
2. Query the current user's SavedJob rows only for resolved snapshot IDs.
3. Project every card with `id = canonicalJobId`, explicit `canonicalJobId`, optional `jobSnapshotId`, and current presentation/relevance fields.

Anonymous and authenticated search use the same projection semantics. Authentication only adds user-specific read state; it never causes persistence.

Cached page responses and Redis session buffers continue to contain normalized jobs, not user-specific saved state or raw provider payloads.

## ATS ordinary-search semantics

Search composition is explicit:

- `source=all`: selected registry live providers plus eligible ACTIVE ATS catalogue jobs.
- `source=adzuna|reed|jooble|nhs_jobs`: only that live provider; no ATS catalogue injection.
- `source=direct_employer`: only eligible Greenhouse, Lever, and Ashby catalogue jobs; no live-provider fan-out.

`SMARTRECRUITERS` remains in the type union but is not exposed in the direct-employer filter until it has a implemented refresher/catalogue path.

Before ATS jobs join the combined candidate set:

- Database eligibility remains verified source + enabled source + ACTIVE snapshot + `lastSeenAt >= now - 7 days` + UK scope.
- Keyword eligibility requires every meaningful normalized query token to occur across normalized title and employer name. This deliberately avoids fetching full descriptions solely to search them.
- Location eligibility accepts an empty location, an explicit remote job, or a normalized match against `locationText`, city, region, or country. The existing UK scope classifier remains the final geographic safety check.

After eligibility, live and ATS jobs pass through the existing combined deduplication, sponsorship enrichment, filters, ranking, and pagination. Existing dedupe quality rules continue to prefer direct ATS/canonical employer provenance over aggregator duplicates.

## ATS refresh behavior

Greenhouse, Lever, and Ashby remain scheduled ingestion sources. Each board refresh calls `ensurePersistedJob()` for normalized vacancies. A rediscovered ARCHIVED snapshot returns to ACTIVE. A board failure is captured in that provider summary and does not abort other boards or providers.

The existing batch defaults remain `limit: 10` and `concurrency: 2`. Daily refresh is the least aggressive cadence compatible with the seven-day discovery window and current provider constraints. With three provider groups this configuration should be revisited when the enabled-board population approaches roughly 50–70 boards, because a daily run may no longer cover every board promptly.

## Retention lifecycle

Use centralized constants:

- ATS discoverability: 7 days since `lastSeenAt`.
- Archive eligibility: 45 days since relevant provider freshness/activity under the existing rules.
- Purge eligibility: ARCHIVED for at least 180 days, measured by `updatedAt` after archival.

Retention runs in bounded batches and evaluates one reusable protection predicate. A snapshot is protected when:

```text
importedByUserId is not null
OR SavedJob exists
OR JobMatchRequest exists
OR JobRevision exists
```

Archive updates only unprotected eligible shared rows. Purge hard-deletes only unprotected ARCHIVED rows past 180 days. Foreign keys remain a last safety net, not the primary policy check. The result reports snapshots examined, archived, purged, protected/skipped, and failures.

No STALE database transition is added. An ACTIVE ATS row older than seven days is simply excluded from discovery until refresh rediscovers it or the 45-day archival rule applies.

## Scheduling, security, locking, and logging

Keep the single Vercel Cron entry:

```text
17 3 * * * -> /api/cron/maintenance
```

Keep the current `CRON_SECRET` authorization convention and reject unauthorized requests. Keep the existing Redis/distributed `scheduledMaintenanceLock`; overlapping calls return `already_running`. The same protected route remains usable as a manual recovery trigger.

The maintenance runner continues retention and three ATS provider refresh groups with bounded work. It must aggregate failures instead of throwing away completed provider summaries. Structured logs include counts and duration only—never secrets, API keys, personal data, CV content, or full descriptions.

## Legacy surface

`src/features/jobs` has no production import path. Its `JobCard`, `JobDetailsClient`, and `useJobs` encode the obsolete assumption that every card ID is a snapshot ID. They and their dedicated tests should be removed after a final import check. `JobMatchPreparation` is likewise production-dead; the only external import is an onboarding test using it as an upload-policy fixture. That test should be moved to the active match UI or rewritten against the relevant active upload component before the legacy component is deleted.

## Errors and recovery

| Code | HTTP | Meaning | Client behavior |
|---|---:|---|---|
| `EPHEMERAL_JOB_EXPIRED` | 410 | Search session/buffer expired and no safe existing snapshot was found | Explain that the result expired and offer a fresh search |
| `JOB_IDENTITY_UNSTABLE` | 409 | Result lacks a stable provider reference and cannot be safely persisted | Keep original-link access; explain that Save/Match is unavailable for this listing |
| Existing auth errors | 401/403 | Durable action needs authentication/ownership | Preserve current sign-in/authorization flow |

Redis outage behavior remains unchanged for search: initial search can degrade, while continuation that cannot resolve its session returns a typed recoverable error. Durable actions never silently refetch upstream or persist guessed content.

## Database migration decision

No Prisma schema migration is planned. Existing columns and constraints support this design:

- unique `JobSnapshot.canonicalJobId` for equivalence
- unique `JobProviderReference(provider, providerJobId)` for provenance identity
- snapshot status/freshness indexes
- existing durable relations for protection checks
- `updatedAt` for measuring time since archive

Identity stability exists only in the transient provider-neutral contract. `direct_employer` is an API/UI enum value, not a database enum.

## Testing and acceptance evidence

Focused tests must demonstrate:

- Anonymous and authenticated live search, cached search, load more, filtering/sorting, and detail opening create zero snapshots.
- Save and both Job Match preparation paths materialize an ephemeral job once, reuse it on repetition/concurrency, and preserve JobRevision immutability.
- A missing Redis result resolves to an existing safe snapshot when possible; otherwise it returns `EPHEMERAL_JOB_EXPIRED`.
- A session-only Jooble identity displays but cannot be guessed into durable storage.
- ATS refresh persists jobs, reactivates rediscovered jobs, and contains per-board failures.
- `all` includes eligible ATS jobs; live-source filters exclude ATS; `direct_employer` returns ATS only; keyword/location/freshness rules exclude ineligible rows.
- Mixed live/ATS duplicates prefer direct employer provenance.
- Retention purges an old unreferenced archived row and preserves every imported, SavedJob-, JobMatchRequest-, and JobRevision-protected row.
- Unauthorized cron calls fail, authorized calls run maintenance, overlaps skip, and summaries retain partial successes/failures.
- Schema diff/migration generation is unnecessary.

Verification concludes with focused tests, the full suite, typecheck, lint, production build, and `git diff --check`.

## Operational checklist for the first ATS boards

Implementation must not fabricate employer boards. After deployment, an operator should:

1. Identify an employer's official Greenhouse, Lever, or Ashby board and confirm the board identifier and canonical domain.
2. Create or update the corresponding `CompanyRecord` and `EmployerJobSource` through the existing seed/verification workflow.
3. Mark the source enabled only after verification succeeds; do not bypass the verification evidence/count controls.
4. Run the protected/manual provider refresh once for validation.
5. Confirm jobs were normalized as UK-eligible, persisted ACTIVE, and have stable provider references/application URLs.
6. Search `source=direct_employer` and `source=all` using a matching title/location, then confirm a source-specific aggregator search excludes the ATS rows.
7. Confirm the next 03:17 UTC maintenance run refreshed the board and emitted bounded summary counts.
8. Monitor enabled-board growth; review batch size/cadence when the population approaches 50–70 boards.

## Future provider expansion order

No provider is added here. After the boundary is stable, evaluate candidates in this order:

1. **Find an Apprenticeship / DfE official source** — strongest UK and official-source fit, likely high canonical-link quality and low overlap for apprenticeship vacancies; validate reuse terms and access mechanism first.
2. **Arbeitnow** — relatively low integration burden and useful direct-employer/remote coverage; validate UK density, terms, and field completeness.
3. **Jobicy** — useful specialist/remote supplement, but likely more overlap and variable UK specificity; assess quota and canonical application links.
4. **JobsPipe** — broad aggregator coverage but highest likely duplication and maintenance cost; add only if measured unique UK yield justifies it.

Each future adapter must produce the same `NormalisedJob`, declare stable versus session-only identity honestly, enter Redis-first discovery, and cross into PostgreSQL only through `ensurePersistedJob()`.

## Success criteria

For an equivalent 50-result live search, snapshot writes fall from as many as 50 to zero. PostgreSQL writes occur only for ATS scheduled ingestion, Save Job, Job Match, user description/import, or another explicit durable workflow. ATS catalogue jobs remain durable and become naturally discoverable. Existing saved/history data remains reproducible, and old unprotected catalogue residue gains a safe purge lifecycle.
