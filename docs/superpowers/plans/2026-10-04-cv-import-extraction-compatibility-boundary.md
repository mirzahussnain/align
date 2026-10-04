# CV Import/Extraction Compatibility Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both legacy PDF paths with `unjs/unpdf`, make structured Mammoth HTML the DOCX authority, and interpret both through an internal `NormalizedDocument` while fixing the confirmed CV import defects without changing downstream contracts.

**Architecture:** Thin PDF and DOCX adapters recover provider-specific structure into transient normalized blocks. A deterministic block-aware CV interpreter owns sections, local entity groups, ownership, confidence, and review issues, then projects back to the existing `CvExtractionResult`, `CvExtractionPayload`, and import pipeline. Existing skill reconciliation and canonical upserts stay authoritative and change only under failing regression tests.

**Tech Stack:** TypeScript, Next.js 16.2.6 Node runtime, `unpdf` 1.8.x (`unjs/unpdf`), Mammoth 1.12.x, `node-html-parser`, Zod 4, Prisma 7, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-04-cv-import-extraction-compatibility-boundary-design.md`

## Global Constraints

- Use `unjs/unpdf`; do not install or reference `@iyulab/unpdf`, `pdf-parse`, or a second PDF parser.
- `NormalizedDocument` is internal and transient: do not persist it or expose it through an API.
- Preserve `CvExtractionResult`, `CvExtractionPayload`, entity DTOs, stored `structuredData`, and `CvImportCandidate`; optional review diagnostics must be additive and older schema versions remain readable.
- DOCX canonical body content comes from `mammoth.convertToHtml()`; OOXML inspection is supplemental only for headers, footers, text boxes, and field-code links.
- Parsing and interpretation remain deterministic and add no AI calls.
- Do not edit CV Generation V2, Job Match, AI providers/orchestration, token budgets, templates/renderers, section-order behavior, or entitlements.
- Do not use occupation, employer, technology, project-name, or user-specific dictionaries to infer structure.
- Preserve the existing 10 MB upload byte limit; add `MAX_PDF_PAGES = 100`, `PDF_PARSE_TIMEOUT_MS = 15_000`, and PDF.js `maxImageSize = 16_777_216`.
- Map corrupt/password-protected documents to `CORRUPT_DOCUMENT`, time/page-limit failures to `EXTRACTOR_FAILED`, and usable-text absence to existing `EMPTY_TEXT`; never return raw parser errors or log document content.
- The `unpdf` serverless proxy lifecycle uses `cleanup()` when available; do not port the `pdf-parse` worker/`destroy()` pattern.
- Work test-first, keep commits scoped to the task that their tests prove, and stop if implementation would require CV Generation V2 changes.

## Review Focus

- A PDF with visually aligned sidebar/body text but interleaved content-stream order must retain separate columns and never merge skills into experience; Task 2 adds this fixture and assertion.
- A DOCX whose body uses lists/tables while contact data lives in a header or text box must retain both without parsing `word/document.xml` body twice; Task 3 adds this assertion.
- A date in a right-aligned block or table cell must attach only inside its local experience group; Task 5 covers detached and ambiguous dates.
- A project metadata row followed by achievements must stay with its active project across software, marketing, and research wording; Task 6 covers all three.
- A duplicate skill first encountered as project metadata must later accept a specific Skills-section category without creating a row or category downgrade; Task 7 covers both candidate reconciliation and persistence.

---

## File Structure

**New document boundary**

- `src/shared/services/cv-extraction/document/types.ts`: provider-neutral block/document types and invariants.
- `src/shared/services/cv-extraction/document/projection.ts`: normalized plain-text projection and block-to-line provenance map.
- `src/shared/services/cv-extraction/document/pdf-layout.ts`: page-local line grouping, conservative column detection, and annotation/block overlap.
- `src/shared/services/cv-extraction/document/docx-html.ts`: safe Mammoth HTML-to-block conversion.

**Provider adapters**

- `src/shared/services/cv-extraction/pdf.ts`: `unpdf` proxy, limits, text items, annotations/forms, and normalized PDF output.
- `src/shared/services/cv-extraction/docx.ts`: Mammoth conversion plus supplemental normalized blocks.
- `src/shared/services/cv-extraction/docx-parts.ts`: only non-body OOXML surfaces.

**CV interpretation**

- `src/shared/services/cv-extraction/interpreter/types.ts`: section/group/issue intermediate types.
- `src/shared/services/cv-extraction/interpreter/sections.ts`: block-aware known/unknown section detection.
- `src/shared/services/cv-extraction/interpreter/grouping.ts`: layout-stream and active-entity boundaries.
- `src/shared/services/cv-extraction/interpreter/experience.ts`: experience/education/volunteering dated groups.
- `src/shared/services/cv-extraction/interpreter/projects.ts`: project identities, metadata, detail/link ownership.
- `src/shared/services/cv-extraction/interpreter/skills.ts`: source-category extraction and atomic tokenization.
- `src/shared/services/cv-extraction/interpreter/index.ts`: identity/summary/remaining readers and compatibility payload assembly.
- `src/shared/services/cv-extraction/structured.ts`: compatibility wrapper only; no production raw-text interpretation.

**Fixtures/tests**

- Extend `src/shared/services/cv-extraction/__tests__/fixtures.ts` with generated single/two-column, table, parity, and production-regression binaries.
- Add the byte-identical supplied production regression PDF at `src/shared/services/cv-extraction/__tests__/fixtures/Hussnain_Ali_CV_Finalv2.pdf`; tests may assert its content, but production code must contain no fixture-specific names or grammar.
- Add `src/shared/services/cv-extraction/__tests__/document-adapters.test.ts` and `interpreter.test.ts`.
- Extend existing extraction, link/contact, import candidate, canonical skill, integration, onboarding review, and analyze-route suites.

## Task 1: Provider-Neutral Document Contract and Compatibility Projection

**Files:**
- Create: `src/shared/services/cv-extraction/document/types.ts`
- Create: `src/shared/services/cv-extraction/document/projection.ts`
- Create: `src/shared/services/cv-extraction/__tests__/normalized-document.test.ts`
- Modify: `src/shared/services/cv-extraction/index.ts`

**Interfaces:**
- Produces: `NormalizedDocument`, `NormalizedDocumentBlock`, `NormalizedDocumentKind`, `DocumentProjection`.
- Produces: `projectNormalizedDocument(document: NormalizedDocument): DocumentProjection`, where `DocumentProjection` is `{ text: string; lineByBlockId: Map<string, number>; links: ExtractedLink[] }`.
- Invariant: deterministic IDs/orders, one normalized text line per nonempty block, and block-local links retain page/block provenance.

- [ ] **Step 1: Write failing contract tests**

Assert that mixed heading/bullet/table/link blocks project in deterministic order; Unicode is NFKC-normalized; whitespace collapses without splitting `API/Integration Testing` or `CI/CD`; repeated projection is byte-identical; and block IDs map to stable zero-based lines.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/normalized-document.test.ts`

Expected: FAIL because the document types/projection do not exist.

- [ ] **Step 3: Implement the minimal model and projection**

Keep parser/provider concerns out of these files. Convert block links to existing `ExtractedLink` records without assigning CV sections or entities.

- [ ] **Step 4: Route extraction orchestration through a normalized-document extractor type**

In `index.ts`, define internal `DocumentExtractor = (bytes: Buffer) => Promise<NormalizedDocument>` while keeping the public `CvExtractionResult` shape unchanged; production interpretation wiring remains for Task 4.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/normalized-document.test.ts src/shared/services/cv-extraction/__tests__/extraction.test.ts`

Expected: PASS.

Commit: `feat(cv): add normalized document boundary`

## Task 2: `unjs/unpdf` Adapter and Conservative PDF Layout

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/shared/services/cv-extraction/document/pdf-layout.ts`
- Rewrite: `src/shared/services/cv-extraction/pdf.ts`
- Modify: `src/shared/services/cv-extraction/pdf-forms.ts`
- Create: `src/shared/services/cv-extraction/__tests__/document-adapters.test.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/fixtures.ts`

**Interfaces:**
- Produces: `extractPdfDocument(bytes: Buffer): Promise<NormalizedDocument>`.
- Produces: `groupPdfPageItems(items, page): NormalizedDocumentBlock[]`, `detectColumns(blocks): NormalizedDocumentBlock[]`, and `attachPdfAnnotations(blocks, annotations): NormalizedDocumentBlock[]`.
- Consumes: `unpdf.getDocumentProxy`, `extractTextItems`, and proxy page annotations; calls `proxy.cleanup()` in `finally` when present.

- [ ] **Step 1: Add failing binary adapter tests**

Add generated fixtures and assertions for: page/coordinate/font/direction preservation; exact single-column order; stable two-column bands despite interleaved content-stream order; annotation target plus rectangle attachment; unplaced page link preservation; compound tokens unchanged; corrupt PDF mapping; raster-only empty blocks; 101-page rejection; and timeout mapping using mocked `unpdf` calls.

- [ ] **Step 2: Run the adapter test and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/document-adapters.test.ts`

Expected: FAIL on missing `extractPdfDocument` and legacy `pdf-parse` behavior.

- [ ] **Step 3: Replace the dependency**

Run: `npm install unpdf@^1.8.1`

Do not remove `pdf-parse` yet; Task 9 removes it after both call paths migrate.

- [ ] **Step 4: Implement page-local line grouping**

Use `hasEOL` as a hard boundary. Otherwise group items only when vertical centers differ by no more than `max(2, 0.35 * maxFontSize)` points and horizontal progression does not jump across a stable gutter. Preserve the union bounding box and maximum representative font size.

- [ ] **Step 5: Implement conservative column detection**

Assign columns only when two non-overlapping x bands each contain at least four body lines, a gutter of at least 36 points persists across at least 70% of their shared vertical span, and neither band is merely a date-aligned tail. Full-width headings remain outside columns. If these conditions fail, omit `layout.column`.

- [ ] **Step 6: Implement annotation/form enrichment and safeguards**

Attach a URL only by rectangle overlap on the same page. Keep page-scoped unplaced links as `link` blocks. Reuse form reading through the resolved `unpdf`/PDF.js boundary only when form values are absent from text items. Enforce the global constants and map errors without document content in logs.

- [ ] **Step 7: Run focused extraction tests and commit**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/document-adapters.test.ts src/shared/services/cv-extraction/__tests__/links-and-contact.test.ts`

Expected: PASS.

Commit: `feat(cv): ingest PDFs through unpdf blocks`

## Task 3: Structured Mammoth Adapter and Supplemental OOXML Boundary

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/shared/services/cv-extraction/document/docx-html.ts`
- Rewrite: `src/shared/services/cv-extraction/docx.ts`
- Modify: `src/shared/services/cv-extraction/docx-parts.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/document-adapters.test.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/fixtures.ts`

**Interfaces:**
- Produces: `extractDocxDocument(bytes: Buffer): Promise<NormalizedDocument>`.
- Produces: `blocksFromMammothHtml(html: string): NormalizedDocumentBlock[]`.
- Produces from `docx-parts.ts`: supplemental header/footer/text-box blocks and exact field-link associations; never ordinary body blocks.

- [ ] **Step 1: Add failing DOCX structure tests**

Assert headings/levels, paragraphs, nested ordered/unordered lists, table row/column cells, hyperlinks, whole-block bold/italic, and body order from `convertToHtml`; assert headers, footers, text boxes, and field-code links survive as supplemental blocks; assert an ordinary body paragraph appears once; assert malformed ZIP maps safely.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/document-adapters.test.ts -t DOCX`

Expected: FAIL because raw text remains canonical and structured blocks do not exist.

- [ ] **Step 3: Add the HTML parser dependency and implement conversion**

Run: `npm install node-html-parser`

Call `mammoth.convertToHtml({ buffer }, { externalFileAccess: false })` once. Walk only the generated fragment; ignore images/scripts; never persist or render HTML.

- [ ] **Step 4: Constrain supplemental inspection**

Return normalized supplemental blocks directly. Remove ordinary-body text extraction from manual OOXML logic; keep only text boxes and field-code links from `word/document.xml`, plus separate header/footer parts.

- [ ] **Step 5: Run DOCX/link regression tests and commit**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/document-adapters.test.ts src/shared/services/cv-extraction/__tests__/links-and-contact.test.ts`

Expected: PASS with no duplicate body blocks.

Commit: `feat(cv): normalize structured DOCX content`

## Task 4: Block-Aware Sections, Grouping, and Compatibility Interpreter

**Files:**
- Create: `src/shared/services/cv-extraction/interpreter/types.ts`
- Create: `src/shared/services/cv-extraction/interpreter/sections.ts`
- Create: `src/shared/services/cv-extraction/interpreter/grouping.ts`
- Create: `src/shared/services/cv-extraction/interpreter/index.ts`
- Modify: `src/shared/services/cv-extraction/sections.ts`
- Modify: `src/shared/services/cv-extraction/structured.ts`
- Modify: `src/shared/services/cv-extraction/index.ts`
- Create: `src/shared/services/cv-extraction/__tests__/interpreter.test.ts`

**Interfaces:**
- Produces: `interpretCvDocument(document: NormalizedDocument): CvInterpretationResult`.
- `CvInterpretationResult` is `{ payload: CvExtractionPayload; issues: CvInterpretationIssue[] }`.
- Produces: `sectionDocument(document): InterpretedSection[]` and `groupSectionBlocks(section): LocalBlockGroup[]`.
- Keeps: `parseCvStructure(text, links)` only as a compatibility test wrapper that constructs paragraph blocks and delegates.

- [ ] **Step 1: Add failing section/group tests**

Cover every specified alias, structural alias support, repeated headings, unknown styled sections, no substring-in-prose headings, two-column stream isolation, table-cell grouping, and hard resets at section/peer boundaries.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts -t 'sections|groups'`

Expected: FAIL on missing block-aware interpreter.

- [ ] **Step 3: Implement section and group intermediates**

Define issue codes exactly as the spec. Preserve unknown section blocks and never use global nearest/first/last ownership. Port identity, contact, summary, education, credentials, training, language, volunteering, and other-evidence readers to block/group inputs without changing payload field semantics.

- [ ] **Step 4: Switch production orchestration to the interpreter**

`extractStoredCv` must call the format adapter, project normalized text once, call `interpretCvDocument(document)`, validate the existing payload, bump `CV_PARSER_VERSION`, and return the unchanged public result shape.

- [ ] **Step 5: Run current extraction suite and commit**

Run: `npx vitest run src/shared/services/cv-extraction`

Expected: PASS, including stored schema-version readability.

Commit: `refactor(cv): interpret normalized document blocks`

## Task 5: Structural Experience and Date Ownership

**Files:**
- Create: `src/shared/services/cv-extraction/interpreter/experience.ts`
- Modify: `src/shared/services/cv-extraction/dates.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/interpreter.test.ts`

**Interfaces:**
- Produces: `readExperienceSections(sections): { entries: ExtractedExperience[]; issues: CvInterpretationIssue[] }`.
- Reuses: `findDateRange`, extended to return exact source spans without changing `YYYY`/`YYYY-MM` outputs.

- [ ] **Step 1: Add failing layout matrix tests**

Assert role-first inline, employer-first three-block, dates-first pipe-delimited, employer/location plus separate date, title/employer plus next-block date, and table-row forms. Pin the supplied CV's three exact roles/employers/dates/current values and zero review issues for employer/start/end/current.

- [ ] **Step 2: Add uncertainty tests**

Assert missing end does not imply current; an unowned date yields `AMBIGUOUS_DATE_OWNERSHIP`; an equally plausible title/employer split yields `AMBIGUOUS_EXPERIENCE_HEADER` and does not fabricate a required field.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts -t experience`

Expected: FAIL on employer/title/date relationships.

- [ ] **Step 4: Implement local-pattern experience resolution**

Strip dates before delimiter parsing. Use same-group block kind/style/table position and repeated sibling patterns; never use occupation/employer vocabularies or source-order tie-breaking.

- [ ] **Step 5: Run focused tests and commit**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts -t 'experience|date'`

Expected: PASS.

Commit: `fix(cv): resolve structural experience headings`

## Task 6: Project Identity, Metadata, and Detail Ownership

**Files:**
- Create: `src/shared/services/cv-extraction/interpreter/projects.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/interpreter.test.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/links-and-contact.test.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/fixtures.ts`

**Interfaces:**
- Produces: `readProjectSections(sections): { projects: ExtractedProject[]; skillRepresentations: ExtractedSkill[]; issues: CvInterpretationIssue[] }`.
- Owns project-local block IDs until the next peer project boundary.

- [ ] **Step 1: Add failing production regression assertions**

Run the supplied CV bytes through the full adapter/interpreter. Assert exactly three projects named Bhejo, Kinetix, and Align; no `Next.js` project; each technology/detail row and every achievement remains on its source project; links attach by containing block/rectangle.

- [ ] **Step 2: Add domain-general structural tests**

Repeat the heading → delimiter metadata → bullets pattern for marketing, research, and operations wording. Add embedded-in-experience projects, heading-with-date, heading-with-live/repo, and ambiguous cross-column detail cases. Ambiguity must emit `AMBIGUOUS_ENTITY_OWNERSHIP` and attach to no project.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts -t project`

Expected: FAIL with a fake metadata project or incorrect ownership.

- [ ] **Step 4: Implement active-project boundaries**

Require independent identity evidence for a new project. Treat a short delimiter row as metadata only when it lacks its own dates/project URLs/peer style and is locally followed by subordinate details. Remove technology-name heuristics and redundant-project suppression as the primary fix.

- [ ] **Step 5: Run project/link tests and commit**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts src/shared/services/cv-extraction/__tests__/links-and-contact.test.ts`

Expected: PASS.

Commit: `fix(cv): preserve project detail ownership`

## Task 7: Skill Extraction, Reconciliation, and Idempotent Persistence

**Files:**
- Create: `src/shared/services/cv-extraction/interpreter/skills.ts`
- Modify: `src/shared/services/cv-import/candidates.ts`
- Modify: `src/shared/services/cv-import/canonical.ts`
- Modify: `src/shared/services/cv-extraction/__tests__/interpreter.test.ts`
- Modify: `src/shared/services/cv-import/__tests__/candidates.test.ts`
- Modify: `src/shared/services/cv-import/__tests__/canonical-skills.test.ts`
- Modify: `src/shared/services/cv-import/__tests__/import-pipeline.integration.test.ts`

**Interfaces:**
- Produces: `readSkillSections(sections, projectRepresentations): ExtractedSkill[]`, preserving every source representation.
- Keeps: `resolveSkillCategory(input)` authority and `profileId_normalizedName` upserts.

- [ ] **Step 1: Add failing tokenization and category tests**

Assert `API/Integration Testing`, `CI/CD`, and `OAuth/OIDC` remain atomic; comma/middle-dot/list/cell separators split; explicit and unknown categories survive; `Additional`/`Additional Skills` map consistently; and project metadata plus Skills-section occurrences remain available until reconciliation.

- [ ] **Step 2: Add reconciliation/persistence tests**

Assert specific beats Additional regardless of order; existing profile category beats extraction; taxonomy category beats extracted categories when supplied; conflicting specific categories produce one `CONFLICTING_SKILL_CATEGORY` row; project-first then skill import yields one canonical row with the specific category; repeat confirmation produces no unique error or duplicate row.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/interpreter.test.ts -t skill src/shared/services/cv-import/__tests__/candidates.test.ts src/shared/services/cv-import/__tests__/canonical-skills.test.ts`

Expected: at least tokenization/project-category-order regressions fail.

- [ ] **Step 4: Implement minimal proven changes**

Never split on `/`. Keep `candidates.ts` grouping by normalized identity and change only missing taxonomy/project representation plumbing proven by tests. In `canonical.ts`, allow a confirmed specific skill candidate to upgrade an uncategorized/Additional project-created row, but never overwrite another specific or existing user-confirmed category.

- [ ] **Step 5: Run import tests and commit**

Run: `npx vitest run src/shared/services/cv-import src/shared/services/cv-extraction/__tests__/interpreter.test.ts`

Expected: PASS.

Commit: `fix(cv): reconcile imported skill identities`

## Task 8: Review-Safe Ambiguity Projection

**Files:**
- Modify: `src/shared/services/cv-extraction/types.ts`
- Modify: `src/shared/services/cv-extraction/interpreter/index.ts`
- Modify: `src/shared/services/cv-import/candidates.ts`
- Modify: `src/features/onboarding/components/ImportReviewStep.tsx`
- Modify: `src/features/onboarding/components/__tests__/import-review-personal.test.tsx`
- Modify: `src/shared/services/cv-import/__tests__/candidates.test.ts`

**Interfaces:**
- Add optional `reviewIssues` to `CvExtractionPayload` and advance schema version while keeping versions 1/2 readable.
- Map entity-bound issues to existing `AMBIGUOUS_VALUE` candidates with reduced confidence.
- Map genuinely unowned preserved text to an `OTHER_EVIDENCE` review-only candidate with `AMBIGUOUS_VALUE`, never bulk-confirmed and never persisted unless explicitly edited/confirmed by the user.

- [ ] **Step 1: Add failing schema and candidate tests**

Assert old stored payloads still parse; issues round-trip; entity-bound issues conflict the correct candidate; unowned content appears once with its verbatim excerpt and candidate owner choices; and no issue silently chooses a project/date/category.

- [ ] **Step 2: Add review UI tests**

Assert one compact row per logical skill, editable category, conflict copy for specific-category disputes, and an ambiguity card that requires an individual decision. Existing profile category editing must remain functional.

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run src/shared/services/cv-import/__tests__/candidates.test.ts src/features/onboarding/components/__tests__/import-review-personal.test.tsx`

Expected: FAIL on missing review diagnostics.

- [ ] **Step 4: Implement additive diagnostics and UI projection**

Do not add a Prisma table or enum. Keep issue codes inside structured extraction data and reuse the existing candidate conflict/status fields.

- [ ] **Step 5: Run review/import tests and commit**

Run: `npx vitest run src/shared/services/cv-import src/features/onboarding/components/__tests__/import-review-personal.test.tsx`

Expected: PASS.

Commit: `feat(cv): surface ambiguous import structure`

## Task 9: Migrate Analyze Path and Remove Legacy PDF Parser

**Files:**
- Modify or delete: `src/shared/utils/pdf-parser.ts`
- Modify: `src/app/api/analyze/detect/route.ts`
- Modify: `src/app/api/analyze/__tests__/detect.test.ts`
- Modify: `next.config.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Analyze consumes `extractPdfDocument(bytes)` plus `projectNormalizedDocument(document)` from the shared adapter boundary.
- No application module imports `pdf-parse`, `pdf-parse/worker`, or direct `pdfjs-dist` as a competing parser.

- [ ] **Step 1: Change the route test to mock the shared adapter**

Add an assertion that a `File` is converted once to bytes and the shared adapter/projection supply detection text; keep existing occupation/mismatch behavior unchanged.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/app/api/analyze/__tests__/detect.test.ts`

Expected: FAIL while the route imports the legacy wrapper.

- [ ] **Step 3: Migrate the route and remove obsolete packages/config**

Remove `pdf-parse`, `@types/pdf-parse`, and the `serverExternalPackages: ['pdf-parse']` entry. Remove direct `pdfjs-dist` only if `npm ls` proves it is no longer a direct requirement; `unpdf` remains the sole PDF adapter even if PDF.js exists transitively.

- [ ] **Step 4: Prove the repository contains no legacy parser**

Run: `rg -n "pdf-parse|pdf-parse/worker|extractTextFromPDF" src package.json next.config.ts`

Expected: no production matches.

- [ ] **Step 5: Run analyze/extraction tests and commit**

Run: `npx vitest run src/app/api/analyze src/shared/services/cv-extraction`

Expected: PASS.

Commit: `refactor(cv): consolidate PDF ingestion`

## Task 10: Cross-Domain, Cross-Template, and PDF/DOCX Parity Matrix

**Files:**
- Modify: `src/shared/services/cv-extraction/__tests__/fixtures.ts`
- Create: `src/shared/services/cv-extraction/__tests__/fixtures/Hussnain_Ali_CV_Finalv2.pdf`
- Create: `src/shared/services/cv-extraction/__tests__/acceptance-matrix.test.ts`
- Modify: `src/shared/services/cv-import/__tests__/import-pipeline.integration.test.ts`

**Interfaces:**
- Uses only public extraction/import functions and generated binary fixtures.
- Produces an assertion/report helper summarizing detected sections, counts, relationships, categories, fake entities, duplicate skills, review issues, and destructive guesses.

- [ ] **Step 1: Add the production-shaped acceptance fixture**

Use the supplied PDF as test input without embedding user-specific grammar. Assert 3 experiences with the exact stated employer/title/date/current values and zero required-field review; 2 education records; exactly Bhejo/Kinetix/Align; zero fake projects; correct project details; atomic compounds; explicit categories; and zero duplicate logical skills.

- [ ] **Step 2: Add cross-domain normalized fixtures**

Healthcare, marketing, academic/research, finance, administration/retail, operations/public-sector, graduate, and executive fixtures must verify section detection, non-software experience layouts, metadata ownership, category preservation, unknown publications-like section safety, and zero software-specific assumptions. Keep these fixtures compact and vary their labels, separators, and ordering so they test structure rather than vocabulary.

- [ ] **Step 3: Add cross-template fixtures**

Cover single-column, two-column/sidebar, employer-first, title-first, separate-date, table-heavy DOCX, sidebar/table skills, and flat skills. Assert zero cross-column or cross-entity attachment.

- [ ] **Step 4: Add equivalent PDF/DOCX parity pair**

Assert equal experience, education, and project counts; equal title/employer/date relationships; equal normalized skill identities/category intent; allow only low-level layout metadata differences.

- [ ] **Step 5: Run matrix and import integration tests**

Run: `npx vitest run src/shared/services/cv-extraction/__tests__/acceptance-matrix.test.ts src/shared/services/cv-import/__tests__/import-pipeline.integration.test.ts`

Expected: PASS with destructive guesses equal to zero for every fixture.

- [ ] **Step 6: Commit**

Commit: `test(cv): cover import extraction matrix`

## Task 11: Full Verification and Acceptance Report

**Files:**
- Modify only files required by failures introduced by Tasks 1–10; do not expand scope.

**Interfaces:**
- Produces final evidence for the user-requested acceptance report.

- [ ] **Step 1: Run focused suites**

Run: `npx vitest run src/shared/services/cv-extraction src/shared/services/cv-import src/app/api/analyze src/features/onboarding/components/__tests__/import-review-personal.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run the relevant full suite**

Run: `npm test`

Expected: PASS; if unrelated pre-existing failures exist, record exact tests and prove they reproduce outside this diff.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: both PASS.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: Next.js 16.2.6 production build PASS with the `unpdf` server-only path bundled correctly.

- [ ] **Step 5: Run repository hygiene checks**

Run: `git diff --check`

Run: `rg -n "@iyulab/unpdf|pdf-parse|pdf-parse/worker" src package.json package-lock.json next.config.ts`

Expected: no whitespace errors; no forbidden parser references except historical migration text if intentionally retained outside production.

- [ ] **Step 6: Review scope and produce the acceptance report**

Confirm `git diff --name-only` contains no CV Generation V2, Job Match, AI orchestration/provider, entitlement, renderer/template, or section-order files. Report architecture paths, retained structure, scanned/corrupt behavior, production fixture results, reconciliation/idempotency, domain/template matrix, parity differences, every verification command, and any residual limitation.

- [ ] **Step 7: Commit final verification-only fixes if needed**

Commit: `chore(cv): complete extraction verification`
