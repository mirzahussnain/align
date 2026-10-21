# Stage 4 golden CV review

Stage 4 automation prepares deterministic DOCX files and evidence-safety results. It does not constitute subjective recruiter approval or Microsoft Word approval.

## Generate and verify

Run from the repository root:

```powershell
npm run generate:golden-cvs
npm run test:stage4
npm test
npm run typecheck
npm run lint
npm run build
```

Generated files are written to the ignored `artifacts/golden-cvs/` directory. The generator clears that managed directory before rebuilding it, so stale filenames cannot enter a review pack.

The stable naming convention is:

```text
<occupation>_<density>_<template>_v1.docx
```

Read `artifacts/golden-cvs/manifest.json` for machine-readable expectations and `artifacts/golden-cvs/REVIEW.md` for the complete human checklist.

## Minimal Word review set

Inspect these eight files at 100% zoom in Microsoft Word:

1. `administration_sparse_architect_v1.docx`
2. `registered-nurse_normal_editorial_refined_v1.docx`
3. `software-engineering_dense_technical_precision_v1.docx`
4. `software-engineering_dense_academic_latex_v1.docx`
5. `frontline-operations_likely-multi-page_academic_latex_v1.docx`
6. `healthcare-support_normal_architect_v1.docx`
7. `it-support-general_dense_editorial_refined_v1.docx`
8. `general_normal_technical_precision_v1.docx`

For every page, check:

- no blank or nearly blank spill page;
- no clipping, overlap, hidden text or content outside the page;
- no orphaned section heading or isolated bullet;
- dates, hyperlinks, tables and bullet indentation remain within margins;
- sparse documents do not show broken empty bands;
- dense documents remain legible and do not silently omit verified evidence;
- each template remains visually distinct while preserving the manifest’s content and section order.

Record `PASS`, `PASS WITH FIXES` or `FAIL` in the generated `REVIEW.md`. Do not overwrite the automated result.

## Browser validation

Use the existing local development user and canonical local database. Do not create production data.

1. Start the database/storage services and app with `npm run dev:up` and `npm run dev`.
2. Sign in and open Profile Management.
3. Select each active Career Profile and confirm its canonical evidence sections load without cross-profile leakage.
4. Generate a profile-only CV in each template. Confirm the download filename, valid DOCX container, selected template provenance, intact skill categories and absence of vacancy-specific wording.
5. Open a job-match analysis. Review the requirement ledger, approve one stable Career Profile evidence record, add one application-only context record and confirm accuracy.
6. Generate and download a tailored CV. Confirm approved evidence is present, unapproved evidence is absent, unsupported/contradicted/unclear requirements are not claimed and application-only wording remains qualified.
7. Verify successful tailored generation increments CV-generation usage exactly once. Provider, schema, provenance, truthfulness, unsupported-claim, stale/deleted/cross-profile evidence and stale-application failures must persist no CV, consume no quota and offer no partial download.
8. Save browser screenshots, failed-test traces, console/network errors and safe API/provenance snapshots under ignored `artifacts/stage4-browser/`.

The corrected-draft, quota, failure and evidence-isolation behaviours also have deterministic API-level coverage in `npm run test:stage4`; browser review confirms the wired UI and download behaviour.

## Contract boundary

The current canonical `CvBuildSpec` has summary, skills, experience, projects, education and certifications. Stage 4 does not add section types. Licences, registrations, languages, training and volunteering are tested as evidence-backed content within existing sections, with expected omissions recorded in the manifest.

No calibrated IT Support / Service Management profile currently exists, so that fixture intentionally uses General.

## LibreOffice rendered-page acceptance

The document-preview acceptance matrix is separate from the deterministic DOCX golden review above. Run it against the authenticated loopback renderer with `RUN_RENDERER_INTEGRATION=1` and the documented `GOTENBERG_*` variables:

```text
npm run test:renderer
```

On 21 October 2026, all four template IDs passed each required case against Gotenberg 8.38.1 LibreOffice on Docker Desktop x86_64: a naturally fitting short CV rendered as one page, a representative medium CV rendered as two pages, and an oversized CV exhausted all three bounded readable layout profiles and returned `PAGE_LIMIT_EXCEEDED` without mutating or deleting content. The tested upstream image was `gotenberg/gotenberg:8.38.1-libreoffice@sha256:2098722190575dbd975d8abf02e4ce83ffe20783114c5cc56f1b2ac309e6a083`; the repository Dockerfile now pins that digest and verifies Arial, Georgia, Trebuchet MS and Times New Roman during its build. The locally built custom image produced manifest-list digest `sha256:a29c531fbd2f249b66de3a8cee4f7560abe47b1a4a05016410a6ef56b8f311d9`; that local digest is evidence only, not a claim that a production registry artifact exists.

`npm run generate:template-previews` produced the four committed first-page PNGs and deterministic manifest from the same safe synthetic medium fixture. It contains no account or production CV data.

The 21 October local deterministic benchmark (`npm run benchmark:cv-generation`) measured short, medium and all-three-profile overflow workflows for every template. It records evidence load, deterministic AI-contract/checkpoint work, every DOCX build and renderer/queue call, actual PDF inspection, PNG rasterisation, each artifact copy, publication shape, call counts and artifact sizes. Its worst warm-path total was 858.47 ms and peak process RSS was 297,328,640 bytes. This is not a production latency claim: paid AI-provider latency, renderer network transit and remote R2/database latency were intentionally not invoked. An explicitly opted-in staging mode calls the canonical provider-backed workflow only when a prepared user/generation/idempotency tuple matches and `LIVE_AI_BENCHMARK_CONFIRM_BILLABLE=YES`; it must be run before production enablement to capture those external timings without accidental duplicate billing. The application retains a 260-second workflow deadline inside the 300-second Vercel function ceiling, a single shared renderer retry budget, a fenced generation lease and checkpointed AI result so an interrupted request cannot republish or charge twice.

LibreOffice PDF is the page-limit authority and the exact document offered for authenticated PDF download. Microsoft Word can paginate the downloadable DOCX differently because of Word version, printer metrics, text shaping and local font substitution; the DOCX is never stretched to imitate the verified PDF.
