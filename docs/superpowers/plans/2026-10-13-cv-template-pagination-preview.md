# CV Template, Pagination, and Document Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four refined, content-preserving CV templates with real one/two-page validation, private cached PDF/PNG previews, an accessible template carousel, and a Generated CV document viewer.

**Architecture:** The existing `CvBuildSpecV2` remains the sole content contract. A private Gotenberg/LibreOffice service renders each candidate DOCX to PDF; `unpdf` verifies actual page count and `@napi-rs/canvas` rasterises accepted pages. A one-to-one `GeneratedCvPreview` record and private R2 artifacts cache each immutable version, while authenticated Next.js routes and focused client components expose thumbnails and previews.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, TypeScript, Prisma 7/PostgreSQL, S3-compatible R2/MinIO, `docx`, Gotenberg 8.37.0 LibreOffice image, `unpdf`, `pdfjs-dist`, `@napi-rs/canvas`, Vitest, Testing Library, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-13-cv-template-pagination-preview-design.md`

## Global Constraints

- Preserve stable template IDs `architect`, `editorial_refined`, `technical_precision`, and `academic_latex`; `architect` remains the default.
- Preserve canonical content, approved rewrites, evidence/section/item ordering, provenance checks, stale-evidence fixes, quotas, ownership, and the existing generation path.
- A new `GeneratedCV` may be completed only after its real PDF render proves one or two A4 pages.
- Never estimate page count, stretch a one-page document, compress a valid two-page document, truncate approved content, or rerun AI during layout retries.
- Layout floors are 9.5 pt body, 9 pt metadata, 10 pt headings, 12.7 mm margins, and 1.0 line spacing.
- PDF/PNG artifacts remain in the private `rewrites` bucket and are served only through authenticated, owner-scoped routes.
- Preview caching is per immutable generated document version and never deduplicates across users.
- Gotenberg is private/protected, uses exact template fonts, accepts only bounded DOCX conversion requests, and never receives user identifiers or storage URLs.
- Do not add Phase 12 work, another AI path/provider, a general document manager, a generated-CV editor, or a generated-CV delete feature.
- Do not run `npx impeccable update`; it is explicitly deferred.

## Review Focus

- Two different users produce byte-identical DOCX files: each receives a separate owner-scoped preview record and neither can access the other's artifacts (Task 4 and Task 7 tests).
- A Vercel invocation dies while holding a preview lease: the expired lease is reclaimable, while an unexpired lease prevents duplicate conversion (Task 4 tests).
- The preferred profile renders two pages while a tighter profile would render one: the preferred two-page result is accepted without unnecessary compression (Task 3 tests).
- PDF validation succeeds but page-two PNG upload fails: the verified PDF/DOCX remain available and preview status is recoverably failed without double charging (Task 5 tests).
- A legacy document renders three pages: it remains downloadable, is never labelled verified, and records `LEGACY_PAGE_LIMIT_EXCEEDED` without modifying the DOCX (Task 6 tests).

---

### Task 1: Template catalogue and readable layout profiles

**Files:**
- Modify: `src/shared/constants/templates.ts`
- Create: `src/shared/templates/layout.ts`
- Modify: `src/shared/templates/v2.ts`
- Modify: `src/shared/templates/v2-shared.ts`
- Modify: `src/shared/templates/template1_architect.ts`
- Modify: `src/shared/templates/template2_editorial.ts`
- Modify: `src/shared/templates/template3_technical.ts`
- Modify: `src/shared/templates/template4_academic.ts`
- Modify: `src/shared/templates/__tests__/v2-rendered-docx.test.ts`
- Create: `src/shared/templates/__tests__/layout.test.ts`

**Interfaces:**
- Produces: `CV_TEMPLATE_DEFINITIONS: Record<TemplateId, CvTemplateDefinition>` with `name`, `description`, `purpose`, and `version`.
- Produces: `CvLayoutProfile = 'preferred' | 'compact' | 'compact-tight'`.
- Produces: `layoutFor(templateId: TemplateId, density: CvDensity, profile: CvLayoutProfile): TemplateLayout`.
- Produces: `generateV2Template(spec: CvBuildSpecV2, options?: { profile?: CvLayoutProfile }): Promise<Buffer>`.

- [ ] **Step 1: Write failing template metadata and layout-floor tests**

Assert that all four stable IDs map to the approved names, fonts, purposes, and versions; `architect` remains the default; every profile uses A4 portrait; no profile crosses the font, margin, or line-spacing floors; and compact profiles monotonically reduce only spacing/margins.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `npm test -- src/shared/templates/__tests__/layout.test.ts src/shared/templates/__tests__/v2-rendered-docx.test.ts`
Expected: FAIL because the catalogue/layout interfaces do not exist and current DOCX files do not set explicit A4 size or approved fonts.

- [ ] **Step 3: Add the catalogue and layout contracts**

Implement the exact mapping from the spec: Classic ATS/Arial, Modern Professional/Georgia, Academic / Graduate/Times New Roman, Project-Focused/Trebuchet MS. Express A4 as 11,906 × 16,838 twips and keep every adjustable value in `TemplateLayout`, not scattered across renderers.

- [ ] **Step 4: Make all renderers consume the selected layout profile**

Pass `TemplateLayout` through `packV2Document`, `sectionParagraphs`, and `entryParagraphs`. Preserve `CvBuildSpecV2.sections` order exactly, keep headings/entry metadata together, keep individual bullets together, and never keep an entire long section together.

- [ ] **Step 5: Extend the OOXML regression assertions**

For every template/profile, assert explicit A4 size/margins, expected font and visual marker, one DOCX bullet per presentation line, unchanged canonical marker counts, and unchanged section order.

- [ ] **Step 6: Run the template suite**

Run: `npm test -- src/shared/templates src/shared/cv-generation/__tests__/regeneration-bullet-integrity.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit the coherent template change**

```bash
git add src/shared/constants/templates.ts src/shared/templates
git commit -m "feat(cv): refine template identities and layout profiles"
```

### Task 2: Private Gotenberg deployment and renderer client

**Files:**
- Create: `docker/gotenberg/Dockerfile`
- Create: `docker/gotenberg/verify-fonts.sh`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `scripts/check-env.mts`
- Modify: `src/shared/config/__tests__/env-loading.test.ts`
- Create: `src/shared/document-preview/renderer-config.ts`
- Create: `src/shared/document-preview/renderer-client.ts`
- Create: `src/shared/document-preview/__tests__/renderer-client.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `rendererConfig(): { baseUrl: URL; username: string; password: string; rendererVersion: string; timeoutMs: 65000 }`.
- Produces: `convertDocxToPdf(input: { docx: Buffer; traceId: string; signal?: AbortSignal }): Promise<Buffer>`.
- Produces: `probeDocumentRenderer(): Promise<{ healthy: boolean; rendererVersion: string }>`.
- Produces: `DocumentConversionError` with `code: 'DOCUMENT_CONVERSION_FAILED'`, `retryable`, and `status`.

- [ ] **Step 1: Write failing renderer configuration tests**

Assert that production validation requires `GOTENBERG_URL`, username, password, and version; rejects non-HTTPS production URLs; never accepts `NEXT_PUBLIC_` renderer secrets; and permits the internal Compose URL in development.

- [ ] **Step 2: Write failing renderer-client tests**

Mock `fetch` and assert a constant `document.docx` multipart filename, Basic authentication, a non-PII trace ID, `skipEmptyPages=false`, a 65-second abort, one retry for `500`/`503`/timeout, no retry for `400`, a 10 MiB input ceiling, and no response-body logging.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- src/shared/document-preview/__tests__/renderer-client.test.ts src/shared/config/__tests__/env-loading.test.ts`
Expected: FAIL because the renderer modules and environment checks do not exist.

- [ ] **Step 4: Add the pinned renderer container**

Base the image on `gotenberg/gotenberg:8.37.0-libreoffice`, install the Core Fonts package under its licence, rebuild the font cache, and make `verify-fonts.sh` fail unless Arial, Georgia, Times New Roman, and Trebuchet MS resolve exactly. Configure Compose with one internal replica, 1 vCPU/2 GiB guidance, `API_TIMEOUT=60s`, `API_BODY_LIMIT=10MB`, `LIBREOFFICE_MAX_QUEUE_SIZE=4`, `LIBREOFFICE_RESTART_AFTER=10`, `LIBREOFFICE_START_TIMEOUT=20s`, Basic auth, and a health check.

- [ ] **Step 5: Implement server-only configuration and conversion client**

Import `server-only`, use Web `FormData`/`Blob`, set the Gotenberg output filename to a constant, bound retries with jitter, validate `application/pdf` plus `%PDF-` signature, and map deterministic/transient failures without including document bytes or text in errors.

- [ ] **Step 6: Add the required raster peer dependency**

Run: `npm install @napi-rs/canvas`
Expected: `package.json` and lockfile contain the platform-aware canvas dependency used by `unpdf`.

- [ ] **Step 7: Run focused tests and Compose validation**

Run: `npm test -- src/shared/document-preview/__tests__/renderer-client.test.ts src/shared/config/__tests__/env-loading.test.ts`
Expected: PASS.
Run: `docker compose config`
Expected: valid configuration with a private `gotenberg` service and no published host port.

- [ ] **Step 8: Commit the renderer boundary**

```bash
git add docker/gotenberg docker-compose.yml .env.example scripts/check-env.mts src/shared/config package.json package-lock.json src/shared/document-preview
git commit -m "feat(cv): add private document renderer boundary"
```

### Task 3: Actual PDF page validation and bounded layout selection

**Files:**
- Create: `src/shared/document-preview/pdf-preview.ts`
- Create: `src/shared/document-preview/validated-document.ts`
- Create: `src/shared/document-preview/__tests__/pdf-preview.test.ts`
- Create: `src/shared/document-preview/__tests__/validated-document.test.ts`

**Interfaces:**
- Consumes: `convertDocxToPdf` and `generateV2Template(spec, { profile })`.
- Produces: `inspectPdf(pdf: Buffer): Promise<{ pageCount: number }>`.
- Produces: `renderPdfPages(pdf: Buffer, pageCount: 1 | 2): Promise<Buffer[]>`.
- Produces: `ValidatedDocument` with `docx`, `pdf`, `pageCount`, `profile`, `documentHash`, and `preview: { status: 'READY'; pages: Buffer[] } | { status: 'FAILED'; failureCode: 'THUMBNAIL_RENDER_FAILED' }`.
- Produces: `renderValidatedDocument(input: { spec: CvBuildSpecV2; traceId: string; dependencies?: RenderDependencies }): Promise<ValidatedDocument>`.
- Produces: `PageValidationError` with code `PAGE_VALIDATION_UNAVAILABLE` or `PAGE_LIMIT_EXCEEDED` and observed profile/page-count diagnostics.

- [ ] **Step 1: Write failing PDF inspection/raster tests**

Use a minimal fixture PDF to assert real `numPages`, exactly one requested PNG per page, PNG signatures, bounded render dimensions, and rejection of malformed/non-PDF bytes as `PAGE_VALIDATION_UNAVAILABLE`.

- [ ] **Step 2: Write failing layout-selection tests**

Inject deterministic generator/converter dependencies and assert these sequences: preferred `1` accepts immediately; preferred `2` accepts without trying compact; preferred `3`, compact `2` accepts compact; `3,3,2` accepts compact-tight; `3,3,3` throws `PAGE_LIMIT_EXCEEDED`; conversion failure remains `DOCUMENT_CONVERSION_FAILED`; PNG failure returns a validated document with failed preview.

- [ ] **Step 3: Add the explicit non-compression review-focus test**

Configure preferred to render two pages and compact to render one. Assert only preferred runs and the result remains two pages.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/shared/document-preview/__tests__/pdf-preview.test.ts src/shared/document-preview/__tests__/validated-document.test.ts`
Expected: FAIL because the PDF and orchestration modules do not exist.

- [ ] **Step 5: Implement bounded PDF parsing and rasterisation**

Use `unpdf.getDocumentProxy` for `numPages`, configure resource limits/timeouts, define the official PDF.js module once for `renderPageAsImage`, inject `@napi-rs/canvas`, and reject page counts outside a safe parser ceiling before raster fan-out.

- [ ] **Step 6: Implement the deterministic layout loop and hash**

Try `preferred`, `compact`, then `compact-tight` only after overflow. Hash the accepted DOCX bytes plus renderer contract version plus template version. Never mutate `spec`, rerun AI, or drop sections/lines.

- [ ] **Step 7: Run focused and integrity tests**

Run: `npm test -- src/shared/document-preview src/shared/cv-generation/__tests__/regeneration-bullet-integrity.test.ts src/shared/cv-generation/__tests__/production-shaped-normalization.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit the validation pipeline**

```bash
git add src/shared/document-preview
git commit -m "feat(cv): validate actual rendered page counts"
```

### Task 4: Preview persistence and distributed conversion leases

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261013200000_generated_cv_previews/migration.sql`
- Create: `src/shared/document-preview/types.ts`
- Create: `src/shared/document-preview/preview-repository.ts`
- Create: `src/shared/document-preview/__tests__/preview-repository.test.ts`
- Create: `src/shared/document-preview/__tests__/preview-repository.integration.test.ts`
- Regenerate: `src/generated/prisma/**`

**Interfaces:**
- Produces: Prisma enums `GeneratedCvPreviewStatus` and `GeneratedCvPreviewFailureCode` with exactly the states/codes in the spec.
- Produces: `claimPreview(input: { userId: string; generatedCvId: string; documentHash: string; now: Date }): Promise<{ status: 'claimed'; previewId: string } | { status: 'ready'; preview: PreviewRecord } | { status: 'in_progress' }>`.
- Produces: `completePreview`, `failPreview`, `loadOwnedPreview`, and `previewLeaseExpired`.
- Produces: `PREVIEW_LEASE_MS = 2 * 60 * 1000`.

- [ ] **Step 1: Write the additive schema and migration contract test**

Assert a one-to-one `GeneratedCV.preview`, owner relation, `generatedCvId @unique`, `[userId, documentHash]` index (not unique), private artifact metadata, status/failure enums, attempt count, and lease expiry. Assert cascading database deletion of metadata while object deletion remains service-owned.

- [ ] **Step 2: Write failing lease/cache unit tests**

Cover first claim, matching READY reuse, unexpired RENDERING contention, expired lease reclaim, FAILED retry claim, attempt increments, hash mismatch for the same immutable version, and owner-scoped reads.

- [ ] **Step 3: Add the cross-user identical-hash test**

Create two generated CV owners with the same `documentHash`; assert both preview records persist and `loadOwnedPreview` never returns the other user's row.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/shared/document-preview/__tests__/preview-repository.test.ts`
Expected: FAIL because the model and repository do not exist.

- [ ] **Step 5: Implement the Prisma model and SQL migration**

Use `String[] @default([])` for page keys, `Int[] @default([])` for page sizes, nullable `pdfKey/pageCount/failureCode/leaseExpiresAt`, and indexes on `[userId, documentHash]` and `[status, leaseExpiresAt]`. Do not edit generated Prisma files manually.

- [ ] **Step 6: Regenerate Prisma and implement compare-and-set transitions**

Run: `npx prisma generate`
Expected: generated client includes `GeneratedCvPreview`. Implement atomic `updateMany`/transaction transitions so two Vercel instances cannot both own an unexpired lease.

- [ ] **Step 7: Run schema, unit, and opt-in integration checks**

Run: `npx prisma validate`
Expected: schema valid.
Run: `npm test -- src/shared/document-preview/__tests__/preview-repository.test.ts`
Expected: PASS.
Run with local database: `npm test -- src/shared/document-preview/__tests__/preview-repository.integration.test.ts`
Expected: PASS, including real concurrent claims.

- [ ] **Step 8: Commit the persistence boundary**

```bash
git add prisma src/generated/prisma src/shared/document-preview
git commit -m "feat(cv): persist immutable document previews"
```

### Task 5: Publish only page-validated generated CVs

**Files:**
- Create: `src/shared/document-preview/preview-storage.ts`
- Create: `src/shared/document-preview/__tests__/preview-storage.test.ts`
- Modify: `src/shared/cv-generation/generate.ts`
- Modify: `src/shared/cv-generation/__tests__/generate-orchestration.test.ts`
- Modify: `src/app/api/cv-generations/[id]/generate/route.ts`
- Create: `src/app/api/cv-generations/[id]/generate/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `renderValidatedDocument`, preview repository, existing `storage`, capability reservation, and generated-CV transaction.
- Produces: `previewArtifactKeys(userId, generatedCvId, documentHash, pageCount)`.
- Produces: `storeValidatedArtifacts(input): Promise<{ pdfKey: string; pageImageKeys: string[]; sizes: { pdf: number; pages: number[] } }>`.
- Produces: `GenerationPageValidationError` projection to stable HTTP responses.

- [ ] **Step 1: Write failing artifact-key and storage tests**

Assert keys stay under `users/{userId}/{generatedCvId}/previews/{hash}/`, reject separators/traversal, set `application/pdf`/`image/png`, upload PDF before pages, and best-effort delete already uploaded artifacts when required persistence fails.

- [ ] **Step 2: Extend generation orchestration tests before implementation**

Assert generation claims `PLAN_APPROVED ? GENERATING` atomically, invokes the renderer after existing truth/provenance validation, publishes/charges only after a one/two-page PDF and durable DOCX/PDF, stores READY preview metadata for successful PNGs, and recovers the existing immutable result on retry.

- [ ] **Step 3: Add distinct failure-state tests**

Assert conversion and page-validation failures publish no `GeneratedCV` and release quota; `PAGE_LIMIT_EXCEEDED` retains every approved evidence item; PNG or page-image upload failure still publishes the verified DOCX/PDF once with `THUMBNAIL_RENDER_FAILED`/`PREVIEW_STORAGE_FAILED`; page-two PNG failure never double-charges on retry.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/shared/document-preview/__tests__/preview-storage.test.ts src/shared/cv-generation/__tests__/generate-orchestration.test.ts src/app/api/cv-generations/[id]/generate/__tests__/route.test.ts`
Expected: FAIL on the new page-validation publication contract.

- [ ] **Step 5: Implement deterministic storage and generation claiming**

Claim with `updateMany({ status: 'PLAN_APPROVED' })`; treat an existing completed row as recovery and an active claim as in-progress. Render before `persistRow`, upload deterministic DOCX/PDF/page keys, create `GeneratedCV` and its preview metadata in the existing result transaction, and keep reservation commit/release semantics unchanged.

- [ ] **Step 6: Implement precise API errors and retry guidance**

Map `DOCUMENT_CONVERSION_FAILED`, `PAGE_VALIDATION_UNAVAILABLE`, and `PAGE_LIMIT_EXCEEDED` to distinct safe JSON error codes/messages. Set `export const runtime = 'nodejs'` and `export const maxDuration = 120` on the route. Do not return partial bytes on failure.

- [ ] **Step 7: Run generation, reservation, and integrity regressions**

Run: `npm test -- src/shared/cv-generation src/shared/document-preview src/app/api/cv-generations/[id]/generate/__tests__/route.test.ts`
Expected: PASS with previous bullet/source/stale-evidence tests unchanged.

- [ ] **Step 8: Commit validated publication**

```bash
git add src/shared/document-preview src/shared/cv-generation src/app/api/cv-generations
git commit -m "feat(cv): publish only page-validated documents"
```

### Task 6: Lazy legacy previews and artifact lifecycle cleanup

**Files:**
- Create: `src/shared/document-preview/preview-service.ts`
- Create: `src/shared/document-preview/__tests__/preview-service.test.ts`
- Modify: `src/shared/account-deletion/service.ts`
- Modify: `src/shared/account-deletion/__tests__/service.test.ts`
- Modify: `src/shared/account-deletion/__tests__/service.integration.test.ts`

**Interfaces:**
- Consumes: renderer client, PDF preview, preview repository/storage, existing `GeneratedCV.fileKey`, and storage download.
- Produces: `ensureOwnedPreview(input: { userId: string; generatedCvId: string; now?: Date }): Promise<PreviewEnsureResult>`.
- Produces: `deletePreviewArtifacts(userId: string, preview: PreviewArtifactRecord): Promise<boolean>`.

- [ ] **Step 1: Write failing legacy preview tests**

Cover owner lookup, missing DOCX fallback, matching READY reuse without storage download or conversion, unexpired lease response, expired lease reclaim, one/two-page success, conversion failure, three-page `LEGACY_PAGE_LIMIT_EXCEEDED`, and thumbnail retry using the already verified PDF where available.

- [ ] **Step 2: Add the immutable-content assertion**

For an older three-page DOCX, assert no template regeneration, layout adjustment, database content mutation, or replacement upload occurs; only preview status changes and DOCX download remains available.

- [ ] **Step 3: Extend account-deletion tests**

Include preview PDF and both PNG keys, assert per-user key validation, deduplication, deletion before identity removal, and retained retry behaviour if any preview object deletion fails.

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/shared/document-preview/__tests__/preview-service.test.ts src/shared/account-deletion`
Expected: FAIL because lazy preview orchestration and cleanup are missing.

- [ ] **Step 5: Implement lazy preview orchestration**

Hash the existing DOCX plus renderer/template contract, claim the owner-scoped preview lease, convert the immutable DOCX once, validate one/two pages without layout retries, store artifacts, and make every terminal failure explicit and retry-safe.

- [ ] **Step 6: Add preview objects to account cleanup**

Select `pdfKey` and `pageImageKeys` for the user's previews, pass every key through `checkedUserKey`, and retain the all-or-retry deletion contract.

- [ ] **Step 7: Run lifecycle tests**

Run: `npm test -- src/shared/document-preview src/shared/account-deletion`
Expected: PASS.

- [ ] **Step 8: Commit legacy and cleanup behaviour**

```bash
git add src/shared/document-preview src/shared/account-deletion
git commit -m "feat(cv): add lazy legacy previews and cleanup"
```


### Task 7: Authenticated preview, page-image, and verified-PDF routes

**Files:**
- Create: `src/app/api/cv/[id]/preview/route.ts` and `src/app/api/cv/[id]/preview/__tests__/route.test.ts`
- Create: `src/app/api/cv/[id]/preview/pages/[page]/route.ts` and adjacent route test
- Create: `src/app/api/cv/[id]/pdf/route.ts` and adjacent route test
- Create: `src/shared/document-preview/preview-view.ts`

**Interfaces:**
- Consumes: owner-scoped preview services, private storage, Better Auth, and `download_generated_cv` capability.
- Produces: `CvPreviewView` with status, failure code, verified page count, and application URLs only.

- [ ] **Step 1: Write failing security tests**

Assert unauthenticated `401`, cross-account/missing `404`, no R2 key leakage, private/no-store caching, exact MIME types, valid page bounds, and safe fixed filenames.

- [ ] **Step 2: Write failing state tests**

Assert GET never starts conversion; POST claims/retries one preview; READY exposes exactly one or two page URLs; RENDERING returns `202`; PDF download requires a verified stored PDF and the existing download capability.

- [ ] **Step 3: Run tests and confirm failure**

Run: `npm test -- src/app/api/cv/[id]/preview src/app/api/cv/[id]/pdf`
Expected: FAIL because the routes do not exist.

- [ ] **Step 4: Implement the Node route handlers and view projection**

Follow `withErrorHandler`, await Next.js 16 `params`, stream through the application rather than exposing signed R2 URLs, set `runtime='nodejs'`, and give preview POST `maxDuration=120`.

- [ ] **Step 5: Run route and download regressions**

Run: `npm test -- src/app/api/cv src/app/api/cv-generations/[id]/generate/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/cv src/shared/document-preview/preview-view.ts
git commit -m "feat(cv): serve private previews and verified PDFs"
```

### Task 8: Real-render matrix and synthetic template preview assets

**Files:**
- Create: `src/shared/document-preview/template-sample.ts`
- Create: `src/shared/document-preview/__tests__/real-render.integration.test.ts`
- Create: `scripts/generate-template-previews.mts`
- Create: `public/template-previews/v1/manifest.json`
- Generate: `public/template-previews/v1/{architect,editorial_refined,technical_precision,academic_latex}-page-1.png`
- Modify: `package.json`
- Modify: `docs/STAGE4_GOLDEN_CV_REVIEW.md`

**Interfaces:**
- Consumes: all four template renderers, Gotenberg client, PDF inspection/rasterisation, and the canonical sample `CvBuildSpecV2`.
- Produces: `createSafeTemplateSample(templateId: TemplateId, size: 'short' | 'medium' | 'overflow'): CvBuildSpecV2`.
- Produces: scripts `generate:template-previews` and `test:renderer`.

- [ ] **Step 1: Write the Docker-gated real-render matrix**

For each template, render the short fixture to exactly one page, medium to exactly two, and overflow through all bounded profiles to `PAGE_LIMIT_EXCEEDED`. Assert one/two PNGs as appropriate, exact ordered text markers, valid A4 dimensions, no duplicate or missing bullets, and the known bullet-regression strings remain absent.

- [ ] **Step 2: Add cache/locking proof to the integration suite**

Run two concurrent identical version requests against the real renderer boundary and assert one conversion/one stored artifact set; rerun after READY and assert no renderer call.

- [ ] **Step 3: Run the renderer suite and confirm initial failure**

Run: `npm run test:renderer`
Expected: FAIL until the custom Gotenberg service is healthy and the real pipeline is complete. The script must require `RUN_RENDERER_INTEGRATION=1` and fail rather than skip in this dedicated job.

- [ ] **Step 4: Implement the non-user sample and asset generator**

Use the same complete representative content for every template, verify the sample contains no repository fixture/user PII, render through DOCX?PDF?PNG, and write a manifest containing template ID/version, renderer version, hash, width, and height.

- [ ] **Step 5: Generate and inspect all four assets**

Run: `npm run generate:template-previews`
Expected: four distinct first-page PNGs and one deterministic manifest under `public/template-previews/v1`.

- [ ] **Step 6: Run real-render and existing Stage 4 tests**

Run: `npm run test:renderer`
Expected: PASS for 12 real-render cases and cache/lock checks.
Run: `npm run test:stage4`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shared/document-preview scripts/generate-template-previews.mts public/template-previews package.json docs/STAGE4_GOLDEN_CV_REVIEW.md
git commit -m "test(cv): add real render matrix and template previews"
```

### Task 9: Accessible template-selection carousel

**Files:**
- Create: `src/features/cv-generation/components/TemplateCarousel.tsx`
- Create: `src/features/cv-generation/components/TemplatePreviewDialog.tsx`
- Create: `src/features/cv-generation/components/__tests__/TemplateCarousel.test.tsx`
- Modify: `src/features/cv-generation/components/CvGenerationWizard.tsx`
- Modify: `src/features/cv-generation/components/__tests__/CvGenerationWizard.interactions.test.tsx`
- Modify: `src/features/cv-generation/components/__tests__/CvGenerationWizard.progressive.test.tsx`

**Interfaces:**
- Consumes: `CV_TEMPLATE_DEFINITIONS`, static rendered sample assets, current `template`, and `onTemplateChange(templateId)`.
- Produces: a controlled carousel that never owns or resets approved-plan state.

- [ ] **Step 1: Read the Impeccable craft floor before UI edits**

Read `C:/Users/Hussnain Ali/.agents/skills/impeccable/reference/craft-floor.md` and preserve Align's established Operate-mode paper/workspace design. Do not update the skill itself.

- [ ] **Step 2: Write failing carousel interaction tests**

Assert previous/next wrapping policy, thumbnail selection, Arrow Left/Right, Home/End, `aria-pressed`, labelled controls, visible name/description, larger preview open/close/focus restoration, and selection passed to the wizard approval request.

- [ ] **Step 3: Write touch, reduced-motion, and persistence tests**

Assert a deliberate horizontal pointer threshold changes one template, vertical movement does not; reduced motion avoids slide transforms; navigating back to Review and forward preserves template, evidence exclusions, and section order.

- [ ] **Step 4: Run component tests and confirm failure**

Run: `npm test -- src/features/cv-generation/components/__tests__/TemplateCarousel.test.tsx src/features/cv-generation/components/__tests__/CvGenerationWizard.interactions.test.tsx src/features/cv-generation/components/__tests__/CvGenerationWizard.progressive.test.tsx`
Expected: FAIL because the current design is a card grid.

- [ ] **Step 5: Implement the controlled A4 carousel and preview dialog**

Use semantic buttons, 44 px controls, an A4 aspect-ratio image, horizontally scrollable thumbnails on mobile, no whole-page horizontal overflow, violet selection/focus, lazy images, and immediate reduced-motion state changes. Keep the evidence-safety note and existing approval action.

- [ ] **Step 6: Integrate without remounting the wizard**

Replace only the DESIGN-step grid. Keep `template`, approved plan, exclusions, and section order in the existing wizard state and submit the stable ID unchanged.

- [ ] **Step 7: Run all wizard tests**

Run: `npm test -- src/features/cv-generation/components/__tests__`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/cv-generation/components
git commit -m "feat(cv): add accessible template preview carousel"
```

### Task 10: Generated CV thumbnail gallery and full viewer

**Files:**
- Create: `src/features/dashboard/components/cvs/GeneratedCvCard.tsx`
- Create: `src/features/dashboard/components/cvs/CvPreviewViewer.tsx`
- Create: `src/features/dashboard/components/cvs/useLegacyPreviewQueue.ts`
- Create: `src/features/dashboard/components/cvs/__tests__/GeneratedCvCard.test.tsx`
- Create: `src/features/dashboard/components/cvs/__tests__/CvPreviewViewer.test.tsx`
- Create: `src/features/dashboard/components/cvs/__tests__/useLegacyPreviewQueue.test.tsx`
- Create: `src/features/dashboard/components/views/__tests__/CvsView.test.tsx`
- Modify: `src/features/dashboard/components/views/CvsView.tsx`
- Modify: `src/features/dashboard/components/DashboardShell.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `CvPreviewView` metadata projected by the dashboard query; owner-scoped preview routes; existing DOCX download route.
- Produces: `CvRow.preview` without storage keys and a controlled `CvPreviewViewer`.

- [ ] **Step 1: Write failing card/gallery tests**

Assert actual first-page image for READY, A4 placeholder for missing/pending/failed previews, title/template/date/status/page count, lazy image loading, Preview/DOCX/PDF actions, safe legacy fallback, and no conversion request during initial list render.

- [ ] **Step 2: Write failing legacy queue tests**

Mock `IntersectionObserver` and assert only visible legacy cards enqueue, at most one POST runs at a time, READY refreshes metadata, failed conversion stops automatic retry, unmount aborts pending work, and a manual retry is explicit.

- [ ] **Step 3: Write failing viewer tests**

Assert one-page documents render one page; two-page documents render exactly two in order; previous/next, scroll, bounded zoom, download actions, loading/error states, Escape/close, focus trap/restoration, and narrow-viewport containment work.

- [ ] **Step 4: Run component tests and confirm failure**

Run: `npm test -- src/features/dashboard/components/cvs src/features/dashboard/components/views/__tests__/CvsView.test.tsx`
Expected: FAIL because gallery components and preview metadata are absent.

- [ ] **Step 5: Extend the server projection**

Select preview status/failure/page count only in the existing owner-scoped `generatedCV.findMany`; map stable template labels and application route URLs; never deserialize full CV data or expose `pdfKey/pageImageKeys`.

- [ ] **Step 6: Implement cards, queue, and viewer**

Split the current large card markup into focused components, preserve current provenance metadata and DOCX action, add Verified PDF only when available, and use the existing modal/focus conventions with mobile-safe scroll regions.

- [ ] **Step 7: Run dashboard and accessibility tests**

Run: `npm test -- src/features/dashboard/components src/features/cv-generation/components/__tests__`
Expected: PASS.

- [ ] **Step 8: Run the Impeccable detector once over changed UI targets**

Run: `node C:/Users/Hussnain Ali/.agents/skills/impeccable/scripts/detect.mjs --json src/features/cv-generation/components/TemplateCarousel.tsx src/features/cv-generation/components/TemplatePreviewDialog.tsx src/features/dashboard/components/views/CvsView.tsx src/features/dashboard/components/cvs`
Expected: no unresolved blocking findings. Fix findings in one bounded batch and run one confirmation pass at most.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(dashboard\)/dashboard/page.tsx src/features/dashboard/components
git commit -m "feat(cv): add generated document gallery and viewer"
```

### Task 11: Deployment, security, monitoring, and cost runbook

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/deployment/object-storage.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/PROJECT_STATUS.md`
- Create: `docs/deployment/document-renderer.md`
- Create: `scripts/check-document-renderer.mts`
- Create: `src/shared/config/__tests__/document-renderer-deployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: renderer configuration/health APIs and deployed artifact-key conventions.
- Produces: `npm run check:renderer` operational smoke command and a complete production runbook.

- [ ] **Step 1: Write the failing deployment contract test**

Assert documentation/config pin Gotenberg 8.37.0 LibreOffice-only, exact fonts, protected TLS/auth exposure, one active conversion, queue size 4, 60/65/120-second timeout layers, 10 MiB body limit, private R2 keys, health/alert thresholds, resource minimums, and cost/budget expectations.

- [ ] **Step 2: Run the contract test and confirm failure**

Run: `npm test -- src/shared/config/__tests__/document-renderer-deployment.test.ts`
Expected: FAIL until the runbook and smoke script exist.

- [ ] **Step 3: Write the renderer deployment runbook**

Document local Compose and production container deployment; private networking preference; TLS plus Basic/OIDC and gateway controls for Internet-reachable hosting; secret rotation; disabled routes/features; font/licence provisioning; health, queue, latency, OOM and failure alerts; one-to-two replica scaling policy; logs without PII; backup/cleanup behaviour; Word/LibreOffice pagination caveat; verified-PDF meaning; and current-provider price recording with a 150% budget alert.

- [ ] **Step 4: Implement the safe smoke command**

`check-document-renderer.mts` verifies protected health, version, exact fonts through the deployment contract, and a synthetic one-page conversion. It never uploads user content or prints secrets/body bytes.

- [ ] **Step 5: Update current architecture/status/storage references**

Describe the renderer and preview model as implemented, keep R2 buckets private, document the new artifact prefix and account cleanup, and remove any now-false statement that no renderer exists.

- [ ] **Step 6: Run docs/config checks**

Run: `npm test -- src/shared/config/__tests__/document-renderer-deployment.test.ts`
Expected: PASS.
Run against local renderer: `npm run check:renderer`
Expected: protected healthy renderer, expected version/fonts, successful synthetic conversion.

- [ ] **Step 7: Commit**

```bash
git add docs scripts/check-document-renderer.mts src/shared/config package.json
git commit -m "docs(cv): add private renderer operations runbook"
```

### Task 12: Full regression, visual validation, and completion evidence

**Files:**
- Modify only if failures reveal defects in files already in this plan.
- Produce ignored evidence under: `artifacts/cv-preview-validation/`

**Interfaces:**
- Consumes: every preceding task.
- Produces: validated release evidence and the final implementation report; no new product scope.

- [ ] **Step 1: Run focused CV/template/preview tests**

Run: `npm test -- src/shared/cv-generation src/shared/templates src/shared/document-preview src/features/cv-generation/components/__tests__ src/features/dashboard/components/cvs src/features/dashboard/components/views/__tests__/CvsView.test.tsx src/app/api/cv`
Expected: PASS.

- [ ] **Step 2: Run the real-render matrix**

Run: `npm run test:renderer`
Expected: every template has a real one-page and two-page pass; every overflow fixture produces controlled `PAGE_LIMIT_EXCEEDED`; PNG count equals verified page count; cache/lease cases pass.

- [ ] **Step 3: Run database and generated-client checks**

Run: `npx prisma validate`
Expected: PASS.
Run: `npx prisma generate`
Expected: no uncommitted generated drift.

- [ ] **Step 4: Run full static and test gates**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run lint`
Expected: PASS.
Run: `npm test`
Expected: PASS.
Run: `npm run build`
Expected: PASS.

- [ ] **Step 5: Perform real document and browser inspection**

Inspect one-page and two-page DOCX/PDF/PNG outputs for all four templates at 100% in LibreOffice-rendered PDF and current Microsoft Word. Check content/order, bullets, page boundaries, fonts, orphans, links and no blank spill pages. Check desktop/mobile carousel, gallery, viewer, keyboard, swipe, zoom, reduced motion, loading/failure/retry and cross-account denial. Save screenshots and a result manifest under the ignored artifact directory.

- [ ] **Step 6: Run operational failure smoke tests**

Exercise renderer unavailable, 400 conversion failure, 503/queue saturation, timeout, expired lease, PNG failure, R2 failure, and legacy three-page behaviour. Confirm stable states, no false validation, no content loss, no quota double charge, and existing DOCX recovery/download.

- [ ] **Step 7: Review the complete diff and commit any verification-only fixes**

Run: `git diff --check` and `git status --short`
Expected: no whitespace errors or unintended files. If a bounded fix was required, rerun its focused test and create one coherent fix commit.

- [ ] **Step 8: Prepare the completion report and stop before Phase 12**

Report repository state, template improvements, real page results, renderer deployment/security/cost, preview caching/locking, UI behaviour, storage/privacy/legacy handling, every verification command/result, changed files/commits, and any environmental limitation. Do not begin unrelated work.
