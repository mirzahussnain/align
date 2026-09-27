# Pre Stripe Job and Career Market Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Align's proven job architecture while making the registry authoritative, separating anonymous discovery from durable workflows, adding operational scheduling and a truthful sampled UK Career Market, integrating NHS Jobs, and cleaning public resource claims.

**Architecture:** Existing provider-neutral jobs, provenance, cache layers, search sessions, ATS snapshots, UK scope, sponsorship boundaries, and authenticated `JobSnapshot` identity remain intact. New behavior enters through existing boundaries: registered search adapters, a non-persistent public projection, a locked maintenance orchestrator, and a persisted `CareerMarketSnapshot` service built from one bounded normalized sample.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Prisma 7/PostgreSQL, Redis-compatible `CacheStore`, Vercel Cron.

**Spec:** User-supplied implementation brief in `C:/Users/Hussnain Ali/.codex/attachments/12af0d9e-198d-4807-95cd-b22198fe328f/pasted-text.txt`; NHS transport contract in `C:/Users/Hussnain Ali/Downloads/NHS Jobs Self-Serve Job Adverts API V0.3 + appendix A.docx`.

## Global Constraints

- Do not replace `NormalisedJob`, remove provenance, change authenticated snapshot identity, or weaken UK/sponsorship/ATS safety boundaries.
- Do not add BullMQ, a continuous worker, unrelated providers, Stripe changes, or unsupported market claims.
- Every behavior change follows RED, GREEN, REFACTOR and preserves partial-provider tolerance.
- NHS integration uses only the documented `https://www.jobs.nhs.uk/api/v1/search_xml` contract and official vacancy URLs.

## Review Focus

- Anonymous cache hits and continuations must never call snapshot materialisation.
- A stale provider page must survive a failed or rate-limited refresh.
- A partial merged page with pending providers must not remain fresh for five minutes.
- Market metrics must disclose sample coverage/missingness and never infer historical or national totals.
- Scheduled maintenance must reject unauthorised calls and suppress overlapping execution.

---

### Task 1: Authoritative search registry and typed failures

**Files:**
- Modify: `src/shared/types/job.ts`, `src/shared/types/job-provider.ts`
- Modify: `src/shared/services/job-providers/registry.ts`, `search-adapters.ts`, `capabilities.ts`
- Modify: `src/shared/services/job-search.ts`, `adzuna.ts`, `reed.ts`, `jooble.ts`, `provider-health.ts`
- Test: `src/shared/services/job-providers/__tests__/*`, `src/shared/services/__tests__/job-search-cache.test.ts`

**Interfaces:** Registry provides ordered/configured adapters; adapters receive `JobProviderFetchContext`; typed failures expose only code, status category, and optional safe retry delay.

- [ ] Add failing tests for registered selection, source filtering, abort context, 401/403, 404, 429, 5xx, timeout, stale failure fallback, partial success, and pending results.
- [ ] Run focused tests and confirm expected failures.
- [ ] Route all provider calls through registry adapters and classify safe upstream errors.
- [ ] Pass abort signals into actual fetch calls; preserve cache keys, paging, ordering, and failure isolation.
- [ ] Make pending merged pages immediately stale and rerun focused tests.

### Task 2: Anonymous non-persistent job projection

**Files:**
- Modify: `src/shared/services/job-search-view.ts`, `src/app/api/jobs/route.ts`
- Test: `src/shared/services/__tests__/job-search-view.test.ts`, `src/app/api/jobs/__tests__/*`

**Interfaces:** `materialiseSearchJobCards` remains the authenticated durable path; `projectPublicSearchJobCards` returns public cards with non-database identity and original URLs.

- [ ] Add failing tests proving authenticated materialisation and anonymous non-materialisation on live, cached, and buffered responses.
- [ ] Implement the public projection using `NormalisedJob` and shared presentation logic.
- [ ] Branch only at response projection by authenticated user id and rerun focused tests.

### Task 3: Public Jobs discovery and resource IA

**Files:**
- Modify: `src/app/(public)/jobs/page.tsx`, `src/shared/constants/navigation.ts`, `src/shared/components/layout/Footer.tsx`
- Create: `src/features/public-jobs/components/PublicJobsSearch.tsx`
- Test: `src/features/public-jobs/components/__tests__/PublicJobsSearch.test.tsx`

**Interfaces:** Public UI consumes the anonymous `/api/jobs` response, links externally through `fullDescriptionExternalUrl`, and routes personalized actions to sign-in/dashboard.

- [ ] Add failing UI tests for real results, supported filters, provider attribution, original-posting CTA, and absence of personalized controls.
- [ ] Build the operate-first responsive search/results surface in Align's current design system.
- [ ] Update public resource naming and provider attribution; rerun focused tests.

### Task 4: Locked production scheduling

**Files:**
- Create: `src/shared/services/jobs-maintenance.ts`, `src/app/api/cron/jobs-maintenance/route.ts`, `vercel.json`
- Modify: `.env.example`, `docs/DEPLOYMENT.md`
- Test: `src/shared/services/__tests__/jobs-maintenance.test.ts`, route tests

**Interfaces:** The cron route authorizes `Bearer ${CRON_SECRET}`; the orchestrator acquires a Redis lock, invokes existing retention and ATS refresh services, bounds work, and returns safe summaries.

- [ ] Add failing authorization, overlap, bounded-order, and outcome tests.
- [ ] Implement the locked orchestrator and route without duplicating business logic.
- [ ] Declare and document the production schedule; rerun focused tests.

### Task 5: Career Market snapshot foundation

**Files:**
- Modify: `prisma/schema.prisma`, `src/shared/lib/cache/cache-keys.ts`
- Create: `prisma/migrations/*_career_market_and_nhs_jobs/migration.sql`
- Create: `src/shared/types/career-market.ts`, `src/shared/services/career-market.ts`, `src/app/api/career-market/route.ts`
- Replace: `src/app/(public)/trends/page.tsx`
- Test: service, route, and page/component tests

**Interfaces:** A normalized role/location key selects the latest durable snapshot; Redis caches reads and locks refresh; one bounded normalized/deduplicated sample produces all versioned metrics and public current-vacancy cards.

- [ ] Add failing tests for key normalization, freshness/stale behavior, locking, coverage, sample size, salary disclosure/distribution, mixes, sampled regions/employers/requirements, and absence of unsupported metrics.
- [ ] Add the Prisma model/migration and cache vocabulary.
- [ ] Implement sample calculation, persistence, cache/lock flow, and API.
- [ ] Replace demo trends with truthful Market Insights search, methodology, quality labels, and sampled current vacancies.
- [ ] Generate Prisma client and rerun focused tests.

### Task 6: NHS Jobs provider

**Files:**
- Modify: provider types/capabilities/registry, Prisma enum migration, footer attribution
- Create: `src/shared/services/job-providers/nhs-jobs-adapter.ts`
- Test: `src/shared/services/job-providers/__tests__/nhs-jobs-adapter.test.ts` plus search/dedupe/cache tests

**Interfaces:** The adapter maps documented XML into `ProviderJob`; `url` is the official NHS vacancy URL; page, keyword, location plus distance, salary, contract, working pattern, posted/closing dates remain internal mappings.

- [ ] Add failing parser, empty, malformed, HTTP failure, pagination, parameter, normalization, provenance, URL, dedupe, cache, and attribution tests.
- [ ] Implement the transport-contained XML adapter and register it in provider order.
- [ ] Apply enum migration and rerun focused tests.

### Task 7: Immigration resource cleanup

**Files:**
- Modify: `src/app/(public)/immigration/page.tsx`, `src/shared/constants/immigration-config.ts`, related components/tests

- [ ] Add failing copy/structure tests for neutral signed-out content, qualified claims, and proportionate KTP treatment.
- [ ] Remove invented profile assumptions, recommendation labels, and absolute sponsorship/settlement language.
- [ ] Rerun focused tests.

### Task 8: Verification and independent review

- [ ] Run all focused tests and the full `npm test` suite.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run build`, Prisma validation/generation, and `git diff --check`.
- [ ] Verify no temporary repository files or development processes remain.
- [ ] Dispatch an independent whole-branch reviewer for Critical/Important issues.
- [ ] Fix Critical/Important findings test-first, rerun the full verification matrix, and stop feature development.
