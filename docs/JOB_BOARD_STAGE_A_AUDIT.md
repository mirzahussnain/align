# Job Board Completion Programme — Stage A Audit

Repository audit performed 2026-07-28 against branch `phase0-completeness`.
No code was modified. Baseline: **1232 tests passing / 70 skipped (110 files)**,
`tsc --noEmit` clean, `eslint` 2 pre-existing errors + 23 warnings.

---

## 1. Current architecture

| Concern | Implementation |
| --- | --- |
| Framework | Next.js **16.2.6** App Router, React 19.2.4, TypeScript strict |
| Styling | Tailwind **v4** (`@theme` in `src/app/globals.css`), HSL CSS custom properties, `.dark` variant via `next-themes` |
| ORM / DB | Prisma **7.8** (`prisma-client` generator → `src/generated/prisma`), PostgreSQL (`@prisma/adapter-pg`); Neon in production, `pgvector/pgvector:pg17` on `localhost:5433` locally |
| Object storage | S3 API — MinIO locally, Cloudflare R2 in production (`src/shared/lib/storage.ts`) |
| Auth | `better-auth` (`src/shared/lib/auth.ts`), `auth.api.getSession({ headers })` in every route |
| Hosting | Vercel (`.vercel/project.json`, project `align`) |
| Redis | `@upstash/redis` **only** for rate limiting, and **not configured** — `.env.local` has no `UPSTASH_REDIS_REST_URL`/`_TOKEN`, so `applyRateLimit` silently no-ops (`src/shared/lib/rate-limit.ts:57`) |
| Queue / worker | **None** |
| Cron / scheduler | **None**. No `vercel.json`, therefore no Vercel Cron declarations |
| Analytics | **None**. The nearest abstraction is `src/shared/services/reservation-observability.ts` — an allow-listed, PII-safe structured event logger for the reservation lifecycle |
| Tests | Vitest 4, `environment: 'node'` by default, jsdom opted into per file via `// @vitest-environment jsdom`. Real-Postgres integration tests follow the `*.integration.test.ts` + `describe.skipIf(!isLocalDb)` convention (`src/shared/billing/__tests__/webhook-convergence.integration.test.ts`) |

**Decisive constraint:** the deployment target is serverless and Redis is absent.
Every piece of job-board state that currently lives in a module-level `Map` is
per-lambda-instance and is lost on cold start, on scale-out, and between
deployments. Durable state must go to **PostgreSQL**, not Redis.

### Route-group layout

```
src/app/
  (auth)/login, (auth)/signup
  (dashboard)/layout.tsx        ← session guard + onboarding redirect
  (dashboard)/dashboard/page.tsx
  (dashboard)/dashboard/{billing/success,billing/cancelled,import-cv}
  (public)/layout.tsx           ← Footer + LoaderProvider
  (public)/{page,analyze,immigration,trends,jobs,jobs/[jobReference]}
  onboarding/{page,manual}
  api/…
```

The authenticated workspace is **one route** (`/dashboard`) whose sections are
client tabs held in a zustand store (`src/shared/stores/dashboard-store.ts`:
`overview | analyze | profile | analyses | cvs | billing`). `Sidebar.tsx` switches
tabs with `setTab()` buttons; only `/jobs` and `/immigration` are real `<Link>`s,
grouped under "Tools", and both point at **public** pages.

---

## 2. Existing routes and components

### Job-board pages
| Path | File | Notes |
| --- | --- | --- |
| `/jobs` | `src/app/(public)/jobs/page.tsx` | Renders marketing `Navbar`; single-column result list |
| `/jobs/[jobReference]` | `src/app/(public)/jobs/[jobReference]/page.tsx` → `JobDetailsClient.tsx` | `jobReference` is an **in-memory UUID token**, not a durable id |

### Job-board API
| Route | File | Behaviour |
| --- | --- | --- |
| `GET /api/jobs` | `src/app/api/jobs/route.ts` | Federated search, dedupe, sponsor match, filter, sort, session paging |
| `GET /api/jobs/bootstrap` | `.../bootstrap/route.ts` | Career Tracks + default query/location from `ProfileIdentity.city/state` |
| `GET /api/jobs/details` | `.../details/route.ts` | Resolves a `jobReference`, returns profiles + `job_match_analysis` usage + any prior analysis matched on `rawResult.jobSourceProvenance.canonicalJobId` (scans up to 100 rows in JS) |
| `POST/GET /api/jobs/handoff` | `.../handoff/route.ts` | Creates/resolves an in-memory match handoff token |
| `GET/POST/DELETE /api/saved-jobs` | `src/app/api/saved-jobs/route.ts` | Full CRUD, entitlement-checked. **No UI page consumes it** |
| `GET /api/sponsors` | `src/app/api/sponsors/route.ts` | Filters the full parsed sponsor CSV in JS |

### Services
`job-search.ts` (provider fan-out, dedupe), `job-normalisation.ts` (normalise +
sponsor wording + eligibility hints), `job-reference.ts` (in-memory token map),
`job-handoff.ts` (in-memory handoff map), `sponsor-registry.ts` (CSV fetch,
matching), `adzuna.ts` / `reed.ts` / `jooble.ts` (adapters).

### Components
`JobCard.tsx`, `JobDetailsClient.tsx`, `JobMatchPreparation.tsx`,
`useJobs.ts`. Shared UI available: `GlassCard`, `Button`, `Input`, `Badge`,
`Tabs`, `AlertBanner`, `MobileModal`, `Toast`, `PageLoader`.

### Provider adapter "interface"
There is no declared interface. Each adapter is
`(params: JobSearchParams) => Promise<JobSearchResult>` and they are wired
through a literal map in `job-search.ts:14-18` keyed by `JobProvider`. Adding a
provider means editing that map plus `JobProvider` in `src/shared/types/job.ts`.

---

## 3. Existing database entities

Relevant models in `prisma/schema.prisma` (1337 lines, 25 applied migrations):

- **`SavedJob`** (`saved_job`) — `userId`, nullable `profileId`, `primaryProvider`,
  `sourceJobId`, `canonicalUrl`, `canonicalIdentity` (= `dedupeFingerprint`),
  `title`, `company`, `locationText`, **`jobSnapshot Json`**, `snapshotVersion`,
  `availabilityStatus` (`SavedJobAvailability`: ACTIVE/EXPIRED/REMOVED/UNKNOWN),
  `savedAt`, `lastCheckedAt`, `removedAt`.
  `@@unique([userId, canonicalIdentity])`, indexes on `[userId, savedAt]` and `profileId`.
- **`Analysis`** — job-match provenance is stashed inside `rawResult.jobSourceProvenance`
  (`{ canonicalJobId, jobSnapshot, descriptionAvailability, descriptionHash, profileId }`),
  with `jobMatchData` as the canonical v2 payload and promoted `jobTitle`/`jobCompany` columns.
- **`Profile`** — the Career Track: `label`, `isDefault`, `targetIndustry`,
  `targetOccupation`, `targetRoleTitle`, `targetSeniority`.
- **`ProfileIdentity`** — `city`, `state`, visa status (`VisaStatus` enum).
- **`CapabilityReservation`**, **`UsageCounter`**, **`BillingAccount`**, **`BillingPurchase`**.

**There is no `JobSnapshot`, no provider-reference table, no company entity and no
persisted search session.**

---

## 4. Current caching layers

| Layer | Location | Scope | TTL | Durability |
| --- | --- | --- | --- | --- |
| Next data cache | `adzuna.ts:68`, `reed.ts:76`, `jooble.ts:47` — `next: { revalidate: 300 }` | Per deployment | 5 min | Next-managed |
| Provider result cache | `job-search.ts:13` `providerCache` Map | Module | 5 min | **In-memory** |
| Merged response cache | `api/jobs/route.ts:17` `responseCache` Map | Module | 5 min | **In-memory** |
| Search session | `api/jobs/route.ts:14` `sessions` Map | Module | 15 min | **In-memory** |
| Job reference (details) | `job-reference.ts:7` | Module | 30 min | **In-memory** |
| Match handoff | `job-handoff.ts:6` | Module | 30 min | **In-memory** |
| Sponsor register | `sponsor-registry.ts:6-9` `sponsorArrayCache` / `sponsorSetCache` | Module | 24 h | **In-memory**, re-downloaded per cold start |

No cache is keyed by a register version; none is shared across instances; none survives a deploy.

---

## 5. Current job search request path

```
GET /api/jobs?query&location&…
  ├─ applyRateLimit(jobsLimiter, x-forwarded-for)      ← no-op, Upstash unset
  ├─ auth.api.getSession()
  ├─ JobsQuerySchema.safeParse(searchParams)
  ├─ canonicalHash({params, source, sponsorship, remoteType, postedWithinDays})
  ├─ responseCache hit (and no sessionId) → return cached jobs + new sessionId
  ├─ session resolve/create; params.page = ++session.page
  ├─ searchProviders(params, ['ADZUNA','REED','JOOBLE'])   ← Promise.all
  │     └─ per provider: cache → fetch (5 s hard timeout) → normaliseProviderJob
  ├─ deduplicateJobs(flatMap)                              ← O(n²) pairwise
  ├─ providerCounts computed HERE                          ← before filters/slice
  ├─ matchSponsorCompanies(unique company names)           ← see §8
  ├─ applyFilters → sortJobs → drop session.seenJobIds → slice(perPage)
  ├─ attach ephemeral jobReference per job
  ├─ responseCache.set(hash, thisPageOfJobs)
  └─ JSON { jobs, sessionId, meta{providerCounts, partialResults, timings, providerResults} }
```

Client (`useJobs.ts`) fetches `/api/jobs/bootstrap` on mount, then issues the
first search; every filter or sort change requires pressing **Search**, which
re-enters the whole path (provider cache may absorb it, sponsor matching does not).

---

## 6. Current match-handoff path

```
JobCard "Check match" / JobDetailsClient
  → GET /api/jobs/details?ref=<in-memory uuid>
  → JobMatchPreparation modal (Career Track select, editable description,
    partial-description acknowledgement, usage line)
  → POST /api/jobs/handoff { job, profileId }  → in-memory token
  → window.location.assign('/analyze?mode=job_match&handoff=<token>')
  → AnalyzeWorkspace GETs /api/jobs/handoff?token=… to rehydrate
  → user uploads a CV → POST /api/analyze (multipart, jobHandoffToken)
       → resolveJobMatchHandoff → scopedProfileId
       → reserveCapability('job_match_analysis') BEFORE the provider call
       → getJobMatchFeedback → JobMatchDataV2Schema validation
       → persistAnalysis(… jobSourceProvenance)
       → commitCapability AFTER durable persistence
```

The modal itself consumes no quota today — that requirement is already met.
`/api/analyze` is the canonical analysis engine and must not be duplicated.

---

## 7. Current billing enforcement

- `src/shared/entitlements/registry.ts` is the **sole** policy location.
  `saved_jobs` already exists as `resource_limit(10)` FREE / `resource_limit(100)` PRO —
  exactly the limits the programme specifies. No new capability is required for saved jobs.
- `checkCapability` / `assertCapability` / `getResourceCount` in `entitlements/server.ts`;
  plan resolved by `getUserPlan` → `resolveBillingAccess` (the `subscriptionTier`
  column is gone).
- Metered AI work goes through `capability-reservation.ts`
  (`reserveCapability` → `markOperationRunning` → `commitCapability` / `releaseCapability`),
  with `pg_advisory_xact_lock`, fingerprints, committed-result recovery and
  fail-closed behaviour. `/api/analyze` already implements the full canonical ordering.
- `POST /api/saved-jobs` checks `saved_jobs` **only when creating** a new row and
  throws `EntitlementRequiredError` — correct.
- No `user.plan === 'FREE'` checks exist in UI or route handlers.

---

## 8. Current sponsor matching

`matchSponsorCompanies(companyNames)` (`sponsor-registry.ts:207`):

1. `getSponsors()` — downloads the GOV.UK CSV (configured URL → scraped URL → hardcoded
   fallback, all SSRF-validated to `assets.publishing.service.gov.uk/*.csv`), parses with
   Papa Parse, caches the array + a standardized-name `Set` for 24 h in module memory.
2. Builds a `Map<standardizedName, organisationName>` **on every call**.
3. Exact hit → `EXACT`.
4. Otherwise **`sponsors.filter(...)` over the entire register per company**, re-standardizing
   and re-tokenising every sponsor row, requiring ≥ 0.8 shared-token ratio;
   1 candidate → `LIKELY`, ≥ 2 → `AMBIGUOUS`, 0 → `NONE`.

The register is ~100k rows. For a 15-result page with ~13 unique employers that is
~1.3 M full-row tokenisations **per uncached search**, plus a full CSV download and
parse on every cold start. This is almost certainly the dominant server cost of a
cold search, and it is redone for every duplicate employer across searches.

There is no token index, no per-employer memoisation, and no register-version key.
Wording detection (`job-normalisation.ts:47`) is correctly kept separate from
register evidence, and explanation strings already avoid guaranteeing sponsorship.

---

## 9. Current UI limitations

**Correctness defects found (not just polish):**

1. **Provider counts are wrong.** `uniqueContributed` is computed at
   `api/jobs/route.ts:63` from the *full deduped set*, before `applyFilters`, the
   seen-id drop and `.slice(perPage)` at line 65. Displayed counts therefore
   exceed what the list shows.
2. **The response cache stores the wrong page.** Line 68 writes the *current
   page's* slice under the query hash; a "Load more" overwrites the page-1 entry.
   A later fresh search for the same query then returns page-2 jobs as page 1.
3. **Dead link.** `JobDetailsClient.tsx:19` links to `/analyses/${id}`. That route
   does not exist — analyses open through the zustand store on `/dashboard`.
4. **Hardcoded relevance.** `Career Track relevance: Strong title alignment` is a
   literal string in `JobCard.tsx:31` and `JobDetailsClient.tsx:20`.
5. **Jooble is hardcoded PARTIAL.** `job-normalisation.ts:97`:
   `source === 'JOOBLE' || isTruncated ? 'PARTIAL' : 'FULL'`.
6. **Save is one-way and non-idempotent in the UI.** `JobCard` holds `saved` in
   local state, never loads existing saved state, has no unsave, no optimistic
   rollback, no entitlement-limit surface.
7. **Mojibake.** `JobDetailsClient.tsx` and `JobMatchPreparation.tsx` contain
   corrupted separator characters (`?` where `·`/`←`/`…` were intended) — lines 16, 18, 19, 22.
8. **`hasMore` is hardcoded** to `incoming.length === 15` in `useJobs.ts:12`
   regardless of `perPage`.
9. **Blocking loader.** `initialising` renders "Finding jobs for your Career
   Track…" instead of the page; a refresh blanks the list (`setJobs([])` on error).
10. **Navigation.** `/jobs` renders the marketing `Navbar` (How it Works / Features /
    Pricing / Insights) for signed-in users. No Saved page, no Companies page, no tabs.
11. **Query presentation.** The default query comes from
    `targetRoleTitle || targetOccupation || targetIndustry || 'jobs'` — currently a
    single value, so the pipe-separated chain described in the brief is not yet
    present in this code path, but there is no editable "related terms" concept either.
12. **Filters.** `provider`, `salaryMin`, `postedWithinDays` are accepted by
    `JobsQuerySchema` but not exposed in the UI. Every filter/sort change costs a
    full provider round trip.
13. **Accessibility.** Selected-job state does not exist (single column, no
    selection); `View details`/`Check match` are `<button onClick=location.assign>`
    rather than links; no focus trap or Escape handling in `JobMatchPreparation`;
    the modal has `aria-modal` but no focus management.
14. **No unsupported statistical claims were found** in the current job-board code
    (the "3x more likely" line does not exist here). Nothing to remove.

---

## 10. Proposed file-level implementation plan

### Phase 1 — Authenticated Jobs information architecture

**Route decision.** `(dashboard)/jobs/**` would resolve to `/jobs` and collide
with `(public)/jobs`. Next.js rejects duplicate routes, so the two cannot coexist
at the same URL. Least-destructive resolution, consistent with the existing
convention that everything authenticated sits behind `(dashboard)/layout.tsx`:

| Surface | Route |
| --- | --- |
| Authenticated Discover | `/dashboard/jobs` |
| Job details | `/dashboard/jobs/[jobSnapshotId]` |
| Saved | `/dashboard/jobs/saved` |
| Companies | `/dashboard/jobs/companies` |
| Company details | `/dashboard/jobs/companies/[companyReference]` |
| Public discovery (kept, guest-only data) | `/jobs` — signed-in users redirected to `/dashboard/jobs` |

Files:
- `src/app/(dashboard)/dashboard/jobs/layout.tsx` — workspace chrome + Jobs tab row
- `src/app/(dashboard)/dashboard/jobs/{page,saved/page,companies/page,[jobSnapshotId]/page,companies/[companyReference]/page}.tsx`
- `src/features/dashboard/components/WorkspaceChrome.tsx` (new) — Sidebar + content wrapper reusable by non-`/dashboard` authenticated routes
- `src/features/dashboard/components/Sidebar.tsx` (modify) — tab items become
  `Link href="/dashboard?tab=…"` when `usePathname() !== '/dashboard'`; add **Jobs**
  as a first-class workspace link; keep Sponsorship under Tools
- `src/app/(dashboard)/dashboard/page.tsx` (modify) — accept `?tab=` as `initialTab`
- `src/features/jobs/components/JobsTabs.tsx` (new) — `<nav>` + `<Link aria-current>`, horizontally scrollable on mobile
- `src/shared/constants/navigation.ts` (modify) — add `WORKSPACE_NAV_LINKS`; leave `MARKETING_NAV_LINKS` untouched
- `src/app/(public)/jobs/page.tsx` (rewrite) — guest-only discovery, redirect when authenticated

### Phase 3 — Durable snapshots (done before Phase 2 UI so the UI binds to real ids)

- `prisma/schema.prisma` — `JobSnapshot`, `JobProviderReference`, `CompanyRecord`,
  `JobSearchSession`; `SavedJob.jobSnapshotId String?` + relation
- `src/shared/services/job-snapshot.ts` (new) — `upsertJobSnapshots`, `loadJobSnapshot`,
  `attachUserDescription`, status transitions
- `src/shared/services/job-reference.ts` — **kept** as a compatibility shim that
  resolves a legacy token, so in-flight links do not 404 during rollout
- `src/shared/services/job-handoff.ts` — rewritten over `JobSnapshot` + a durable
  `JobMatchHandoff` row (or snapshot id + profile id passed directly)

### Phase 2 — Discover redesign

- `src/features/jobs/components/discover/{DiscoverWorkspace,JobList,JobListItem,JobDetailsPanel,SearchBar,FilterSheet,ProviderStatusBar,RelevanceBadge,SponsorEvidence,DescriptionBlock,EmptyStates,JobCardSkeleton}.tsx`
- `src/features/jobs/hooks/{useJobSearch,useJobSelection,useSavedJobs,useJobFilters}.ts`
  (replacing `useJobs.ts`, which is deleted)
- `src/features/jobs/components/JobCard.tsx` — replaced by `JobListItem`

### Phase 4 — Saved Jobs

- `src/app/api/saved-jobs/route.ts` (extend: filters, sort, snapshot join, analysis status)
- `src/app/api/saved-jobs/[id]/route.ts` (new: DELETE by id, PATCH profile)
- `src/features/jobs/components/saved/{SavedJobsView,SavedJobRow,SavedFilters}.tsx`

### Phase 5 — Companies

- `src/shared/services/sponsor-index.ts` (new) — exact map + inverted token index +
  `registerVersion`; `sponsor-registry.ts` refactored to delegate matching to it
- `src/shared/services/company-directory.ts` (new) — `CompanyRecord` upsert/search
- `src/app/api/companies/route.ts`, `src/app/api/companies/[companyReference]/route.ts`
- `src/features/jobs/components/companies/{CompaniesView,CompanyCard,CompanyDetail,RegisterEvidencePanel}.tsx`

### Phase 6 — Deterministic relevance

- `src/shared/services/job-relevance.ts` (new) — `computeDiscoveryRelevance(job, track, identity) → { level, reasons }`
- `src/shared/types/job.ts` — add `DiscoveryRelevance`
- Wired in `/api/jobs` and `/api/jobs/details`; never a percentage

### Phase 7 — Match preparation

- `src/features/jobs/components/JobMatchPreparation.tsx` (rewrite: focus trap,
  Escape, focus restoration, existing-analysis reuse, description source labelling)
- `src/app/api/jobs/handoff/route.ts` (rewrite over snapshot ids)
- `src/app/api/analyze/route.ts` (minimal, additive change): persist the richer
  provenance block (`jobSnapshotId`, `descriptionSource`, sponsor snapshot,
  `analysisConfidence`) — the reservation ordering is not touched
- `src/app/api/jobs/existing-analysis/route.ts` (new) — description-hash + track +
  analysis-version lookup replacing the 100-row JS scan in `details/route.ts`

### Phase 8 — Caching / performance

- `src/shared/services/job-cache.ts` (new) — fresh/stale windows, in-flight promise
  dedupe, staged keys
- `src/shared/services/job-search.ts` (extend) — interactive deadline (1.2–1.5 s)
  vs background timeout (5 s), first-useful-results return, background continuation
- `src/app/api/jobs/route.ts` (rewrite) — SWR semantics, **counts computed after
  filtering**, correct per-page cache keys, timing instrumentation
- `src/shared/services/job-search-session.ts` (new) — DB-backed sessions
- `src/features/jobs/hooks/useJobSearch.ts` — URL-state serialisation, local
  filter/sort without refetch, progressive merge

### Phase 8B — Local index (gated, last)

- `src/app/api/jobs/ingest/route.ts` (new, `CRON_SECRET`-guarded)
- `vercel.json` (new) — `crons` declaration
- `src/shared/services/job-ingestion.ts` (new) — priority search generation, upserts, expiry marking
- `src/shared/services/job-local-search.ts` (new) — Postgres query with trigram/FTS indexes

### Phase 10 — Description completeness

- `src/shared/services/job-description-completeness.ts` (new) — provider-aware classifier
- `job-normalisation.ts` — delegates to it; the `JOOBLE ⇒ PARTIAL` literal is removed

### Phases 12–13 — Feedback and observability

- `src/shared/components/ui/ToastProvider.tsx` (new) — the current `Toast.tsx` is a
  single hardcoded "API Rate Limit Fallback" card and cannot serve the programme
- `src/shared/services/product-analytics.ts` (new) — modelled on
  `reservation-observability.ts` (allow-listed keys, hashed user id, no content)

### Phase 14 — Tests

- `src/shared/services/__tests__/{job-relevance,job-description-completeness,sponsor-index,job-cache,job-snapshot,job-search-session}.test.ts`
- `src/app/api/jobs/__tests__/{search-path,provider-failure,load-more,counts}.test.ts`
- `src/app/api/saved-jobs/__tests__/entitlement.test.ts`
- `src/features/jobs/components/__tests__/*.test.tsx` (jsdom docblock)
- `src/shared/services/__tests__/job-snapshot.integration.test.ts` (`skipIf(!isLocalDb)`)
- `src/shared/services/__tests__/job-board.test.ts` — **preserved unchanged**

---

## 11. Proposed migrations

All additive. No column or table is dropped; no `SavedJob` row is deleted.

**`20260729xxxxxx_job_snapshots`**
```
CREATE TYPE "JobDescriptionAvailability" AS ENUM ('FULL','PARTIAL','EXTERNAL_ONLY','USER_SUPPLIED');
CREATE TYPE "JobDescriptionSource"       AS ENUM ('PROVIDER_FULL','PROVIDER_PARTIAL','USER_PASTED','LEGACY_SAVED_JOB');
CREATE TYPE "JobSnapshotStatus"          AS ENUM ('ACTIVE','POSSIBLY_EXPIRED','EXPIRED','REMOVED');
CREATE TABLE "job_snapshot" (…)            -- canonicalJobId UNIQUE, dedupeFingerprint indexed
CREATE TABLE "job_provider_reference" (…)  -- UNIQUE (provider, providerJobId)
ALTER TABLE "saved_job" ADD COLUMN "jobSnapshotId" TEXT NULL REFERENCES "job_snapshot"("id") ON DELETE SET NULL;
-- indexes: (status, postedAt), (city, postedAt), (workStyle), (normalisedEmployerName),
--          (dedupeFingerprint), (salaryMin, salaryMax)
```
Backfill: for each `SavedJob`, create a best-effort `JobSnapshot` from
`jobSnapshot` JSON with `descriptionSource = 'LEGACY_SAVED_JOB'` and
`status = 'ACTIVE'`; never invent a description; link `jobSnapshotId`. Rows whose
JSON cannot be parsed keep `jobSnapshotId = NULL` and remain fully usable from
their existing scalar columns.

**`20260730xxxxxx_company_records`** — `company_record` (`normalisedName` UNIQUE,
`sponsorMatchStatus`, `sponsorMatchEvidence Json`, `sponsorRegisterCheckedAt`,
`sponsorRegisterVersion`) + `job_snapshot.companyRecordId` nullable FK. Ambiguous
identities are stored as evidence only and never merged.

**`20260731xxxxxx_job_search_sessions`** — `job_search_session`
(`queryHash`, `providerCursors Json`, `exhaustedProviders String[]`,
`seenCanonicalJobIds String[]`, `providerCounts Json`, `expiresAt`), indexed on
`expiresAt` for lazy sweeps.

**`20260801xxxxxx_pg_trgm_job_search`** (Phase 8B only) — `CREATE EXTENSION IF NOT
EXISTS pg_trgm;` + GIN trigram indexes on title/company. Deferred until 8A is stable;
requires confirming the Neon role can create the extension.

---

## 12. Risks and compatibility concerns

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | **`/jobs` cannot be both public and authenticated.** Moving the authenticated module to `/dashboard/jobs` deviates from the brief's preferred URLs. | Follows the repository's own route convention (the brief permits this). Public `/jobs` is preserved for SEO and redirects authenticated users. Flagged for your decision before Phase 1. |
| 2 | **No Redis, no worker, no cron today.** Phase 8B's ingestion cadence cannot run without new infrastructure. | Phase 8A (SWR + indexes + dedupe) delivers most of the latency win with zero new infra. 8B ships behind a flag with a `CRON_SECRET` route + `vercel.json`; if the Vercel plan restricts cron frequency, ingestion degrades to opportunistic post-response refresh. |
| 3 | **Sponsor matching is O(companies × register).** Any UI that shows more employers makes it worse. | Phase 5's `sponsor-index.ts` (exact map + inverted token index + per-employer memoisation keyed by register version) lands **before** the Companies page. |
| 4 | **In-memory tokens are live in production.** Existing `/jobs/<uuid>` links break the moment the module is replaced. | `job-reference.ts` retained as a resolving shim through the rollout; new links use snapshot ids from day one. |
| 5 | **`Analysis.rawResult.jobSourceProvenance` shape change.** Readers include `/api/jobs/details`. | Extend the object additively; never rename `canonicalJobId`. New readers fall back to it when `jobSnapshotId` is absent. |
| 6 | **Snapshot writes on the search hot path** could reintroduce the latency being removed. | Upsert asynchronously after the response is streamed for list results; upsert synchronously only for the selected job / save / match paths, which are the ones that must be durable. |
| 7 | **Storage growth.** Persisting every federated result grows `job_snapshot` quickly. | Only jobs that are selected, saved, analysed or ingested by a priority search are persisted in 8A; retention is status-based, never destructive (explicitly out of scope). |
| 8 | **Sidebar refactor touches every dashboard tab.** | Tab semantics preserved on `/dashboard` (store), links only from other routes; covered by a component test before the rest of Phase 1. |
| 9 | **`descriptionAvailability` gains `USER_SUPPLIED`.** The existing `JobDescriptionAvailability` TS union and the `/api/jobs/handoff` zod enum are 3-valued. | Keep availability 3-valued in the provider contract and express user text via a separate `descriptionSource`, so no existing validator narrows. |
| 10 | **Two pre-existing lint errors** (`react-hooks/set-state-in-effect` in `Navbar.tsx:30` and `CVUploader.tsx:55`). | Out of scope; new code must not add more. Reported so the baseline is unambiguous. |
| 11 | **Untested responsive states.** No visual/E2E harness exists (no Playwright). | Component tests + explicit manual browser scenarios listed in the final report; responsive claims will be stated as manually verified, not automated. |

---

## Open decisions requiring your input

1. **Route placement** — `/dashboard/jobs/*` (recommended, see risk 1) vs. making
   `/jobs` authenticated and relocating public discovery.
2. **Public `/jobs`** — keep a real guest search, or reduce it to a marketing page
   that funnels to signup? Keeping it costs a second (thin) UI to maintain.
3. **Phase 8B scope** — is a Vercel Cron declaration acceptable on the current
   plan, and may `vercel.json` be added to the repository?
