# Align onboarding UX audit

## Current step map

| Existing stage | Purpose in the Career Profile | Branch | UX note |
| --- | --- | --- | --- |
| Goal | Chooses the first useful outcome Align should optimise for | All | Necessary orientation; it changes the persisted route, not the profile schema |
| CV source | Chooses import or manual entry and explains file handling | CV-capable goals | Necessary control and consent point |
| Upload | Stores or selects a source CV | Import | Necessary input step with quota, duplicate, removal, and fallback states |
| Extraction | Converts the chosen file into reviewable candidates | Import | Necessary processing state; it does not persist profile facts |
| Profile selection | Selects or creates the career direction that receives confirmed facts | All | Necessary ownership boundary, especially for multiple profiles |
| Career direction | Records name, target role, track label, and optional classification context | All | Core profile purpose; only name and target role are required by the server action |
| Import review | Lets the user confirm, edit, reject, or reconcile extracted evidence | Import | Essential trust and control boundary before profile persistence |
| Eligibility basics | Adds location and right-to-work context used by role-fit guidance | Check CV / Match job import paths | Contextual and skippable; correctly avoids turning onboarding into an eligibility questionnaire |
| First action | Routes the user to the outcome chosen at the start or into the dashboard | All | Delivers first value and preserves the goal-led path |
| Manual: direction | Saves the profile's direction and identity fields | Manual | The rendered form still shows email, summary, contact, location, and eligibility fields even though its documentation and validation describe name and target role as the only required fields. This is potentially redundant or unclear and is preserved for now rather than silently changed. |
| Manual: experience | Saves employment evidence | Manual | Optional; directly improves matching and application evidence |
| Manual: projects | Saves project evidence when relevant to the selected occupation or already present | Manual | Conditional and optional; the existing occupation-based visibility rule is sound |
| Manual: education | Saves qualification evidence | Manual | Optional; relevant to early-career fit and applications |
| Manual: skills | Saves grouped skill evidence | Manual | Optional; supports matching and tailoring |

## Component hierarchy

- `src/app/onboarding/page.tsx` is the authenticated Server Component entry. It resolves persisted state, profiles, entitlements, stored CVs, identity, import session, and option lists.
- `OnboardingJourney` is the client-side presenter and transition coordinator. It asks the server to move and renders the returned stage.
- Each goal-led stage is a focused client component composed with `OnboardingShell`, `PrimaryButton`, `SecondaryButton`, and `ChoiceCard`.
- `/onboarding/manual` is a separate authenticated Server Component entry that loads profile data and renders `ManualProfileWizard`.
- The manual wizard reuses the dashboard's actual profile forms for basics, experience, projects, education, and skills.
- `/dashboard/import-cv` reuses `UploadStep`, `ExtractionStep`, `ProfileSelectionStep`, and `ImportReviewStep` through `ImportCvFlow` outside first-run onboarding.

## Persistence and protection

- `src/shared/services/onboarding/machine.ts` defines goal-specific ordered paths, prerequisites, backward movement, manual shortcuts, and progress.
- `src/shared/services/onboarding/state.ts` re-reads persisted state for every transition, validates resource ownership, updates attachments and stages, records first value idempotently, and keeps `user.onboardedAt` aligned with completion or dismissal.
- `/api/onboarding` validates actions with Zod and delegates all state decisions to the server service.
- Career direction and eligibility are persisted through authenticated Server Actions with ownership and enum/ontology checks.
- Import candidates are proposals until explicitly confirmed. Resume loads the same persisted import session and candidate IDs.
- The dashboard layout redirects incomplete users to `/onboarding`; `/onboarding` redirects unauthenticated users to login and completed users to the dashboard.

## Existing UI system and motion

- Tailwind CSS v4 with semantic HSL tokens in `src/app/globals.css`.
- Existing brand assets include the Align mark at `public/assets/svgs/logo.svg` and cyan/purple identity tokens.
- Existing reusable primitives include buttons, inputs, alerts, badges, tabs, toast, loaders, and profile-field components.
- `framer-motion` 12 is already installed and is already used by the manual wizard, so the redesign can add focused motion without another dependency.

## Reference-video principles translated for Align

- A stable split composition keeps context visible while the task area changes.
- The initial branded panel becomes a progress and guidance rail after the first decision.
- Each view presents one primary decision, with actions held in a consistent lower region.
- Selected cards respond immediately with border, surface, and directional feedback.
- Progress uses meaningful labels and completion states rather than fabricated percentages.
- Motion connects stages through consistent direction and short easing, without delaying input.

## Safe redesign boundary

The shell, responsive composition, progress presentation, typography, spacing, card/input surfaces, feedback states, and transition layer can be replaced. The state machine, route structure, server/client ownership, mutations, validation, persistence, entitlements, completion semantics, and redirect behavior remain unchanged.

