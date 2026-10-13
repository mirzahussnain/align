# CV Template, Pagination, and Document Preview Design

**Date:** 13 October 2026  
**Status:** Approved architecture; implementation pending  
**Scope:** CV templates, rendered pagination validation, template selection, and Generated CV previews only

## 1. Purpose and acceptance criteria

Align will generate professional, ATS-friendly DOCX CVs whose approved content is preserved and whose page count is verified from a real render. A successful new generation must produce exactly one or two rendered A4 pages. Short content remains one page; longer content may flow naturally to page two; approved content is never truncated, deleted, fabricated, or silently reordered to meet the limit.

The same rendered document version supplies the verified page count, first-page thumbnail, and full preview. Template selection becomes an accessible A4 carousel, and Generated CVs becomes a lazy thumbnail gallery with an authenticated full-document viewer and DOCX/PDF downloads.

This phase is complete when:

- all four existing template identifiers remain compatible and render distinct, professional documents;
- every successful new generation has a verified page count of one or two;
- content that cannot fit within two pages under bounded readable adjustments returns `PAGE_LIMIT_EXCEEDED` without content loss;
- conversion failure never produces a page-validated successful CV;
- thumbnail failure remains recoverable and does not destroy a valid DOCX or verified PDF;
- previews are generated once per immutable document version and remain private;
- canonical evidence, approved rewrites, section order, provenance, quotas, idempotency, and ownership checks remain intact.

## 2. Existing boundaries that remain authoritative

The implementation extends the current flow rather than creating a second generation path:

1. The user selects a Career Profile or completed Job Match.
2. Align reconciles evidence and prepares a plan.
3. The user approves evidence, optional omissions, and section order.
4. The user selects a template.
5. `generateApprovedCv` assembles and validates the canonical `CvBuildSpecV2`.
6. The selected renderer produces a DOCX.
7. The new render pipeline verifies the DOCX and prepares preview artifacts.
8. The existing reservation transaction publishes a `GeneratedCV` only after required validation succeeds.

The following are unchanged:

- `architect`, `editorial_refined`, `technical_precision`, and `academic_latex` template IDs;
- approved evidence and rewrite boundaries;
- truth, provenance, preservation, stale-evidence, and source-order validation;
- the current AI orchestrator, prompts, scoring, entitlements, and reservation accounting;
- private S3-compatible storage and owner-scoped downloads;
- immutable approved plans and generated document versions.

No Phase 12 work, new AI provider, general document manager, drag-and-drop editor, or unrelated redesign belongs in this phase.

## 3. Template mapping and design

The database and API continue to store the existing IDs. Only user-facing names and renderer styling change.

| Stable ID | User-facing name | Purpose | Visual treatment |
| --- | --- | --- | --- |
| `architect` | Classic ATS | Default for general UK applications | Conservative single column, Arial, restrained navy, conventional rules and right-aligned dates |
| `editorial_refined` | Modern Professional | Software, business, and professional roles | Georgia-led editorial hierarchy, restrained warm accent, open but compact spacing |
| `academic_latex` | Academic / Graduate | Education, qualifications, awards, research, and early-career evidence | Times New Roman, monochrome rules, education-friendly hierarchy |
| `technical_precision` | Project-Focused | Portfolio, project, and technical contribution-led candidates | Trebuchet MS, compact teal hierarchy, stronger project titles and technology lines |

These fonts are chosen because they are widely available in Microsoft Word and can be installed exactly in the renderer through the Microsoft Core Fonts package. The custom renderer image must fail its build or health verification if `fc-match` cannot resolve the exact declared family. Font substitution is not accepted in real-render tests.

All templates remain single-column and use normal paragraphs, lists, tabs, and simple borders. They do not use text boxes, progress bars, decorative icons, floating objects, or nested layout tables. Templates receive the same `CvBuildSpecV2` and preserve its section and item order. Project-Focused may change visual emphasis but must not reorder `PROJECTS` or any other section behind the user's approved plan.

The default template remains `architect`. Previously generated records continue to resolve their stored IDs to the new labels.

## 4. Readable layout profiles and pagination policy

### 4.1 A4 and readable minimums

Every renderer explicitly sets A4 portrait dimensions. Each template owns three versioned layout profiles:

- `preferred`: the template's normal readable spacing and margins;
- `compact`: reduced non-content spacing and bullet gaps;
- `compact-tight`: the final safe profile with slightly reduced margins and spacing.

Profiles may adjust only page margins, paragraph spacing, heading spacing, bullet indentation, and the existing body/title sizes within these floors:

- body text: 9.5 pt minimum;
- supporting metadata: 9 pt minimum;
- section headings: 10 pt minimum;
- page margins: 12.7 mm minimum on every side;
- line spacing: 1.0 minimum;
- no negative spacing, condensed character scaling, hidden runs, or content omission.

The selected plan density influences the `preferred` profile but does not select a page target. `targetLength` remains historical plan metadata and never forces a second page.

### 4.2 Selection algorithm

`renderValidatedDocument` follows this deterministic algorithm:

1. Generate the DOCX with the template's `preferred` profile.
2. Convert that exact DOCX to PDF and read `pdf.numPages`.
3. If it has one or two pages, accept it immediately. Do not stretch a one-page result or compact a valid two-page result merely to make it one page.
4. If it exceeds two pages, repeat with `compact`.
5. If it still exceeds two pages, repeat with `compact-tight`.
6. If all profiles exceed two pages, return `PAGE_LIMIT_EXCEEDED` with every observed page count and preserve the approved plan/evidence unchanged.

This makes two pages a maximum, not a target. Layout adjustment occurs only after a real render exceeds the limit. No character count, OOXML marker, estimated height, or manual page break is accepted as page-count evidence.

Section headings retain `keepNext`; entry headings and their metadata retain `keepNext`; individual bullet paragraphs retain `keepLines`. Long sections may span pages. No renderer sets `keepNext` across an entire section or inserts a page break solely to move a section.

### 4.3 Content validation across profiles

Every generated profile is derived from the same already validated `CvBuildSpecV2`. Before accepting the chosen profile, the pipeline inspects the DOCX/PDF result using existing integrity assertions and verifies that canonical marker text, logical bullets, section order, and expected item counts are unchanged. A layout retry must never re-run AI or mutate evidence.

## 5. Render and preview pipeline

### 5.1 Components

The pipeline has four narrow boundaries:

1. `document-renderer-client`: sends a DOCX buffer to the private Gotenberg `/forms/libreoffice/convert` route and returns PDF bytes.
2. `pdf-preview`: uses the existing `unpdf` PDF.js integration plus `@napi-rs/canvas` to read actual page count and render page PNGs.
3. `validated-document`: applies layout profiles, coordinates conversion, enforces page policy, and returns a typed result.
4. `document-preview-repository`: claims conversions, persists immutable metadata, stores/retrieves private artifacts, and exposes owner-scoped reads.

The PDF returned by Gotenberg is the authoritative rendered version for pagination and preview. PNG pages are rasterisations of that PDF, not HTML approximations.

### 5.2 Immutable identity and cache key

Each preview is keyed by:

`sha256(docx bytes + renderer contract version + template render version)`

`GeneratedCvPreview.generatedCvId` is unique and `documentHash` is indexed with `userId`. A successful record is immutable and reused only for that owner-scoped generated document version when the hash matches; previews are never deduplicated across users. Artifact keys include the user ID, generated CV ID, hash, and page number:

```text
users/{userId}/{generatedCvId}/previews/{documentHash}/document.pdf
users/{userId}/{generatedCvId}/previews/{documentHash}/page-1.png
users/{userId}/{generatedCvId}/previews/{documentHash}/page-2.png
```

The DOCX remains at its current key. A new immutable generated CV version receives a new ID/hash and therefore cannot accidentally reuse stale artifacts. Template sample assets use a separate safe build-time namespace under `public/template-previews/{templateVersion}/` and never contain user data.

### 5.3 Conversion claims and duplicate prevention

`GeneratedCvPreview` has one row per generated CV. A compare-and-set transition claims `PENDING` or retryable `FAILED` work as `RENDERING`, records a lease expiry, and increments an attempt counter. Requests that encounter an unexpired `RENDERING` lease return an in-progress result rather than starting another conversion. An expired lease may be reclaimed. New generation uses the compare-and-set `CvGeneration` claim before a `GeneratedCV` row exists; the preview lease applies to legacy generation and thumbnail retries after that row exists.

The generation workflow also changes its status using a compare-and-set claim before provider/render work, covering the profile-only path that currently has no capability reservation. This preserves request idempotency without relying on process-local state.

Only an explicit document-version change changes the cache key. Listing Generated CVs never starts conversion. The browser may request a missing preview only after a legacy card enters the viewport, and it processes at most one legacy conversion at a time per page. The server-side lease prevents duplication across tabs or Vercel instances.

## 6. Persistence and states

Add a one-to-one `GeneratedCvPreview` record rather than adding artifact lifecycle fields to the content-heavy `GeneratedCV` table.

Required fields:

- `id`, `generatedCvId` (unique), and `userId`;
- `documentHash` (indexed with `userId`) and `rendererVersion`;
- `status`: `PENDING`, `RENDERING`, `READY`, or `FAILED`;
- `failureCode`: nullable stable enum value;
- `pageCount`: nullable integer, constrained in application code to one or two for `READY`;
- `pdfKey`, `pageImageKeys`, `pdfSize`, and `pageImageSizes`;
- `attemptCount`, `leaseExpiresAt`, `createdAt`, and `updatedAt`.

Generation/pagination failures remain on `CvGeneration.failureCode` and do not create a published `GeneratedCV`:

- `DOCUMENT_CONVERSION_FAILED`: Gotenberg rejected or could not convert the DOCX;
- `PAGE_VALIDATION_UNAVAILABLE`: PDF bytes could not be parsed or page count could not be established;
- `PAGE_LIMIT_EXCEEDED`: all bounded profiles rendered over two pages.

Preview failures belong to `GeneratedCvPreview.failureCode` after the DOCX and PDF have been validated:

- `THUMBNAIL_RENDER_FAILED`: one or more PNG pages could not be rasterised or stored;
- `PREVIEW_STORAGE_FAILED`: preview artifacts could not be durably stored;
- `PREVIEW_LEASE_EXPIRED`: an interrupted conversion may be safely reclaimed.

A new CV becomes `COMPLETED` only after DOCX→PDF conversion succeeds and the PDF proves one or two pages. PNG failure may still publish the valid DOCX/PDF with preview status `FAILED`; the library shows a retryable fallback and retains DOCX and authenticated PDF download. Quota is committed once for the valid generated CV, never for failed conversion/page validation.

## 7. Storage, access, and cleanup

PDFs and PNGs use the existing private `rewrites` bucket. No preview artifact receives a public object URL. Browser access goes through authenticated route handlers that:

- load the session;
- query by both generated CV ID and session user ID;
- return `404` for missing or cross-account records;
- stream the object with private cache headers and a narrow content type;
- never reveal an R2 key in a response payload.

Routes:

- `GET /api/cv/[id]/preview` returns status, verified page count, and owner-scoped application URLs;
- `POST /api/cv/[id]/preview` lazily claims a missing legacy preview or retries a recoverable thumbnail failure;
- `GET /api/cv/[id]/preview/pages/[page]` streams page one or two PNG;
- `GET /api/cv/[id]/pdf` downloads or opens the verified PDF;
- the existing `GET /api/cv/[id]/download` continues to serve DOCX.

The PDF route requires the same `download_generated_cv` capability as DOCX. Preview image routes require ownership but do not create a new commercial capability.

Account deletion enumerates and deletes PDF/PNG keys together with DOCX keys before deleting the user. A future generated-CV deletion flow must call the same preview cleanup service; this phase does not add a new deletion action because none currently exists. Partial cleanup failures remain retryable under the existing account-deletion contract.

## 8. Private Gotenberg deployment

### 8.1 Image and configuration

Use a custom image based on the pinned `gotenberg/gotenberg:8.37.0-libreoffice` image (pin the production digest after the first verified build). The image installs the exact Arial, Georgia, Times New Roman, and Trebuchet MS fonts used by templates, refreshes the font cache, and runs an image-level font verification script.

Local Docker Compose adds one renderer service on an internal Docker network. Production runs the same image as a small dedicated container service in the same region as Vercel/PostgreSQL/R2 where practical.

Initial limits for Align's small CV workload:

- one replica;
- 1 vCPU and 2 GiB RAM minimum;
- one active LibreOffice conversion per replica (Gotenberg's LibreOffice process is serial);
- `API_TIMEOUT=60s`;
- client abort timeout `65s`;
- `LIBREOFFICE_START_TIMEOUT=20s`;
- `LIBREOFFICE_MAX_QUEUE_SIZE=4`;
- `LIBREOFFICE_RESTART_AFTER=10`;
- request body limit `10MB`;
- Vercel generation/legacy-preview route `maxDuration=120` seconds;
- at most two attempts for retryable `500`/`503`/timeout failures with bounded jitter; no retry for deterministic `400` responses.

Scale to two replicas only when queue wait p95 exceeds 5 seconds or queue-full responses exceed 1% over 15 minutes. Do not raise the queue indefinitely; back-pressure is safer than allowing many CVs to occupy memory.

### 8.2 Network and authentication

Gotenberg must not be an anonymous public endpoint.

Preferred production exposure is private service networking reachable only through a protected application egress/gateway. If the hosting combination requires an Internet-reachable hostname, all of these controls are mandatory:

- TLS at the gateway;
- Gotenberg basic authentication or OIDC enabled with credentials stored only in server-side environment variables;
- gateway rate limiting and a request-size limit;
- only `/forms/libreoffice/convert` and an authenticated/monitor-only health route exposed;
- no Chromium, webhook, `downloadFrom`, or arbitrary PDF manipulation routes exposed by the gateway;
- credentials rotated on staff change or suspected exposure;
- renderer URL and credentials never use `NEXT_PUBLIC_` variables.

The client uploads bytes directly in multipart form. Gotenberg never receives a signed R2 URL, user ID, email, CV title, or source filename; the multipart filename is a constant `document.docx`. Correlation IDs use generation IDs only. Application and renderer logs must not contain request bodies, document text, rendered bytes, or storage keys.

### 8.3 Health and monitoring

Monitor `/health` from inside the protected boundary every 60 seconds and alert after five consecutive failures. Capture only operational telemetry:

- conversion count and duration (p50/p95/p99);
- queue depth/wait time and queue-full responses;
- `400`, retryable `500`, `503`, and client-timeout counts;
- container CPU, memory, OOM/restart count, and LibreOffice restart count;
- artifact upload latency and size;
- generation failure codes and preview failure codes, without CV contents.

Alert on health failure, any OOM, more than three container restarts in 15 minutes, conversion p95 above 30 seconds, or failure rate above 5% for 10 minutes. The application admin health surface may report renderer availability and last successful probe, but no document metadata.

### 8.4 Expected cost

At launch volume, one always-on 1 vCPU/2 GiB container is expected to cost approximately US$10–25 per month depending on provider and region. A protected gateway may add US$0–10 per month. R2 preview storage is expected to be below 2 MiB per two-page CV (PDF plus two PNGs); 1,000 CV versions therefore require roughly 2 GiB before provider compression/overhead. Vercel conversion orchestration adds function duration and egress but no LibreOffice binary cost.

These are planning estimates, not vendor commitments. Deployment documentation must record the selected provider's current price before launch and define a monthly alert at 150% of the expected renderer budget. A second replica roughly doubles container cost and is added only from observed queue metrics.

## 9. Microsoft Word and LibreOffice fidelity

LibreOffice PDF is the authority for Align's page-limit validation and previews because production must use a deterministic server renderer. Microsoft Word is not guaranteed to paginate every DOCX identically. Differences may arise from application versions, printer metrics, platform text shaping, or locally substituted fonts.

Mitigations:

- use the exact same named fonts in templates and Gotenberg;
- use A4 dimensions and explicit margins in OOXML;
- avoid floating objects, nested tables, and application-specific layout features;
- keep a small amount of natural bottom-page tolerance rather than targeting exact full-page occupancy;
- visually inspect representative DOCX files in current Microsoft Word as a release gate;
- document that the verified PDF is the exact validated/previewed rendering and offer it as an authenticated download.

The UI labels the PDF as “Verified PDF” and the DOCX as “Editable DOCX”; it does not claim pixel identity between applications.

## 10. Template carousel

The design step remains inside `CvGenerationWizard`, so navigating templates never remounts the wizard or resets evidence, plan, exclusions, or section order.

The carousel contains:

- one central A4 preview rendered from the safe sample CV;
- previous/next buttons with accessible labels;
- template name, purpose, and concise description;
- a horizontal thumbnail rail with a visible selected state;
- a “View larger preview” action;
- the existing primary approval/generation action.

Arrow Left/Right changes the selected template when focus is within the carousel. Home/End select the first/last template. Thumbnail buttons remain in normal tab order. Touch swipe uses a deliberate horizontal threshold and does not hijack vertical scrolling. Reduced-motion mode disables sliding and uses an immediate cross-fade/no-motion state. Selection is communicated with `aria-pressed`, text, border, and focus treatment rather than colour alone.

On mobile, the centre preview fills the available width without horizontal page overflow; controls remain at least 44 px. The thumbnail rail may scroll horizontally. The surface follows Align's paper/workspace visual language and reserves violet for selection/action.

## 11. Generated CV gallery and viewer

Each card shows:

- the actual first-page PNG when `READY`;
- title or target role, user-facing template name, creation date, generation status, and verified page count;
- a neutral placeholder for legacy/pending documents;
- a retry action for recoverable preview failures;
- Preview, Editable DOCX, and Verified PDF actions where available.

Images use `loading="lazy"`, explicit A4 aspect ratio, and responsive dimensions. Listing data contains preview metadata but never artifact bytes or storage keys. No conversion starts in the dashboard server query.

Opening Preview uses the existing modal pattern and displays exactly `pageCount` page images. It supports scrolling, previous/next page controls, zoom presets bounded for mobile, Escape/close, focus restoration, loading skeletons, and explicit failure states. One-page documents never render a second placeholder. Zoom changes the page scale inside a contained scroll region and does not make the overall mobile layout overflow.

Legacy cards request preview creation only after their card becomes visible and only while the page is active. The client limits itself to one outstanding legacy conversion; additional visible cards remain queued. Failures stop automatic retry and require a user action.

## 12. Error and recovery behaviour

| Condition | Published CV? | Charged? | User behaviour |
| --- | --- | --- | --- |
| Gotenberg rejects/cannot render DOCX | No | No | Generation shows conversion failure and retry guidance |
| PDF cannot be parsed/page-counted | No | No | Generation shows validation-unavailable failure |
| All profiles exceed two pages | No | No | User is told to shorten/review approved content; nothing is deleted |
| PDF verified, PNG rasterisation fails | Yes | Yes once | DOCX and PDF remain available; gallery shows retryable preview failure |
| Preview artifact upload fails | Yes if DOCX/PDF are durable and page count verified | Yes once | Download remains available; preview can be retried |
| Duplicate conversion request | At most one result | At most once | Later caller receives in-progress or cached result |
| Legacy CV cannot render | Existing record unchanged | No new charge | Existing DOCX download remains available with fallback card |

Errors exposed to users are stable, actionable messages. Internal logs carry only failure code, renderer status, duration, attempt number, and correlation ID.

## 13. Testing and validation

### 13.1 Unit and component tests

- Template metadata maps all four stable IDs to the new names and purposes.
- Each renderer keeps the same canonical content and approved order.
- Layout selection accepts preferred one/two-page renders and tightens only after overflow.
- Overflow returns `PAGE_LIMIT_EXCEEDED` with no omitted evidence.
- Conversion, page validation, page limit, and thumbnail failure states remain distinct.
- Hashing, cache reuse, lease claims, expiry, and retry transitions are deterministic.
- Owner isolation protects preview metadata, page images, PDF, and legacy conversion.
- Carousel arrows, thumbnails, keyboard, swipe, reduced motion, selection persistence, and plan preservation work.
- Gallery/viewer loading, exact page count, zoom, download links, fallbacks, focus, and mobile containment work.
- Account deletion includes every preview artifact.

### 13.2 Real-render integration tests

A Docker-gated integration suite starts the pinned custom Gotenberg image with verified fonts and renders short, medium, and overflow fixtures for every template. It asserts:

- short fixture: exactly one PDF page;
- medium fixture: exactly two PDF pages;
- overflow fixture: controlled failure after the bounded profiles;
- both page PNGs exist for two-page results and only page one exists for one-page results;
- extracted PDF text contains every expected canonical marker exactly once and in order;
- the bullet-regression fixture does not contain `refactor ing`, orphaned `join Prisma queries.`, or standalone `linting and real-device testing.`;
- repeated rendering of identical bytes reuses the same hash/artifacts and performs one conversion.

The suite must fail, not silently skip, in the dedicated renderer CI job. Ordinary unit-test jobs may exclude it when Docker is unavailable, but release validation requires the renderer job.

### 13.3 Release gates

- focused CV generation/template/preview tests;
- all existing bullet, extraction, truth/provenance, ownership, scoring, and entitlement regressions;
- Prisma validation and migration verification;
- TypeScript, ESLint, full Vitest suite, and production build;
- real Gotenberg render matrix for all four templates;
- Word inspection of one-page and two-page files for all four templates;
- desktop and mobile visual inspection of carousel, gallery, and viewer;
- authenticated cross-account route tests and private-bucket verification;
- renderer health, timeout, queue saturation, and recovery smoke tests.

## 14. Rollout and operations

1. Build and deploy the pinned renderer image; verify fonts, health, authentication, resource limits, and monitoring.
2. Apply the additive Prisma migration.
3. Deploy application code with renderer environment variables and feature availability derived from renderer health.
4. Generate and commit synthetic template preview assets from the production-equivalent renderer.
5. Run the real-render and Word inspection gates.
6. Enable new generation validation and previews together; there is no mode that publishes unvalidated new CVs.
7. Leave historical CVs untouched and generate their previews lazily as users encounter them.

If the renderer is unavailable at rollout, new generation returns a recoverable availability error and existing DOCX downloads continue to work. The system never falls back to estimated pagination or fabricated HTML previews.

## 15. Documentation sources

- [Gotenberg LibreOffice conversion](https://gotenberg.dev/docs/convert-with-libreoffice/convert-to-pdf)
- [Gotenberg configuration and LibreOffice queue behaviour](https://gotenberg.dev/docs/configuration)
- [Gotenberg 8.37.0 release](https://github.com/gotenberg/gotenberg/releases/tag/v8.37.0)
- [Vercel function runtimes and filesystem limits](https://vercel.com/docs/functions/runtimes)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
