# Product

<!-- impeccable:product-schema 1 -->

> Current product reference as of 20 September 2026. For implementation status and system boundaries, see [Project status](docs/PROJECT_STATUS.md) and [Architecture](docs/ARCHITECTURE.md).

## Platform

web

## Users

Align serves international and UK-based early-career job seekers who want help understanding role fit, improving applications, and navigating employability constraints. It has especially strong value for international candidates who may need clear sponsorship guidance.

## Product Purpose

Align helps job seekers build an accurate career profile, understand how well opportunities fit their experience and constraints, and improve the applications they submit. Onboarding succeeds when a user reaches a trustworthy, usable Career Profile that can immediately power matching and application guidance.

## Positioning

Align combines a candidate's real experience with practical employability context, including sponsorship considerations where relevant, so recommendations account for both capability fit and real-world eligibility.

## Operating Context

Users may begin from an existing CV or build their profile manually. They may be uncertain about role fit, application quality, or sponsorship constraints and need concise guidance without being made to feel inexperienced.

## Capabilities and Constraints

- The onboarding state machine, manual flow, CV-import flow, validation, server-side checks, persistence, database structure, profile ownership, completion logic, redirects, and resume/re-entry behavior are established product behavior and must be preserved.
- A Career Profile represents a specific career direction and holds the user's relevant experience, education, skills, and employability context.
- Onboarding supports both CV-assisted profile creation and manual profile creation.
- Product guidance must not imply that sponsorship or eligibility is guaranteed.

## Implemented Product Areas

- **Career Profile:** structured, reusable candidate evidence with multiple career directions and practical employability facts.
- **ATS Analysis:** deterministic document checks combined with schema-constrained AI feedback and versioned history.
- **Job Match:** requirement-level comparison against a selected profile, including evidence mapping, gaps, and rewrite strategy.
- **CV Generation:** evidence-backed DOCX generation and regeneration with provenance validation and private downloads.
- **Job Intelligence:** multi-provider UK job discovery, saved jobs, company views, job descriptions, sponsor evidence, and matching hand-off.
- **Account Lifecycle:** credential and Google authentication, verification, lifecycle email, password/session controls, billing, and deliberate deletion.
- **Commercial Access:** Free and Pro entitlements, usage limits, retention rules, reservations, and Stripe-backed subscription state.

## Trust Boundaries

- User-confirmed evidence is authoritative. AI output may organise, compare, or rewrite it but must not create unsupported claims.
- Provider job data and sponsor-register matches carry source and freshness context.
- Align does not guarantee employment, interviews, salary, sponsorship, immigration eligibility, or ATS outcomes.
- Checkout completion alone does not grant Pro access; signed billing events determine effective access.
- Raw CVs and generated documents are private user data and must not be exposed through public object URLs.

## Brand Commitments

- Product name: Align.
- Voice: intelligent, confident, calm, respectful, and concise.
- The interface should feel like serious career infrastructure rather than a playful AI assistant.

## Evidence on Hand

- Existing application code and onboarding flows in `src/features/onboarding`.
- Existing design tokens and UI primitives in `src/app/globals.css` and `src/shared/components/ui`.
- Historical onboarding research is summarised in `docs/ONBOARDING_UX_AUDIT.md`; local reference media is not a repository dependency.
- No customer testimonials, benchmarks, or commercial claims were provided and none should be fabricated.

## Product Principles

- Reach a useful, truthful Career Profile quickly.
- Explain practical constraints clearly without overwhelming or patronising users.
- Preserve user agency through explicit choices and review before persistence.
- Treat international-candidate needs as first-class while keeping the experience natural for UK-based candidates.
- Prefer clarity and confidence over ceremony.

## Accessibility & Inclusion

The onboarding must support keyboard and assistive-technology use, visible focus, semantic forms, understandable errors, sufficient contrast, reduced motion, and large touch targets. Language around eligibility and sponsorship should be precise, non-alarmist, and inclusive.
