# CV Import/Extraction Compatibility-Boundary Design

Date: 2026-10-04

Status: Approved architecture; implementation pending

## 1. Scope and outcome

This change replaces low-level PDF ingestion with `unpdf`, makes Mammoth's structured HTML the canonical DOCX body, and introduces one internal `NormalizedDocument` boundary consumed by deterministic CV interpretation. The interpreter will fix the confirmed experience, project, skill, ownership, and review-safety defects while preserving the current downstream contracts.

The boundary is deliberately internal. `NormalizedDocument` is neither persisted nor exposed through an API. `CvExtractionResult`, `CvExtractionPayload`, its entity DTOs, stored `structuredData`, and `CvImportCandidate` remain the compatibility surface. Additive optional diagnostic fields are allowed only if implementation proves they are necessary to carry review-safe ambiguity; no new public endpoint shape, table, or generic document framework is planned.

Out of scope: CV Generation V2, Job Match, AI providers/orchestration, token budgets, renderers/templates, section ordering, entitlements, OCR, and new AI calls.

## 2. Existing boundary being replaced

The stored-CV path currently calls `pdf-parse` or `mammoth.extractRawText`, normalises both formats into a flat string, and calls `parseCvStructure(text, links)`. A separate analyze route calls another `pdf-parse` wrapper in `src/shared/utils/pdf-parser.ts`. DOCX body links are recovered through a second Mammoth HTML pass, while manual OOXML inspection supplies headers, footers, text boxes, and field-code links.

Flattening occurs before section and entity interpretation. PDF item geometry, page-local grouping, and columns disappear; DOCX heading, paragraph, list, table, emphasis, and nesting semantics disappear. Line indexes consequently carry both provenance and ownership, encouraging proximity-based association.

The target replaces this with:

```text
PDF bytes  -> unpdf adapter   --\
                                -> NormalizedDocument -> CV interpreter
DOCX bytes -> Mammoth adapter --/                       -> compatibility projection
                                                         -> existing DTO/import pipeline
```

## A. NormalizedDocument types and invariants

The model will live under `src/shared/services/cv-extraction/document/`, with no dependency on CV sections, entities, import types, Prisma, or UI types.

```ts
type NormalizedDocument = {
  sourceType: 'pdf' | 'docx';
  blocks: NormalizedDocumentBlock[];
  pageCount: number | null;
};

type NormalizedDocumentBlock = {
  id: string;
  order: number;
  text: string;
  kind: 'heading' | 'paragraph' | 'bullet' | 'table-cell' | 'link' | 'unknown';
  page?: number;
  parentId?: string;
  list?: { level: number; ordered: boolean };
  table?: { table: number; row: number; column: number };
  layout?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    column?: number;
  };
  style?: {
    bold?: boolean;
    italic?: boolean;
    fontSize?: number;
    headingLevel?: number;
  };
  links?: string[];
};
```

Invariants:

- `id` is deterministic within an extraction, using source type plus page/structural order rather than random IDs.
- `order` is unique, zero-based, and expresses the adapter's best document reading order. It is not itself evidence of semantic ownership.
- `text` is Unicode-normalised, whitespace-cleaned visible text; empty blocks are omitted.
- Blocks remain atomic at the strongest structure exposed by the provider: a PDF line/group, a DOCX paragraph/list item/table cell, or a supplemental package paragraph.
- Page numbers are one-based. PDF coordinates retain PDF origin semantics and are documented at the adapter boundary.
- Optional metadata is emitted only when the parser provides reliable evidence. Missing style/layout is not inferred.
- Links are normalised and attached to their containing block where possible. Unplaced document links remain recoverable as link blocks rather than being assigned to a nearby entity.
- The model contains document facts only. It has no `section`, `employer`, `project`, `skillCategory`, confidence, or canonical IDs.
- A single projection helper creates stable normalized plain text and a block-to-line map for existing text/provenance consumers. Interpretation does not round-trip through that string.

## B. `unpdf` adapter

`src/shared/services/cv-extraction/pdf.ts` becomes a thin adapter using one `getDocumentProxy` per file. It will check `numPages` before page-fan-out and obtain positioned content with `extractTextItems`. `unpdf` exposes page-separated items containing text, x/y, width/height, font size/family, direction, and end-of-line information; these are sufficient for deterministic line grouping without implementing PDF internals.

The adapter will:

1. create the proxy from the validated bytes;
2. enforce a bounded page count and parsing timeout, and set a finite PDF image resource limit even though images are not extracted;
3. group items into page-local lines using `hasEOL`, y-coordinate tolerance relative to font size, and x-order within a line;
4. preserve the union bounding box and representative font size for each line block;
5. detect simple columns only when stable x bands recur across enough blocks; otherwise omit `column` rather than guess;
6. produce reading order per page by column band, then vertical position, then x position, without interleaving a stable sidebar and body column;
7. recover links through `unpdf`/its resolved PDF.js proxy, retaining annotation page/rectangle when available so a link can be attached by geometric overlap; an unplaced link remains a page-scoped link block;
8. keep the existing AcroForm supplement only if `unpdf`/PDF.js does not expose the filled values through the main text items, converting values into leading normalized blocks;
9. classify parser/password/damage failures as `CORRUPT_DOCUMENT`, and effectively textless output as the existing `EMPTY_TEXT` scanned-document state.

No alternative PDF text parser remains. Direct PDF.js access, if required for annotation rectangles or form values, is obtained from the proxy/resolved module exposed through `unpdf`, not imported as a competing parser.

Security follows the library's guidance for untrusted PDFs: pre-existing byte limits remain, page count and image allocation are bounded before extraction fan-out, and extraction is raced against a timeout. Parser messages are logged without document content and never returned to the client.

## C. Mammoth adapter

`src/shared/services/cv-extraction/docx.ts` will call `mammoth.convertToHtml({ buffer })` once for the canonical body. `extractRawText` will no longer define body content. Mammoth's default semantic mapping provides headings, paragraphs, lists, tables, hyperlinks, bold, and emphasis; a small explicit style map may map common named section-title styles to headings without embedding CV vocabulary.

The generated HTML fragment is parsed server-side without rendering or executing it. The converter walks DOM structure in order and emits:

- `h1`-`h6` as heading blocks with `headingLevel`;
- `p` as paragraph blocks;
- `li` as bullet blocks with list depth and ordered/unordered state;
- `td`/`th` content as table-cell blocks with table/row/column coordinates;
- anchor URLs on their containing block, with a standalone link block only when an anchor has no usable containing text;
- aggregate bold/italic flags only when the whole meaningful block carries that emphasis; mixed inline emphasis is not over-modelled.

Images are ignored and are not embedded in the intermediate representation. Mammoth warnings are recorded in server logs without raw document content. Because Mammoth does not sanitize output, HTML is treated purely as parser output: no HTML is persisted, returned, or injected into the UI, scripts and active content are ignored, and external file access remains disabled.

## D. Supplemental DOCX package-inspection boundary

`docx-parts.ts` remains narrowly responsible for content Mammoth demonstrably does not expose: headers, footers, text boxes/shapes, and field-code hyperlinks. It must not parse ordinary `word/document.xml` body paragraphs as a second canonical body.

Supplemental output changes from free text/line matches to normalized block inputs with explicit origin metadata internal to the adapter. Header blocks precede the body, footer blocks follow it, and text-box blocks retain package order plus a conservative grouping marker. Field-code links are attached only by an exact containing-paragraph identity established within the same OOXML part; ambiguous matches remain standalone link blocks.

The supplement may inspect relationships and the relevant XML parts, but it will not classify headings, sections, CV entities, or skills. Malformed package/XML failures are mapped to `CORRUPT_DOCUMENT` when the canonical body cannot be read; optional supplement failure logs and degrades only when Mammoth produced a usable body.

## E. CV interpreter responsibilities

The CV-specific layer begins at `interpretCvDocument(document)` under `src/shared/services/cv-extraction/interpreter/`. It owns:

- section detection and aliases;
- local block grouping and active-entity state;
- date extraction and ownership;
- candidate experience, education, project, skill, credential, training, language, volunteering, summary, identity, and conservative unknown content;
- entity relationship ownership;
- interpretation confidence and deterministic review issues;
- compatibility projection into `CvExtractionPayload`.

It never imports Mammoth, `unpdf`, PDF.js, JSZip, or raw OOXML helpers. Existing narrow utilities for dates, URL classification, phone normalization, and canonical skill normalization remain reusable after their APIs are adjusted from line-only inputs to block-aware inputs.

## F. Block grouping and entity ownership rules

Interpretation is a forward state machine scoped to each detected section instance and layout stream. It does not share an active entity across section boundaries, page/column stream changes that break continuity, or a new structurally equivalent heading.

An entity group consists of an identity/header block plus locally subordinate blocks. Subordination evidence, in priority order, is:

1. explicit hierarchy (`parentId`, list nesting, table row/cell relationship);
2. same section instance and same column/layout stream;
3. repeated style pattern identifying peer entity headers;
4. a date block paired with an adjacent header inside the same local group;
5. contiguous detail/list blocks before the next peer boundary.

Every detail block is either owned by exactly one entity, retained as unresolved content with a review issue, or left in its unknown section. It is never attached by global nearest/first/last fallback. Ownership decisions are deterministic for the same block sequence.

## G. Section detection strategy

Section detection combines exact normalized aliases with structural evidence. Existing aliases remain and add the requested cross-domain forms (`Education & Training`, `Selected Work`, `Research Projects`, `Engagements`, `Clinical Skills`, `Research Methods`, `Tools`, `Professional Skills`, and similar listed aliases).

A block becomes a known section heading when:

- its normalized text exactly matches an alias; or
- a conservative alias normalization matches and the block has heading evidence (heading kind/level, strong isolated styling, or a repeated section-heading pattern).

Substring matches inside prose are forbidden. Formatting alone does not assign a known semantic section. An isolated heading-like block with no recognized alias opens an `unknown` section instance whose content is retained for review rather than discarded or forced into the preceding section.

Repeated sections remain distinct during grouping and may be combined only at DTO projection. Column identity participates in continuity so a left skills sidebar cannot consume right-column experience blocks.

## H. Experience parsing strategy

Experience parsing identifies a local entry group first, then resolves title, employer, and dates within that group. Dates are extracted from inline or standalone blocks using the existing deterministic date parser extended only for the specified dash, year-only, and numeric-month forms. `current` is true only for an explicit Present-style token.

Supported structural forms include role-first, employer-first, dates-first, separate date blocks, and employer/location detail blocks. Resolution uses delimiter-separated segments, styles, date position, and repeated layout across sibling entries. It does not use occupation or employer dictionaries.

For an inline `Role · Employer Dates` block, the date range is removed first and the remaining delimiter segments resolve title then employer. For multi-block entries, the interpreter learns the repeated pattern within that section (for example bold employer followed by role and date) and applies it only when sibling groups confirm it. If two assignments remain equally plausible, both source blocks are preserved, uncertain required fields remain absent, confidence is lowered, and the candidate enters existing review conflict handling rather than receiving a guessed employer/title.

## I. Project and detail ownership strategy

A project begins only at a block with independent project identity: heading-like structure or a peer pattern consistent with other project headers. A short delimiter-separated row immediately following an active project is metadata/details, not a new project, when it lacks its own date, project link identity, heading-style peer evidence, and is followed by subordinate detail/bullet blocks. This rule uses structure and works equally for technologies, campaign tools, research methods, and operational competencies.

Project links attach only when contained by the project header/detail block or geometrically/structurally inside the project's group. Project metadata tokens remain attached to that project and may also be emitted as skill representations for later reconciliation. Bullets and continuation paragraphs belong to the active project until the next peer project boundary.

If a block could belong to more than one project because layout/structure does not establish a unique group, it is attached to neither. The interpreter emits a deterministic `AMBIGUOUS_ENTITY_OWNERSHIP` issue containing the block IDs and candidate owner IDs. Review projection preserves its text and prevents silent confirmation until the user assigns or edits it. No title-similarity or source-order tie-break is allowed.

## J. Skill tokenization and reconciliation boundary

The interpreter emits every extracted skill representation with source category, source block, and optional project association. Tokenization splits only on structural list boundaries, commas, middle dots, bullet separators, or separate cells/blocks. `/` is never a general separator, so `API/Integration Testing`, `CI/CD`, and `OAuth/OIDC` remain atomic.

The interpreter does not choose the final category or discard duplicates. `cv-import/candidates.ts` continues to reconcile representations by canonical taxonomy/alias ID when available and otherwise Unicode NFKC, trimmed, whitespace-collapsed, case-folded exact normalized name. Broad fuzzy matching remains prohibited.

Existing authority is preserved and strengthened with tests:

1. user-confirmed/current profile category;
2. existing canonical profile category;
3. canonical taxonomy/alias category;
4. one specific extracted category;
5. `Additional Skills` fallback.

`Additional` and `Additional Skills` normalize to the existing app-facing fallback. Multiple specific extracted categories without a higher authority remain `CONFLICTING_SKILL_CATEGORY`; deterministic sorting may stabilize display but never select a winner. Project technologies use the same normalized identity in `canonical.ts`, so their `upsert` and project links reuse canonical skills and never downgrade an existing category.

## K. Ambiguity and review-issue model

The interpreter uses an internal issue type:

```ts
type CvInterpretationIssue = {
  code:
    | 'AMBIGUOUS_SECTION'
    | 'AMBIGUOUS_ENTITY_TYPE'
    | 'AMBIGUOUS_ENTITY_OWNERSHIP'
    | 'AMBIGUOUS_EXPERIENCE_HEADER'
    | 'AMBIGUOUS_DATE_OWNERSHIP';
  blockIds: string[];
  candidateIds?: string[];
  messageKey: string;
};
```

Issues are deterministic diagnostics, not user-facing parser prose. Where entity identity is sound, the issue projects onto that entity's candidate using the existing `AMBIGUOUS_VALUE`/missing-field conflict path and a reduced confidence. Unowned content projects as a non-auto-confirmable review candidate carrying its verbatim excerpt; implementation will use the smallest additive optional DTO metadata needed for this without adding a table or changing endpoint topology. If the current candidate types cannot carry this honestly, the plan must stop and propose the minimal additive contract before coding that part rather than misclassifying or dropping content.

Zero destructive guesses means no issue is resolved through first/last/nearest/source-order selection. High-confidence candidates remain compact and bulk-reviewable.

## L. Compatibility projection to existing DTOs

`extractStoredCv` keeps returning `{ format, parserVersion, text, pageCount, structured }`. The normalized plain-text projection supplies `text`; `pageCount` comes from the adapter; and `structured` remains validated by `CvExtractionPayloadSchema`.

Existing entity DTO field names and semantics remain unchanged. Source locations continue to expose stable zero-based normalized-text lines and section headings. Internally, projection uses the block-to-line map; the interpreter itself uses block IDs. Existing stored schema versions remain readable, and the parser version advances. Any new diagnostic metadata is optional and additive, with no rewrite of historical rows.

`parseCvStructure(text, links)` may remain temporarily as a test/backward-compatible wrapper that creates a minimal block document, but production ingestion must call `interpretCvDocument(normalizedDocument)` directly. It must not remain a competing production interpreter.

## M. Both PDF call-path migrations

The stored-CV/public ATS/revision paths continue through `extractStoredCv`, now routed to the normalized adapters. The analyze route's `src/shared/utils/pdf-parser.ts` wrapper is rewritten to call the same PDF adapter and return its compatibility text/page count, or removed in favor of a shared exported helper. No `pdf-parse` import remains.

`pdf-parse`, its worker setup, obsolete typings, and its Next.js external-package entry are removed after repository-wide verification. `unpdf` is added and configured according to Next.js 16.2.6's Node/server packaging rules only if the build demonstrates externalization is required. Parser modules remain server-only and never enter client bundles.

## N. Test matrix and acceptance fixtures

Tests are layered so failures identify the boundary:

1. Adapter tests assert normalized PDF and DOCX blocks, links, lists, tables, styles, coordinates, columns, malformed input, size/page safeguards, and scanned/no-text behavior.
2. Interpreter unit tests consume hand-built `NormalizedDocument` fixtures; they do not require binary generation to exercise semantic rules.
3. End-to-end extraction tests feed actual generated PDF/DOCX bytes through adapters and compatibility projection.
4. Import tests assert compact skill review rows, category authority/conflict, project-technology reuse, repeated sessions/imports, and canonical upsert behavior.

Fixture matrix:

| Fixture | Required assertions |
| --- | --- |
| Production-shaped software CV | 3 experiences with exact title/employer/dates/current; 2 education; exactly Bhejo/Kinetix/Align; no `Next.js` project; correct per-project details; compound skills intact; no logical skill duplicates; zero required-field reviews for those experience fields |
| Healthcare | Clinical Skills category; non-software role/employer/date parsing; no fake projects |
| Marketing | Campaign Tools category; campaign metadata row owned by its campaign |
| Academic/research | Research Methods category; research projects correct; publications-like unknown section retained safely |
| Operations/public sector | Core Competencies category; employer-first experience parsed correctly |
| Single-column/title-first | correct section/entity boundaries |
| Two-column/sidebar | no left/right interleaving; sidebar skills isolated |
| Dates on separate blocks | date assigned only within local entry group |
| Table-heavy DOCX | headings/cells/lists/links retained and interpreted |
| Flat skills | skills preserved with Additional fallback, not forced taxonomy |
| Equivalent PDF/DOCX | same canonical counts, relationships, dates, skills, and category intent; only low-level layout metadata may differ |

Every fixture reports detected sections, entity counts and relationships, categories, fake entities, duplicate logical skills, review issues, and destructive guesses. Destructive guesses must be zero. The production-shaped fixture must report zero employer/start/end/current review needs for the three stated roles.

Full verification is focused tests, relevant integration/full suite, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

## O. Implementation sequence

Implementation follows red-green-refactor in this order:

1. Characterize current PDF/DOCX outputs and add failing normalized-adapter contract tests.
2. Add `unpdf`, introduce document types/projection, and implement the PDF adapter with safeguards.
3. Convert DOCX canonical body ingestion to Mammoth HTML and constrain supplemental package inspection.
4. Preserve `CvExtractionResult` and `CvExtractionPayload` compatibility at the orchestration boundary.
5. Add block-aware sectioning and interpreter scaffolding, then migrate readers one entity family at a time.
6. Fix project grouping/detail ownership and the production fake-project regression.
7. Fix experience grouping/header/date parsing across role-first and employer-first forms.
8. Fix compound skill tokenization while preserving all representations.
9. Strengthen existing category-authority/conflict and canonical upsert tests; change production code only where a failing test proves a defect.
10. Add ambiguity projection and review UI coverage without redesigning onboarding.
11. Migrate the analyze route to the shared adapter and remove all `pdf-parse` code/dependencies.
12. Add cross-domain, cross-template, binary parity, and repeat-import fixtures.
13. Run the complete verification matrix and produce the requested acceptance report.

No implementation step edits CV Generation V2. If a compile-level change appears necessary there, stop and isolate an adapter outside that subsystem first.

## P. Rollback and regression risks

- **PDF reading-order regression:** geometric grouping can reorder unusual designs. Mitigation: retain item/page metadata, use conservative column detection, and compare canonical results across single/two-column fixtures. Rollback is dependency/code reversion; no persisted normalized data requires migration.
- **Mammoth HTML differences:** producer-specific styles may map inconsistently. Mitigation: rely on semantic tags, keep a small structural style map, and test Word-like and generated OOXML documents. Do not restore raw-text authority as a fallback.
- **Lost header/text-box content:** constraining manual XML could remove currently recovered contact data. Mitigation: retain targeted supplement fixtures and convert those parts into normalized blocks before deleting old line matching.
- **Duplicate or missing links:** merging adapter and supplemental links can duplicate or detach URLs. Mitigation: dedupe by normalized URL plus owning block and preserve unplaced links without proximity assignment.
- **Over-eager headings:** style-only section inference can split entries. Mitigation: known aliases require whole-block matches; unknown styled headings stay unknown and reviewable.
- **Under/over-grouped entities:** active entity state can leak across layouts. Mitigation: hard section/peer/column boundaries and ownership invariants with zero cross-project attachment tests.
- **Skill category regression:** early dedupe can discard authority evidence. Mitigation: keep all representations through candidate reconciliation and retain the current normalized-name unique upsert.
- **Compatibility regression:** changed provenance line numbers or schema validation could break stored imports. Mitigation: stable block-to-line projection, readable old schema versions, additive-only metadata, and existing stored-CV/import integration suites.
- **Runtime/bundle regression:** `unpdf` packaging may behave differently in Next.js production builds. Mitigation: use the serverless bundle by default, follow local Next.js 16.2.6 server-package guidance, and require a production build before removing the old dependency.

Rollback is code-only: restore the prior parser version and dependencies. No database rollback or persisted `NormalizedDocument` cleanup is required.

## References

- `unpdf` exposes reusable document proxies, positioned text items, links, and PDF.js access: <https://github.com/unjs/unpdf>
- Mammoth structured HTML preserves semantic headings, lists, tables, links, and emphasis while raw-text extraction discards formatting: <https://github.com/mwilliamson/mammoth.js/blob/master/README.md>
- Repository-local Next.js 16.2.6 documentation under `node_modules/next/dist/docs/` governs Route Handler, server-only, runtime, and package externalization behavior.
