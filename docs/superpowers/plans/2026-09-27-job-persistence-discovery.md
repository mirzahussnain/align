# Job Persistence and Discovery Refinement Implementation Plan

> **For agentic workers:** Execute this implementation plan inline in the current agent/session.

Do not use subagents unless a task genuinely requires isolation that cannot be handled safely inline.

Work task-by-task in the listed order:

- write/update the focused test first
- confirm the expected failure
- implement the smallest change
- rerun the focused test
- run typecheck at the checkpoints specified in the plan
- keep the scope bounded to the approved design

Preserve the implementation stop conditions.

Do not automatically commit changes.

**Goal:** Make live-provider Jobs discovery Redis-first and DB-write-free until a durable action, while preserving the persisted ATS catalogue, historical reproducibility, and safe scheduled retention.

**Architecture:** Search cards use `canonicalJobId` plus optional `jobSnapshotId`; Redis session buffers resolve ephemeral details/actions; one transaction-safe `ensurePersistedJob()` owns all durable materialization. ATS snapshots join only eligible search modes and are filtered before combined deduplication. Existing daily protected maintenance gains complete summaries and 180-day purge.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Prisma 7/PostgreSQL, Redis cache abstraction, Vercel Cron, Vitest/Testing Library.

**Spec:** [2026-09-27-job-persistence-discovery-design.md](../specs/2026-09-27-job-persistence-discovery-design.md)

**Approved amendments:** The constraints in this implementation plan supersede the corresponding wording in the linked design spec for ATS keyword eligibility, future-adapter identity classification, and the post-refactor provider roadmap.

## Global Constraints

- Read relevant Next.js 16 documentation in `node_modules/next/dist/docs/` before modifying route handlers or dynamic routes.
- Use test-driven development: add a failing focused test, confirm the intended failure, implement minimally, then rerun it.
- Do not change Prisma schema or create a migration unless implementation uncovers a genuine blocker and review approves it.
- Do not refetch providers during reference recovery, introduce per-job Redis keys, rewrite adapters, or add providers.
- Preserve current provider concurrency, cache/SWR behavior, health handling, dedupe, canonical URLs, salary/sponsorship normalization, pagination, Career Market, and auth gates.
- ATS keyword eligibility must reuse the same normalized tokens and relevance scoring as the combined search path. It must accept a positive match from any meaningful token across the searchable normalized ATS fields; it must not require every query token to match literally.
- Every provider adapter included in this refactor—and every adapter added later—must explicitly classify identity stability. `identityStability` is required throughout the provider-neutral adapter and normalized-job contracts; there is no implicit `STABLE` default or legacy compatibility path.
- Find an Apprenticeship / DfE remains the next provider priority. Arbeitnow is permission-required/commercial-agreement-required and its free public API must not be integrated unless Align first obtains explicit commercial permission or a suitable paid/private API agreement. All other candidates remain conditional on verified commercial and reuse terms.
- Do not commit automatically; leave cohesive reviewed changes for the user unless explicitly asked to commit.

## Review Focus

- Search/details code must contain no hidden persistence path.
- The distinction among `canonicalJobId`, `dedupeFingerprint`/snapshot canonical key, and `JobSnapshot.id` must stay explicit in types and names.
- Concurrent Save/Match/ATS refresh calls must not create duplicates or lose provider references.
- Direct ATS provenance must still win mixed-source deduplication.
- Multi-word and synonym-adjacent ATS searches must not be over-filtered by an all-token literal-match gate; normal ranking determines ordering after the relaxed positive-overlap eligibility check.
- Purge protection must include imported ownership, SavedJob, JobMatchRequest, and JobRevision.
- Cron work must remain authenticated, locked, bounded, failure-tolerant, and free of sensitive logs.

---

## Task 1: Make provider identity stability explicit

**Files:**

- Modify: `src/shared/types/job.ts`
- Modify: `src/shared/services/job-normalisation.ts`
- Modify: `src/shared/services/job-providers/search-adapters.ts`
- Modify: `src/shared/services/job-providers/registry.ts`
- Modify: `src/shared/services/job-providers/nhs-jobs-adapter.ts`
- Modify: `src/shared/services/job-providers/greenhouse-adapter.ts`
- Modify: `src/shared/services/job-providers/lever-adapter.ts`
- Modify: `src/shared/services/job-providers/ashby-adapter.ts`
- Modify: `src/shared/services/job-discovery.ts`
- Test: `src/shared/services/__tests__/job-normalisation.test.ts`
- Test: `src/shared/services/job-providers/__tests__/provider-errors.test.ts` or a new focused Jooble adapter test beside it

**Interfaces:**

- Consumes: `ProviderJob` from all live/ATS adapters.
- Produces: required `ProviderJob.identityStability` and `ProviderReference.identityStability`, each classified as `"STABLE" | "SESSION_ONLY"`; normalized Jooble fallbacks marked session-only.

- [ ] Add tests proving every Adzuna, Reed, Jooble, NHS Jobs, Greenhouse, Lever, and Ashby adapter output explicitly classifies identity; Jooble's array-index fallback is session-only while remaining displayable; and an adapter or normalized provider reference cannot compile without classification.
- [ ] Run the focused tests and confirm they fail for the missing stability metadata.
- [ ] Make `identityStability: "STABLE" | "SESSION_ONLY"` required on the adapter output and normalized provider-reference types; remove every normalization fallback that substitutes `STABLE` when the field is absent.
- [ ] Update all current live and ATS adapters to emit the classification explicitly, and make adapter registration preserve the required type so every future adapter must classify identity.
- [ ] Mark database-backed `JobProviderReference` projections explicitly `STABLE`, because only stable references are eligible for persistence; do not infer this through an omitted-field default.
- [ ] Mark only the Jooble no-ID fallback session-only; do not add provider-specific branching to orchestration.
- [ ] Rerun the focused tests and `npm run typecheck`.
- [ ] Review that provider payload types still do not escape the normalization boundary and that no current or future adapter, fixture, database projection, or normalization call can silently inherit `STABLE`.

## Task 2: Build the authoritative idempotent materialization service

**Files:**

- Modify: `src/shared/services/job-snapshot.ts`
- Test: `src/shared/services/__tests__/job-snapshot.test.ts`
- Test: `src/shared/services/__tests__/job-snapshot-privacy.test.ts`
- Test: add `src/shared/services/__tests__/job-snapshot-concurrency.integration.test.ts` if the existing mocked unit harness cannot exercise the unique constraints

**Interfaces:**

- Consumes: complete `NormalisedJob` with at least one stable provider reference, or a safely equivalent existing public snapshot.
- Produces: `ensurePersistedJob(job): Promise<{ snapshot; outcome: "CREATED" | "UPDATED" | "REACTIVATED" | "UNCHANGED" }>` and read-only batch snapshot resolution for search projection.

- [ ] Add failing tests for provider-reference-first lookup, equivalence fallback, reference merging, rich-description preservation, ARCHIVED-to-ACTIVE reactivation, private-import isolation, session-only rejection, and repeated/concurrent idempotency.
- [ ] Run the focused tests and record the expected failures.
- [ ] Refactor snapshot writes behind `ensurePersistedJob()` using one transaction, stable provider-reference keys first, equivalence second, and bounded conflict retry/advisory serialization.
- [ ] Upsert all stable references, preserve canonical/application URLs and richer descriptions, refresh provenance, and reactivate rediscovered rows.
- [ ] Return the materialization outcome without adding telemetry writes.
- [ ] Make `persistTrustedProviderJob()` a temporary delegate or replace its callers; keep only one write algorithm.
- [ ] Add a read-only `findExistingJobSnapshots(jobs)` batch helper using provider references first and equivalence second.
- [ ] Rerun unit/integration tests and `npm run typecheck`.
- [ ] Review generated Prisma queries for bounded set operations and verify no private snapshot can be cross-user merged.

## Task 3: Add session-backed job-reference resolution

**Files:**

- Create: `src/shared/services/job-reference.ts`
- Modify: `src/shared/services/job-search-session.ts`
- Modify: `src/shared/utils/api-error.ts` only if typed-code helpers need extension
- Test: create `src/shared/services/__tests__/job-reference.test.ts`
- Test: `src/shared/services/__tests__/job-search-session.test.ts`

**Interfaces:**

- Consumes: `{ canonicalJobId, jobSnapshotId?, sessionId?, userId }`, the existing `CacheStore`, and current snapshot visibility rules.
- Produces: `{ kind: "persisted", jobSnapshotId } | { kind: "ephemeral", job }`; `EPHEMERAL_JOB_EXPIRED` (410) and `JOB_IDENTITY_UNSTABLE` (409).

- [ ] Add failing tests for direct durable resolution, owner-validated session-buffer resolution, canonical-ID lookup, safe durable fallback after Redis expiry, owner mismatch, expired buffer, and no upstream calls.
- [ ] Run the tests and confirm failure.
- [ ] Add a bounded session-buffer lookup helper; reuse the existing session ownership/query checks and 15-minute TTL.
- [ ] Implement read-only reference resolution in the documented order.
- [ ] Map missing ephemeral state to `EPHEMERAL_JOB_EXPIRED` and unsafe durable identity to `JOB_IDENTITY_UNSTABLE`.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review that recovery never guesses from URLs or refetches a provider.

## Task 4: Make all search-card projection read-only

**Files:**

- Modify: `src/shared/services/job-search-view.ts`
- Modify: `src/app/api/jobs/route.ts`
- Modify: `src/features/job-board/lib/job-board.ts`
- Test: `src/shared/services/__tests__/job-search-view.test.ts`
- Test: `src/app/api/jobs/__tests__/jobs-search-caching.test.ts`
- Test: `src/app/api/jobs/__tests__/jobs-search-continuation.test.ts`
- Test: `src/app/api/jobs/__tests__/jobs-search-integrity.test.ts`

**Interfaces:**

- Consumes: `NormalisedJob[]`, optional authenticated user, optional Career Track.
- Produces: cards with `id = canonicalJobId`, explicit `canonicalJobId`, optional `jobSnapshotId`, and read-only saved/relevance state.

- [ ] Replace test mocks that expect authenticated materialization with explicit assertions that anonymous, authenticated, cached, and continuation searches call no snapshot writer.
- [ ] Add a DB-write spy/regression assertion showing a 50-result display produces zero snapshot mutations.
- [ ] Run focused API/projection tests and confirm authenticated cases fail before implementation.
- [ ] Replace `materialiseSearchJobCards()` with one read-only projection path shared by anonymous and authenticated responses.
- [ ] Batch-resolve existing snapshots and SavedJob state; do not write if no snapshot exists.
- [ ] Preserve the search response/session/cache schema except for additive card identity fields.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review both fresh and cached response branches to prove neither can reach `ensurePersistedJob()`.

## Task 5: Support ephemeral detail viewing without persistence

**Files:**

- Modify: `src/app/api/jobs/[jobSnapshotId]/route.ts`
- Modify: `src/shared/services/job-board-api.ts`
- Modify: `src/features/job-board/components/JobBoard.tsx`
- Modify: `src/features/job-board/components/JobDetailsPanel.tsx`
- Modify: `src/features/job-board/lib/job-board.ts`
- Test: add `src/app/api/jobs/[jobSnapshotId]/__tests__/route.test.ts`
- Test: `src/features/job-board/components/__tests__/job-board-api-wiring.test.tsx`
- Test: `src/features/job-board/components/__tests__/job-details-panel.test.tsx`

**Interfaces:**

- Consumes: selected card `{ canonicalJobId, jobSnapshotId?, sessionId }`.
- Produces: the existing provider-neutral details view from either snapshot or buffered `NormalisedJob`, with zero writes.

- [ ] Read the installed Next.js dynamic-route and route-handler docs again immediately before editing.
- [ ] Add failing route/UI tests for ephemeral detail open, persisted ATS detail open, original link, session forwarding, and expired-result recovery UI.
- [ ] Assert both authenticated and anonymous detail GETs call no snapshot writer.
- [ ] Implement reference-aware GET resolution and a pure normalized-job-to-details projection beside the existing snapshot projection.
- [ ] Update selection/navigation state to retain session and optional snapshot ID without treating card `id` as a UUID.
- [ ] Return a clear 410 payload for `EPHEMERAL_JOB_EXPIRED`; preserve existing auth/profile behavior for personalized detail fields.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review that simply opening a drawer/page cannot materialize or attach user data.

## Task 6: Materialize only on Save Job and user description actions

**Files:**

- Modify: `src/app/api/jobs/[jobSnapshotId]/save/route.ts`
- Modify: `src/app/api/jobs/[jobSnapshotId]/description/route.ts`
- Modify: `src/shared/services/saved-job.ts`
- Modify: `src/features/job-board/components/JobBoard.tsx`
- Modify: `src/features/job-board/components/JobDetailsPanel.tsx`
- Test: create `src/app/api/jobs/[jobSnapshotId]/save/__tests__/route.test.ts`
- Test: create `src/app/api/jobs/[jobSnapshotId]/description/__tests__/route.test.ts`
- Test: `src/shared/services/__tests__/saved-job.test.ts`
- Test: `src/shared/services/__tests__/saved-job.integration.test.ts`

**Interfaces:**

- Consumes: authenticated `{ canonicalJobId, sessionId, jobSnapshotId?, profileId? }`.
- Produces: durable `jobSnapshotId`, idempotent SavedJob or attached user description.

- [ ] Add failing tests that Save materializes an ephemeral job, returns its snapshot ID, creates one SavedJob, and remains duplicate-free on repetition.
- [ ] Add failing tests for existing-snapshot fallback, expired session, unstable identity, unauthorized access, and description attachment as a durable event.
- [ ] Implement auth-first resolution, call `ensurePersistedJob()` only for ephemeral references, then invoke existing SavedJob/description services.
- [ ] Update the active UI to send session/reference fields and replace its selected card with the returned durable ID/state after success.
- [ ] Keep DELETE/un-save durable-ID-only and preserve current profile/application-status behavior.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review that authentication by itself and Save-button rendering remain write-free.

## Task 7: Materialize at both Job Match entry points and preserve revisions

**Files:**

- Modify: `src/app/api/jobs/[jobSnapshotId]/match/prepare/route.ts`
- Modify: `src/app/api/jobs/[jobSnapshotId]/match-preparation/route.ts`
- Modify: `src/features/job-board/components/CheckMatchModal.tsx`
- Modify: `src/features/job-board/components/JobDetailsPanel.tsx`
- Test: create/extend route tests beside both match endpoints
- Test: `src/shared/services/__tests__/job-match-ledger.test.ts`
- Test: `src/features/job-board/components/__tests__/match-preparation-paste.test.tsx`

**Interfaces:**

- Consumes: authenticated ephemeral or persisted job reference plus existing profile/description acceptance fields.
- Produces: durable snapshot ID and the existing immutable `JobRevision`/match request behavior.

- [ ] Add failing tests for ephemeral match materialization, repeated preparation dedupe, expired/unstable references, and immutable revision content after later snapshot refresh.
- [ ] Run focused tests and confirm failure.
- [ ] Resolve and ensure the job before intelligence assessment or `createMatchRequest()` in both routes.
- [ ] Thread the returned persistent ID through all existing match and capability/usage logic without changing billing gates.
- [ ] Keep `JobRevision` creation and GeneratedCV linkage unchanged.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review partial-description and pasted-description paths for accidental duplicate persistence.

## Task 8: Correct ATS search composition and eligibility

**Files:**

- Modify: `src/app/api/jobs/schema.ts`
- Modify: `src/app/api/jobs/route.ts`
- Modify: `src/shared/services/job-discovery.ts`
- Modify: `src/features/job-board/lib/job-board.ts`
- Modify: `src/features/job-board/components/JobBoard.tsx`
- Test: `src/app/api/jobs/__tests__/jobs-search-continuation.test.ts`
- Test: `src/app/api/jobs/__tests__/jobs-search-integrity.test.ts`
- Test: create or extend `src/shared/services/__tests__/job-discovery.test.ts`

**Interfaces:**

- Consumes: source mode `all | adzuna | reed | jooble | nhs_jobs | direct_employer`, query, location, and current time.
- Produces: ATS results only for `all`/`direct_employer`, locally eligible by relaxed normalized keyword overlap plus location/freshness before combined dedupe/ranking.

- [ ] Add failing tests proving `all` includes ATS without employer selection, each live-source filter excludes ATS, and `direct_employer` calls no live provider.
- [ ] Add tests proving a multi-word ATS query remains eligible when any meaningful normalized token matches title, employer, departments, offices, or available normalized description; also cover zero-overlap exclusion, location match, remote eligibility, seven-day boundary, disabled/unverified sources, and mixed direct-vs-aggregator dedupe preference.
- [ ] Run focused tests and confirm the current unconditional injection/eligibility failures.
- [ ] Add the clean user-facing `direct_employer` source option to schema, client types, and existing source control without redesigning the UI.
- [ ] Gate ATS catalogue loading by source mode and skip live fan-out for direct-employer-only searches.
- [ ] Extract/reuse the existing query token normalization and relevance calculation for ATS eligibility/ranking. Admit ATS candidates on positive meaningful-token overlap rather than requiring every token literally; apply location eligibility before the shared merge and retain DB ACTIVE/verified/enabled/fresh/UK checks.
- [ ] Preserve common filters, sorting, sponsor enrichment, counts, buffering, and pagination after merge.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review source counts and `hasMore` behavior for the ATS-only mode, and verify ranking—not an all-token gate—orders partially matching relevant ATS jobs.

## Task 9: Move all ATS refreshers onto the shared persistence boundary

**Files:**

- Modify: `src/shared/services/greenhouse-refresh.ts`
- Modify: `src/shared/services/lever-refresh.ts`
- Modify: `src/shared/services/ashby-refresh.ts`
- Modify: corresponding tests under `src/shared/services/job-providers/__tests__/` or add focused refresh tests under `src/shared/services/__tests__/`

**Interfaces:**

- Consumes: normalized jobs from one verified employer board and `ensurePersistedJob()` outcomes.
- Produces: per-provider summaries with boards attempted/succeeded/failed and jobs seen/created/updated/reactivated/unchanged.

- [ ] Add failing tests for continued persistence, ARCHIVED reactivation, duplicate merge, and one-board failure not aborting unrelated boards.
- [ ] Run focused tests and confirm summary/outcome failures.
- [ ] Replace direct/legacy persistence calls with `ensurePersistedJob()` and aggregate its outcomes.
- [ ] Preserve board limit, concurrency, verification gates, provider API behavior, and per-board failure containment.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review logs/summaries to ensure no job descriptions, secrets, or personal fields are emitted.

## Task 10: Complete archive and purge retention

**Files:**

- Modify: `src/shared/services/retention-service.ts`
- Test: `src/shared/services/__tests__/retention-service.test.ts`

**Interfaces:**

- Consumes: centralized 7-day freshness, 45-day archive, 180-day purge constants and actual Prisma relations.
- Produces: `{ examined, archived, purged, protectedSkipped, failures }` (plus existing useful counts where compatible).

- [ ] Add failing tests for an old unreferenced ARCHIVED purge and protection by imported ownership, SavedJob, JobMatchRequest, and JobRevision independently.
- [ ] Add boundary tests for 45-day archive, 180-day post-archive purge, and fresh/ACTIVE ATS discoverability remaining separate from status.
- [ ] Run focused tests and confirm purge/protection failures.
- [ ] Centralize retention constants and one Prisma protection predicate reused by archive and purge queries.
- [ ] Archive and delete in bounded batches; use `updatedAt` as archived-age evidence and do not introduce STALE status writes.
- [ ] Count candidates excluded by protection without loading descriptions or personal content.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review delete predicates against every direct `JobSnapshot` relation in `prisma/schema.prisma`.

## Task 11: Harden daily maintenance summaries without changing scheduling

**Files:**

- Modify: `src/shared/services/scheduled-maintenance.ts`
- Modify: `src/app/api/cron/maintenance/route.ts` only if response mapping needs the richer summary
- Modify: `src/app/api/cron/maintenance/__tests__/route.test.ts`
- Modify: `src/shared/services/__tests__/scheduled-maintenance.test.ts`
- Verify only: `vercel.json`
- Verify only: `src/shared/lib/cache/refresh-lock.ts`

**Interfaces:**

- Consumes: existing CRON_SECRET authorization, maintenance lock, retention summary, and three refresh summaries.
- Produces: completed/already-running structured summary retaining partial successes and failures.

- [ ] Add failing tests for unauthorized rejection, authorized invocation, lock skip, retention invocation, provider partial failure without unrelated abort, and sanitized aggregate counts.
- [ ] Run focused tests and confirm current `Promise.allSettled` rethrow loses partial-summary behavior.
- [ ] Aggregate fulfilled and rejected work into a bounded summary rather than aborting all reporting on one rejection.
- [ ] Keep `17 3 * * *`, the combined route, existing lock TTL/release behavior, `{ limit: 10, concurrency: 2 }`, and manual scripts.
- [ ] Add a maintenance comment/documentation threshold to reassess batching around 50–70 enabled boards.
- [ ] Rerun focused tests and `npm run typecheck`.
- [ ] Review all logged fields against the sensitive-data exclusions.

## Task 12: Remove the production-dead legacy Jobs surface

**Files:**

- Delete after final import verification: `src/features/jobs/components/JobCard.tsx`
- Delete: `src/features/jobs/components/JobDetailsClient.tsx`
- Delete: `src/features/jobs/components/JobMatchPreparation.tsx`
- Delete: `src/features/jobs/hooks/useJobs.ts`
- Delete their tests under `src/features/jobs/**/__tests__/`
- Modify: `src/features/onboarding/components/__tests__/upload-policy-accept.test.tsx`

**Interfaces:**

- Consumes: repository import graph.
- Produces: one authoritative active Jobs UI (`src/features/job-board`) with no obsolete DB-ID client contract.

- [ ] Run `rg` over `src`, routes, and tests to reconfirm no production import of `src/features/jobs` appeared during implementation.
- [ ] Move the onboarding upload-policy assertion to the active component that owns that policy, or replace the obsolete fixture with its active equivalent.
- [ ] Run the affected test before deletion to establish coverage, then delete the dead components/hooks and their dedicated tests.
- [ ] Run the onboarding and active job-board component tests.
- [ ] Run `npm run typecheck` and verify no alias/import residue.
- [ ] Review that no user-visible route depended on `JobDetailsClient`.

## Task 13: End-to-end regression and storage-write verification

**Files:**

- Modify/add only focused fixtures under existing `__tests__` directories as gaps are found
- Do not add permanent telemetry or a migration

**Interfaces:**

- Consumes: completed refactor.
- Produces: acceptance evidence for search writes, durable actions, ATS discovery, retention, and cron.

- [ ] Run the focused search/reference/snapshot/save/match/ATS/retention/cron test set together.
- [ ] Run a focused database-backed scenario (or Prisma mutation spy where integration DB is unavailable): 50 authenticated live results -> zero snapshot create/update/upsert calls; first Save -> one durable snapshot; repeated Save/Match -> same ID.
- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check`.
- [ ] Run `git status --short` and inspect the complete diff for unrelated/user-owned changes.
- [ ] Confirm `prisma/schema.prisma` and `prisma/migrations` are unchanged.
- [ ] Produce the delivery report: files changed, before/after writes, durable triggers, anonymous/authenticated browsing behavior, ATS discovery/scheduling, archive/purge, remaining edge cases, first-board operational checklist, and the amended provider roadmap below.
- [ ] State the post-refactor provider roadmap exactly: Find an Apprenticeship / DfE first after access/reuse validation; evaluate Jobicy, JobsPipe, and any other candidates only after commercial/reuse terms are verified; classify Arbeitnow as permission-required/commercial-agreement-required and do not integrate its free public API without explicit commercial permission or a suitable paid/private API agreement.

## Implementation stop conditions

Pause and request review rather than broadening scope if any of these occur:

- Correct concurrency would genuinely require a schema constraint/migration beyond the existing unique keys.
- A live provider cannot expose enough provenance to distinguish session-only from stable identity without a provider API change.
- The active UI has an undocumented durable action beyond Save, Match, description attachment, or import.
- Retention discovers another direct durable relation to `JobSnapshot`; add it to the protection predicate and update this plan before deleting data.
- Production ATS board count materially exceeds the audited zero/current assumptions or approaches the documented batching threshold.
