# Practical Eligibility and Location Preferences

## Purpose

Extend Align's existing practical-profile and deterministic compatibility system with editable relocation willingness, maximum one-way commute, and multiple preferred work arrangements. These preferences must flow through onboarding and Career Profile editing into Match Preparation and completed Job Match reports without affecting CV scoring, ATS weighting, or AI prompts.

## Existing architecture to preserve

- `ProfileIdentity` remains the shared source for country, city, right-to-work status, and visa expiry.
- `ProfilePracticalFacts` remains the single shared source for user-recorded practical facts.
- `buildConfirmedCandidateFacts` remains the ownership-scoped candidate-fact builder.
- `comparePracticalCompatibility` remains the only deterministic practical evaluator.
- `CareerProfileSnapshot.snapshotJson` remains the immutable match-time candidate snapshot.
- `JobRevision` remains the immutable vacancy input used by a completed match.
- `runJobMatch` remains the canonical Match Preparation to Job Match pipeline.
- Practical compatibility remains unscored and separate from the CV match score.

## Data model

Replace the two legacy preference representations in `ProfilePracticalFacts` rather than creating competing state:

- Replace nullable `openToRelocation Boolean?` with nullable `relocationPreference RelocationPreference?`, where the enum is `YES`, `NO`, or `CONSIDER`.
- Replace nullable scalar `workPatternPreference WorkPatternPreference?` with `preferredWorkStyles WorkStylePreference[]`, where the enum is `REMOTE`, `HYBRID`, or `ONSITE` and the default is an empty array.
- Retain `maxCommuteMinutes Int?`.
- Retain unrelated practical-fact fields unchanged.

The migration will preserve deployability and existing records by translating legacy values before removing the legacy enum:

- `openToRelocation = true` becomes `YES`, `false` becomes `NO`, and null remains null.
- `REMOTE_ONLY`, `HYBRID`, and `ONSITE` become their corresponding one-element arrays.
- `FLEXIBLE` becomes all three supported arrangements, preserving its explicit acceptance of every arrangement.

`JobMatch` gains nullable `practicalCompatibilityJson` and an integer schema-version field. This is an additive historical result snapshot. Old matches remain readable without practical results; new matches persist the exact deterministic conclusion produced from the match-time profile snapshot and vacancy revision.

## Shared contract and persistence

A shared Zod schema will define the preference input:

- `relocationPreference`: `YES | NO | CONSIDER | null`
- `maxCommuteMinutes`: `15 | 30 | 45 | 60 | 90 | null`
- `preferredWorkStyles`: a unique array containing only `REMOTE`, `HYBRID`, and `ONSITE`

Empty work-style selection and null commute/relocation values mean no stated preference. Both onboarding and Career Profile editing will use this contract and the same persistence service. Server actions will obtain the authenticated user from the session, never accept a user id, and upsert only that user's `ProfilePracticalFacts` row. Clearing preferences writes null or an empty array.

## User interfaces

The existing eligibility step retains country, city, right to work, visa expiry, and Skip for now. It adds:

- a three-choice relocation control labelled Yes, No, and Maybe;
- a maximum one-way commute select with 15, 30, 45, 60, 90 minutes, and No preference;
- a multi-select work-arrangement control for Remote, Hybrid, and On-site.

The manual onboarding path uses the same reusable preference fields. Existing spacing, controls, responsive grid, design tokens, and save behaviour are retained.

Career Profile exposes the same controls in its existing personal/eligibility area. Initial values come from the canonical profile loader, and saving or clearing uses the shared contract and persistence path. No client-side copy of preference state becomes authoritative.

## Deterministic evaluation

`ConfirmedCandidateFacts` will carry `relocationPreference`, `maxCommuteMinutes`, and `preferredWorkStyles`. The profile snapshot automatically captures those values through the existing builder.

### Work style

The evaluator uses the vacancy's explicit normalized `workStyle` metadata:

- If the vacancy arrangement is unknown, emit `UNKNOWN`.
- If the user selected no arrangements, emit `NOT_APPLICABLE` as no restriction was stated.
- If the explicit vacancy arrangement is among the selected values, emit `CONFIRMED`.
- Otherwise emit a preference conflict using the existing `CONFLICT` state, with copy that clearly calls it a preference mismatch rather than legal or practical ineligibility.
- Hybrid is compared only with `HYBRID`; it is never treated as remote.

The presentation label for the existing `REMOTE_ONSITE` category changes to “Work style”; the stored category remains stable unless tests show a schema-safe rename is required.

### Relocation and location

Vacancy requirement extraction gains a conservative `RELOCATION` category for explicit statements that relocation is required. Merely naming a city, office, or onsite arrangement does not create this requirement.

- `YES` plus an explicit relocation requirement is compatible in principle.
- `CONSIDER` produces review-needed/unknown semantics.
- `NO` plus an explicit required relocation statement produces a preference conflict.
- No preference or insufficient vacancy evidence produces unknown/not-assessed semantics.

Location comparison remains separate. A matching city may be confirmed, a remote role is location-compatible, and insufficient evidence remains unknown. A different city alone never produces a relocation conflict.

### Commute

The current conservative behaviour remains: a stored maximum is compared only when reliable journey-time evidence exists. This repository captures neither travel mode nor routing data, so no commute duration will be calculated. For a non-remote role with a stated commute limit and no reliable estimate, the evaluator emits `UNKNOWN` and says the commute has not been verified.

## Match pipeline and historical consistency

Match Preparation continues to build live candidate facts for its preview. During `runJobMatch`, the system will:

1. create the immutable Career Profile snapshot;
2. create/resolve the immutable Job Revision;
3. evaluate practical compatibility from the snapshot's practical facts and the revision's stored vacancy evidence/metadata;
4. persist that practical result on the new `JobMatch` fields;
5. attach it to the response independently from `jobMatchData.matchScore`.

Stored-result loading reads the persisted practical snapshot. It never recomputes an old result from the current profile. Updating preferences therefore affects new preparation previews and future matches only.

## Completed report

The completed Job Match result gains a dedicated Practical Compatibility panel using the established badges and row styling. It displays work style, relocation, commute, location, and existing practical categories with their evidence and explanations. It does not alter the CV Match score, score explanation, requirement ledger, or AI-generated feedback.

Preference conflicts will be worded as “Preference mismatch” or “Review needed”; legal/right-to-work requirements retain their existing factual wording and disclaimer.

## Validation and errors

- Reject unsupported relocation and work-style values.
- Reject duplicate work styles and commute values outside the supported set.
- Accept null/empty optional preferences and partial onboarding submissions.
- Continue to accept existing accounts without practical-fact rows.
- Preserve authenticated ownership checks in profile and match queries.
- Do not log candidate preferences or full vacancy descriptions.

## Testing

Test-first coverage will include:

- shared schema acceptance and rejection;
- onboarding and Career Profile persistence, clearing, hydration, and ownership isolation;
- existing users without preference values;
- multiple selected work styles and remote/hybrid distinction;
- relocation `YES`, `NO`, and `CONSIDER`, including absent requirements;
- different-city behaviour without assumed relocation;
- unavailable commute estimates;
- preparation-to-match propagation and persistence;
- stored historical results remaining unchanged after profile edits;
- completed-report rendering;
- characterization that CV score calculation remains unchanged.

Verification will run focused tests, the relevant/full Vitest suite, TypeScript, ESLint, Prisma format and validation, migration checks, and a production build. No browser runner will be added. Desktop and mobile UI validation will be performed manually where the local environment permits and any gap will be reported.

## Local database safety

Before any reset, inspect the effective database configuration without printing credentials. A reset is permitted only if the host and database are demonstrably the disposable local development database. If that cannot be proven, do not reset; validate the migration through non-destructive Prisma tooling instead.

## Out of scope

No routing/geocoding provider, travel-time estimation, salary or sponsorship changes, new AI calls, prompt changes, CV scoring dimensions, job-tracking features, browser extension work, or dashboard redesign will be introduced. Phase 12 remains out of scope.
