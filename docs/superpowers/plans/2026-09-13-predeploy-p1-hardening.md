# Pre-deployment P1 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Close the five deployment-blocking defects without changing billing or unrelated behavior.

**Architecture:** Keep routes thin and place each mutation behind one reusable service. Use Prisma interactive transactions plus existing advisory locks, durable server-created snapshot IDs, strict Zod validation before costly work, and expiring database-backed direct-upload intents.

**Tech Stack:** Next.js 16 App Router, TypeScript strict mode, Zod 4, Prisma 7/PostgreSQL, S3/R2/MinIO, Vitest, Docker Compose.

**Spec:** docs/superpowers/specs/2026-09-13-predeploy-p1-hardening-design.md

## Global constraints

- Do not modify Stripe, billing architecture, prices, or entitlement values.
- Shared provider facts originate only from trusted server provider results.
- Shared-vacancy pasted descriptions remain private in match requests/revisions.
- Stored CV direct uploads accept PDF/DOCX up to 10 MiB.
- Direct multipart analysis uploads are limited to 4 MiB.
- Comments are at most two sentences and only explain non-obvious invariants.
- For every behavior: write a failing test, run it red, implement minimally, rerun green.

---

### Task 1: Atomic Saved Job mutations

**Files:**
- Create: src/shared/services/saved-job.ts
- Create: src/shared/services/__tests__/saved-job.test.ts
- Create: src/shared/services/__tests__/saved-job.integration.test.ts
- Modify: src/app/api/saved-jobs/route.ts
- Modify: src/app/api/jobs/[jobSnapshotId]/save/route.ts
- Test: src/features/job-board/components/__tests__/job-board-api-wiring.test.tsx

**Interfaces:**
- Produce saveJobForUser(input) and unsaveJobForUser(input).
- Consume trusted userId, JobSnapshot ownership rules, profile ownership, registry entitlements, and Prisma transactions.

- [ ] Write unit tests for Free/Pro limits, foreign private snapshots, foreign profiles, duplicate idempotency, delete-then-save, and stable SAVED_JOB_LIMIT_REACHED.
- [ ] Run: npx vitest run src/shared/services/__tests__/saved-job.test.ts
- [ ] Confirm RED because the service is absent.
- [ ] Implement one interactive transaction:

    return prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        userId,
        'saved_jobs',
      );
      // Access, duplicate, plan, count, and create remain under this lock.
    });

- [ ] Make both route POST handlers strict and delegate only to saveJobForUser; make both delete variants delegate to unsaveJobForUser.
- [ ] Run unit and route tests; confirm GREEN.
- [ ] Add a real PostgreSQL Promise.allSettled test at limit-minus-one and assert one success plus an exact final count.
- [ ] Run: npx vitest run src/shared/services/__tests__/saved-job.integration.test.ts
- [ ] Commit: git commit -m \"fix: enforce saved job limits atomically\"

### Task 2: Atomic Career Profile creation

**Files:**
- Create: src/shared/services/career-profile.ts
- Create: src/shared/services/__tests__/career-profile.test.ts
- Create: src/shared/services/__tests__/career-profile.integration.test.ts
- Modify: src/features/onboarding/actions.ts
- Modify: src/features/dashboard/actions/profile-actions.ts

**Interfaces:**
- Produce createProfileWithinPlanLimit, setDefaultProfileForUser, and deleteProfileForUser.

- [ ] Write tests for Free limit 1, Pro limit 3, generated onboarding labels, explicit duplicate labels, first/default behavior, foreign users, and PROFILE_LIMIT_REACHED.
- [ ] Run the new unit test and confirm RED.
- [ ] Implement one withProfileLock helper using an additional_career_profiles advisory transaction lock.
- [ ] Resolve plan, count, validate label/target fields, choose any onboarding suffix, and create before releasing the lock.
- [ ] Use the same lock for default switching and deletion so exactly one surviving profile is default.
- [ ] Route onboarding, dashboard, and implicit first-profile creation through the service.
- [ ] Run onboarding/dashboard/service tests; confirm GREEN.
- [ ] Add a real PostgreSQL concurrent final-slot test and assert one success and one default.
- [ ] Commit: git commit -m \"fix: enforce profile limits atomically\"

### Task 3: Provider JobSnapshot trust boundary

**Files:**
- Modify: src/shared/services/job-snapshot.ts
- Modify: src/app/api/jobs/snapshots/route.ts
- Modify: src/app/api/saved-jobs/route.ts
- Create: src/app/api/jobs/snapshots/__tests__/route.test.ts
- Modify: src/shared/services/__tests__/job-snapshot.test.ts
- Modify: src/shared/services/__tests__/job-search-view.test.ts

**Interfaces:**
- Consume the JobSnapshot.id already emitted by materialiseSearchJobCards.
- Produce a strict compatibility lookup accepting only jobSnapshotId.

- [ ] Write failing tests that submit forged title, company, description, canonicalJobId, provider IDs, and unknown fields.
- [ ] Assert valid shared/owned-private IDs succeed, invalid/foreign IDs fail, and no canonical writer is called.
- [ ] Run the route test; confirm RED against current passthrough ingestion.
- [ ] Replace /api/jobs/snapshots ingestion with strict ID lookup and INVALID_JOB_REFERENCE.
- [ ] Rename/scope provider persistence exports; keep persistSnapshot private and update trusted provider refresh/search callers.
- [ ] Add regressions proving createMatchRequest stores shared-vacancy overrides only in private request text, User B never resolves User A text, and private imports still work.
- [ ] Run all job search/snapshot/save tests; confirm GREEN.
- [ ] Commit: git commit -m \"fix: trust only server job snapshot references\"

### Task 4: CV regeneration input ceilings

**Files:**
- Modify: src/shared/config/analysis-domain.ts
- Create: src/app/api/cv/regenerate/schema.ts
- Create: src/app/api/cv/__tests__/regenerate-schema.test.ts
- Modify: src/app/api/cv/regenerate/route.ts
- Modify: src/app/api/cv/__tests__/regenerate.test.ts

**Interfaces:**
- Produce REGENERATION_CONTEXT_LIMITS and strict RegenerateSchema.

- [ ] Write tests at and one over every limit: 20 HITL entries, 120-char keys, 2,000-char values, 40,000 HITL bytes, 100 approved items, 100 application IDs, 128-char identifiers, and 65,536 total bytes.
- [ ] Test duplicate semantic IDs and unknown fields.
- [ ] Run schema tests; confirm RED.
- [ ] Implement constants and strict nested Zod schemas. Use Buffer.byteLength(JSON.stringify(value), 'utf8') in superRefine.
- [ ] Move parsing immediately after authentication, before rate limiting, entitlement lookup, reservation, and all domain DB reads.
- [ ] Assert oversized input calls none of assertCapability, reserveCapability, canonical loaders, or rewriteCVWithProvenance.
- [ ] Run schema/regeneration tests; confirm GREEN.
- [ ] Commit: git commit -m \"fix: bound CV regeneration context\"

### Task 5: Upload-intent persistence and storage primitives

**Files:**
- Modify: prisma/schema.prisma
- Create: prisma/migrations/20260913_add_cv_upload_intents/migration.sql
- Modify: src/shared/lib/storage.ts
- Create: src/shared/lib/__tests__/storage.test.ts

**Interfaces:**
- Produce CvUploadIntent/CvUploadIntentStatus plus ObjectStorage.createUploadUrl and ObjectStorage.stat.

- [ ] Write storage tests proving PUT signing uses the uploads bucket, exact server key, content type/length, five-minute expiry, and HeadObject.
- [ ] Run storage test; confirm RED.
- [ ] Add createUploadUrl and stat without provider-specific branches.
- [ ] Add Prisma intent status enum/model, owner relation, unique objectKey, and indexes on user/status/expiry and status/expiry.
- [ ] Add a forward migration only.
- [ ] Run: npx prisma validate
- [ ] Run: npx prisma generate
- [ ] Run storage tests; confirm GREEN.
- [ ] Commit: git commit -m \"feat: add direct CV upload intents\"

### Task 6: Upload intent lifecycle service

**Files:**
- Create: src/shared/services/cv-upload-intent.ts
- Create: src/shared/services/__tests__/cv-upload-intent.test.ts
- Create: src/shared/services/__tests__/cv-upload-intent.integration.test.ts
- Modify: src/shared/services/stored-cv.ts
- Modify: src/shared/services/cv-extraction/errors.ts
- Modify: src/shared/services/cv-pipeline-http.ts

**Interfaces:**
- Produce createCvUploadIntent, finalizeCvUpload, cleanupCvUploadIntents, and countReservedStoredCvSlots.

- [ ] Write failing tests for metadata, random keys, ownership, expiry, reuse, size mismatch, malformed PDF/DOCX, successful formats, duplicates, failures, and repeatable cleanup.
- [ ] Run unit tests; confirm RED.
- [ ] Under the stored_source_cvs lock, count active StoredCv rows plus:

    {
      userId,
      status: { in: ['PENDING', 'VALIDATING'] },
      expiresAt: { gt: now },
    }

- [ ] Explicitly exclude FAILED, EXPIRED, COMPLETED, and expired live-state rows.
- [ ] Atomically claim finalize with owner + PENDING + unexpired updateMany; set VALIDATING and extend expiry ten minutes.
- [ ] Stat/download/validate outside DB transactions, then reacquire the lock to deduplicate/create StoredCv and complete the intent atomically.
- [ ] On failure mark FAILED, await exact-object deletion, and throw stable upload errors.
- [ ] Cleanup expired PENDING/stale VALIDATING/FAILED objects idempotently; missing objects are success.
- [ ] Run unit tests; confirm GREEN.
- [ ] Add PostgreSQL/MinIO tests for PUT/finalize, privacy, formats, malformed data, ownership, reuse, expiry, cleanup, and concurrent final slots.
- [ ] Commit: git commit -m \"feat: finalize direct CV uploads safely\"

### Task 7: Direct-upload routes and browser flow

**Files:**
- Create: src/app/api/stored-cvs/upload-intent/route.ts
- Create: src/app/api/stored-cvs/upload-complete/route.ts
- Create: src/app/api/stored-cvs/__tests__/upload-intent.test.ts
- Create: src/app/api/stored-cvs/__tests__/upload-complete.test.ts
- Modify: src/app/api/stored-cvs/route.ts
- Modify: src/features/onboarding/api.ts
- Modify: src/features/onboarding/components/UploadStep.tsx
- Modify: nearest onboarding component tests

**Interfaces:**
- Produce authenticated strict intent/finalize APIs and onboardingApi.upload direct PUT flow.

- [ ] Write failing route tests for authentication, strict input, ownership, stable errors, and no bucket/credentials in responses.
- [ ] Write failing client tests proving intent POST -> storage PUT -> finalize POST, with no finalize after a failed PUT.
- [ ] Run route/client tests; confirm RED.
- [ ] Implement thin routes delegating to Task 6 services.
- [ ] Remove multipart POST from /api/stored-cvs while preserving GET listing and PUT extraction.
- [ ] Update reusable onboarding upload client and minimal progress/error state; never send File bytes to Next.js.
- [ ] Run stored-CV and onboarding tests; confirm GREEN.
- [ ] Commit: git commit -m \"feat: upload stored CVs directly to object storage\"

### Task 8: Remaining multipart limits and CORS

**Files:**
- Modify: src/shared/config/analysis-domain.ts
- Modify: src/app/api/analyze/schema.ts
- Modify: src/app/api/analyze/detect/route.ts
- Modify: src/app/api/ats-analyses/route.ts
- Modify: src/app/api/job-matches/route.ts
- Modify: src/shared/services/cv-revision.ts
- Modify: src/shared/services/public-ats-service.ts
- Modify: exact upload UI copy found by rg
- Create: docker/minio-cors.json
- Modify: docker-compose.yml
- Modify: .env.example
- Create/modify: focused storage deployment documentation under docs

- [ ] Write tests proving 4 MiB is accepted and one byte over is rejected before extraction/provider work on ATS, detect, Job Match, and public demo routes.
- [ ] Run focused tests; confirm RED at the current 10 MiB limit.
- [ ] Add maxDirectMultipartCvBytes = 4 * 1024 * 1024 without changing the 10 MiB Stored CV constant.
- [ ] Apply it at route/service boundaries and update only matching upload copy.
- [ ] Configure MinIO uploads-bucket CORS for local origins, PUT, and required headers only; retain private bucket policy.
- [ ] Document the equivalent R2 rule for https://align.vyndra.tech with no wildcard origin or public read.
- [ ] Run focused tests and docker compose config; confirm GREEN.
- [ ] Commit: git commit -m \"fix: bound multipart uploads for Vercel\"

### Task 9: Full migration and deployment verification

**Files:**
- Modify only files required by failures introduced above.
- Never modify Stripe-related files.

- [ ] Run: npm run dev:up
- [ ] Run: npm run db:deploy
- [ ] Run: npx prisma migrate status
- [ ] Run: npx prisma validate
- [ ] Run: npx prisma generate
- [ ] Run all focused unit, route, concurrency, and MinIO suites from Tasks 1-8.
- [ ] Run: npm run typecheck
- [ ] Run: npm run lint
- [ ] Run: npm test
- [ ] Run: npm run build
- [ ] Run: git diff --check
- [ ] Audit changed paths for stripe/billing and confirm none changed.
- [ ] Record exact focused/full/concurrency/build results and ending SHA.
- [ ] Commit only if verification required code changes.

