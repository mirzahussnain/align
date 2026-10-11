# Practical Eligibility and Location Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist relocation, commute, and multi-select work-style preferences and include their deterministic, historically stable assessment in completed Job Match reports.

**Architecture:** Evolve the existing `ProfilePracticalFacts` columns into the canonical preference representation, share one Zod contract and field component between onboarding and Career Profile, and extend the existing deterministic evaluator. At match time, assess the immutable Career Profile snapshot against the exact Job Revision and persist the unscored practical result on `JobMatch` for historical rendering.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Zod, Vitest, Testing Library, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-10-11-practical-preferences-design.md`

## Global Constraints

- Reuse `ProfilePracticalFacts`, `buildConfirmedCandidateFacts`, `comparePracticalCompatibility`, Career Profile snapshots, and `runJobMatch`.
- Do not change AI prompts, CV/ATS score weights, ranking rules, or add AI calls.
- `relocationPreference` is nullable `YES | NO | CONSIDER`; `preferredWorkStyles` is a unique array of `REMOTE | HYBRID | ONSITE`; `maxCommuteMinutes` is `15 | 30 | 45 | 60 | 90 | null`.
- Empty work styles and null values mean no stated preference.
- A different city never proves relocation is required and no commute duration may be fabricated.
- Mandatory relocation extraction requires explicit mandatory language; assistance, optional relocation, and location names alone do not qualify.
- A work-style conflict retains evaluator state `CONFLICT` but all UI/explanation copy calls it a preference mismatch, never mandatory or legal ineligibility.
- Completed matches render persisted practical conclusions and never recompute them from current preferences.
- Do not add a browser test framework; report manual UI validation limitations.
- Do not reset a database unless the effective connection is proven to be an exclusive local development database.

## Review Focus

- Duplicate work-style values submitted by a caller are rejected rather than silently stored; Task 2 covers this contract.
- Legacy `FLEXIBLE` data migrates to all three work styles rather than becoming an unstated preference; Task 1 verifies migration SQL.
- “Relocation assistance available” and “relocation optional” never trigger a mandatory requirement; Task 4 covers both phrases.
- A completed old match with no practical JSON still loads successfully; Task 6 covers backward compatibility.
- A stored work-style conflict is labelled as a preference mismatch on both desktop and mobile report navigation/content; Task 7 covers render copy.

---

### Task 1: Canonical Prisma preference and result schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261011120000_practical_location_preferences/migration.sql`
- Test: `src/shared/services/__tests__/practical-preference-migration.test.ts`

**Interfaces:**
- Produces Prisma enums `RelocationPreference`, `WorkStylePreference`.
- Produces `ProfilePracticalFacts.relocationPreference`, `.preferredWorkStyles`, and retained `.maxCommuteMinutes`.
- Produces `JobMatch.practicalCompatibilityJson` and `.practicalCompatibilityVersion`.

- [ ] **Step 1: Write the failing migration contract test** asserting the migration translates true/false/null relocation values, maps all four legacy work patterns including `FLEXIBLE`, removes the legacy columns/enum, preserves unrelated facts, and adds nullable/version-safe Job Match result columns.
- [ ] **Step 2: Run `npm test -- src/shared/services/__tests__/practical-preference-migration.test.ts`** and verify it fails because the migration is absent.
- [ ] **Step 3: Update the Prisma schema and write the data-preserving SQL migration** using temporary values/columns only inside the migration; the final schema must expose no duplicate preference state.
- [ ] **Step 4: Run `npx prisma format`, `npx prisma validate`, and the focused migration test** and verify all pass.
- [ ] **Step 5: Inspect the effective `DATABASE_URL` host/database without printing credentials**; only if it is demonstrably local, run the normal migration workflow and regenerate Prisma types. Do not reset unless migration application requires it and local exclusivity is proven.
- [ ] **Step 6: Commit** with `feat(eligibility): evolve practical preference schema`.

### Task 2: Shared validation, canonical persistence, and profile loading

**Files:**
- Create: `src/shared/schemas/practical-preferences.ts`
- Create: `src/shared/schemas/__tests__/practical-preferences.test.ts`
- Create: `src/shared/services/practical-preferences.ts`
- Create: `src/shared/services/__tests__/practical-preferences.integration.test.ts`
- Modify: `src/features/dashboard/data/load-profile.ts`
- Modify: `src/shared/services/practical-compatibility-store.ts`

**Interfaces:**
- Produces `PracticalPreferencesInput`, `practicalPreferencesSchema`, `EMPTY_PRACTICAL_PREFERENCES`, and `savePracticalPreferences(userId, input, client?)`.
- Extends `ProfileData` with `practicalPreferences`.
- Extends `ConfirmedCandidateFacts` consumption with the new canonical values in Task 4.

- [ ] **Step 1: Write failing schema tests** for every supported value, null/empty input, partial/default input, invalid commute, unsupported enum values, and duplicate work styles.
- [ ] **Step 2: Run the schema test** and verify it fails because the contract does not exist.
- [ ] **Step 3: Implement the Zod schema and exported constants/types** with deterministic normalization and no implicit preferences.
- [ ] **Step 4: Run the schema test** and verify it passes.
- [ ] **Step 5: Write failing integration tests** for create/update/clear, an account without a facts row, preservation of unrelated practical facts, and user ownership isolation.
- [ ] **Step 6: Implement `savePracticalPreferences` and hydrate `loadProfileData`/`buildConfirmedCandidateFacts`** through ownership-scoped queries and upserts.
- [ ] **Step 7: Run the focused schema and integration tests** and verify they pass.
- [ ] **Step 8: Commit** with `feat(eligibility): add shared practical preference contract`.

### Task 3: Onboarding and Career Profile editing

**Files:**
- Create: `src/features/dashboard/components/profile/PracticalPreferencesFields.tsx`
- Create: `src/features/dashboard/components/profile/__tests__/practical-preferences-fields.test.tsx`
- Modify: `src/features/onboarding/actions.ts`
- Modify: `src/features/onboarding/components/EligibilityStep.tsx`
- Modify: `src/features/onboarding/components/ManualEligibilityStep.tsx`
- Modify: `src/features/onboarding/components/OnboardingJourney.tsx`
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/features/dashboard/actions/profile-actions.ts`
- Modify: `src/features/dashboard/components/profile/PersonalInfoForm.tsx`
- Modify: `src/features/onboarding/components/__tests__/onboarding-ux.test.tsx`
- Modify: `src/features/dashboard/components/profile/__tests__/profile-form-quality.test.ts`
- Test: `src/features/onboarding/__tests__/eligibility-persistence.test.ts`

**Interfaces:**
- Consumes Task 2's `PracticalPreferencesInput`, schema, empty values, and persistence service.
- Produces reusable `PracticalPreferencesFields({ value, onChange, idPrefix })`.
- Extends `EligibilityBasicsInput` and `PersonalInfoInput` with the canonical preferences.

- [ ] **Step 1: Write failing component tests** for Yes/No/Maybe, all commute choices with one-way help text, independent multi-select work styles, clearing, keyboard-accessible labels, and mobile-safe layout classes.
- [ ] **Step 2: Run the focused component tests** and verify they fail.
- [ ] **Step 3: Implement `PracticalPreferencesFields`** using existing form controls, tokens, focus styles, and responsive conventions.
- [ ] **Step 4: Write failing action tests** for onboarding save, Career Profile save/clear, session-derived ownership, and hydration on revisit.
- [ ] **Step 5: Extend both authenticated actions and profile/onboarding loaders** to parse the shared schema and persist identity plus practical preferences without accepting a caller user id.
- [ ] **Step 6: Integrate the shared fields into standard onboarding, manual onboarding, and Personal Information** while preserving Skip for now and existing visa validation.
- [ ] **Step 7: Run all onboarding/profile focused tests** and verify they pass.
- [ ] **Step 8: Commit** with `feat(eligibility): edit practical preferences in profile flows`.

### Task 4: Deterministic work-style, relocation, location, and commute evaluation

**Files:**
- Modify: `src/shared/types/practical-compatibility.ts`
- Modify: `src/shared/types/job-intelligence.ts`
- Modify: `src/shared/services/job-intelligence.ts`
- Modify: `src/shared/services/practical-compatibility.ts`
- Modify: `src/shared/services/__tests__/job-intelligence.test.ts`
- Modify: `src/shared/services/__tests__/practical-compatibility.test.ts`
- Modify: `src/shared/services/__tests__/practical-compatibility-privacy.test.ts`

**Interfaces:**
- Consumes Task 2's canonical candidate preferences.
- Produces conservative `RELOCATION` evidence and canonical `PracticalCompatibilityViewModel` rows for `REMOTE_ONSITE`, `RELOCATION`, `LOCATION`, and `COMMUTE`.

- [ ] **Step 1: Write failing extraction tests** for “must relocate”/“relocation required” and negative cases for assistance, optional/considered relocation, ordinary location text, and another city.
- [ ] **Step 2: Run extraction tests** and verify the new mandatory cases fail.
- [ ] **Step 3: Implement the conservative `RELOCATION` extraction rule** without broad location inference.
- [ ] **Step 4: Write failing evaluator tests** for each work style, multiple selections, remote-versus-hybrid distinction, empty selection, unknown vacancy style, all relocation values, absent relocation requirement, different-city unknown, remote location, and unavailable commute timing.
- [ ] **Step 5: Implement the minimal evaluator changes** so preference conflicts remain unscored `CONFLICT` rows whose explanation explicitly says “preference mismatch”; location never converts a city difference into relocation; commute remains unverified without routing evidence.
- [ ] **Step 6: Run evaluator, privacy, and intelligence tests** and verify they pass with no sensitive logging or legal conclusions.
- [ ] **Step 7: Commit** with `feat(eligibility): compare relocation and work-style preferences`.

### Task 5: Immutable match-time assessment and persistence

**Files:**
- Modify: `src/shared/services/job-revision.ts`
- Modify: `src/shared/services/job-match-service.ts`
- Modify: `src/shared/types/cv.ts`
- Modify: `src/shared/services/career-profile-snapshot.ts`
- Create: `src/shared/services/job-match-practical-compatibility.ts`
- Create: `src/shared/services/__tests__/job-match-practical-compatibility.test.ts`
- Modify: `src/app/api/jobs/[jobSnapshotId]/match-preparation/__tests__/route.test.ts`
- Modify: `src/app/api/job-matches/__tests__/route.test.ts` if present, otherwise create it.

**Interfaces:**
- Produces `assessSnapshotPracticalCompatibility(snapshotData, jobRevision)` returning `PracticalCompatibilityViewModel`.
- Extends `CVAnalysisResult` with optional `practicalCompatibility`.
- Persists exactly that value in `JobMatch.practicalCompatibilityJson` with the configured version.

- [ ] **Step 1: Write failing tests** that Job Revision captures normalized city/region/country/work style, Match Preparation uses current preferences, and Job Match uses the profile snapshot plus exact revision rather than live profile data.
- [ ] **Step 2: Run the focused flow tests** and verify persistence assertions fail.
- [ ] **Step 3: Capture practical vacancy metadata in `providerMetadataJson`** and implement the pure snapshot/revision assessment adapter.
- [ ] **Step 4: Call the adapter in `runJobMatch`, attach the result to `CVAnalysisResult`, and persist the same JSON/version** without changing score or AI inputs.
- [ ] **Step 5: Add the unchanged-CV-score assertion** comparing the same generated match before and after practical preferences.
- [ ] **Step 6: Run the focused preparation-to-match tests** and verify they pass.
- [ ] **Step 7: Commit** with `feat(job-match): persist practical compatibility snapshot`.

### Task 6: Stored results and historical immutability

**Files:**
- Modify: `src/shared/services/stored-job-match.ts`
- Modify: `src/shared/services/__tests__/stored-job-match.test.ts`
- Modify: `src/shared/services/__tests__/historical-immutability.test.ts`
- Modify: `src/app/api/job-matches/[id]/route.ts`
- Modify: `src/app/api/job-matches/route.ts`

**Interfaces:**
- Consumes Task 5's optional stored JSON.
- Produces stored `CVAnalysisResult.practicalCompatibility` without live recomputation.

- [ ] **Step 1: Write failing tests** for round-tripping persisted practical results, loading legacy rows with null JSON, ownership-isolated reads, and retaining the original result after live preferences change.
- [ ] **Step 2: Run stored-result tests** and verify the new assertions fail.
- [ ] **Step 3: Parse/version-check the stored practical payload** and attach it in `storedJobMatchResult`; null/unknown versions must safely omit the panel rather than break the match.
- [ ] **Step 4: Ensure both collection and detail APIs retain existing ownership filters** and expose only the stored result.
- [ ] **Step 5: Run stored-result, historical, and route tests** and verify they pass.
- [ ] **Step 6: Commit** with `fix(job-match): preserve practical assessment history`.

### Task 7: Completed Job Match practical report UI

**Files:**
- Create: `src/features/cv-analyzer/components/job-match/panels/PracticalCompatibilityPanel.tsx`
- Create: `src/features/cv-analyzer/components/job-match/panels/__tests__/practical-compatibility-panel.test.tsx`
- Modify: `src/features/cv-analyzer/components/job-match/JobMatchDashboard.tsx`
- Modify: `src/features/cv-analyzer/constants/dashboard-navigation.ts`
- Modify: `src/features/job-board/lib/format.ts`
- Modify: `src/features/job-board/components/JobDetailsPanel.tsx`
- Modify: `src/features/job-board/components/stepper/Step2CheckResults.tsx`
- Modify: `src/features/job-board/components/__tests__/sponsor-and-compatibility-ui.test.tsx`

**Interfaces:**
- Consumes `CVAnalysisResult.practicalCompatibility` and existing practical item/status types.
- Produces a separate desktop/mobile “Practical compatibility” report tab and evidence-grounded rows.

- [ ] **Step 1: Write failing UI tests** for compatible work style, relocation review, unverified commute, location confirmation, empty/legacy results, and `CONFLICT` work-style copy rendered as “Preference mismatch” with no “ineligible” language.
- [ ] **Step 2: Run the focused UI tests** and verify they fail.
- [ ] **Step 3: Implement the panel and dashboard navigation** using existing badges, accessible labels, responsive navigation, and no score/progress visual.
- [ ] **Step 4: Align preparation-view category labels and conflict copy** with the completed report while preserving existing legal disclaimers.
- [ ] **Step 5: Run the focused report and job-board UI tests** and verify they pass.
- [ ] **Step 6: Commit** with `feat(job-match): show practical compatibility report`.

### Task 8: Full verification and final focused commit

**Files:**
- Modify only files required by failures attributable to this feature.

**Interfaces:**
- Consumes all prior tasks.
- Produces a validated, committed implementation with no unrelated changes.

- [ ] **Step 1: Run `npx prisma format` and `npx prisma validate`**; require exit code 0.
- [ ] **Step 2: Run focused preference, evaluator, flow, persistence, and UI tests**; require all pass.
- [ ] **Step 3: Run `npm test`**; require all non-environment-gated tests pass and report exact skipped tests.
- [ ] **Step 4: Run `npm run typecheck`**; require exit code 0.
- [ ] **Step 5: Run `npm run lint`**; require exit code 0.
- [ ] **Step 6: Run `npm run build`**; require exit code 0.
- [ ] **Step 7: Start the app only if the verified local environment supports it and manually inspect onboarding, Career Profile, and completed Job Match at desktop/mobile widths**; otherwise record the exact limitation without claiming browser validation.
- [ ] **Step 8: Run `git diff --check`, inspect status/diff for unrelated files and sensitive values, and perform the verification-before-completion review.**
- [ ] **Step 9: Commit remaining integrated changes** with `feat(eligibility): add relocation commute and work-style compatibility`.
