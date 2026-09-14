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
