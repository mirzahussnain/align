# Product

<!-- impeccable:product-schema 1 -->

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

## Brand Commitments

- Product name: Align.
- Voice: intelligent, confident, calm, respectful, and concise.
- The interface should feel like serious career infrastructure rather than a playful AI assistant.

## Evidence on Hand

- Existing application code and onboarding flows in `src/features/onboarding`.
- Existing design tokens and UI primitives in `src/app/globals.css` and `src/shared/components/ui`.
- A user-provided onboarding reference video at `C:\Users\Hussnain Ali\Downloads\large-thumbnail20250212-991569-x0npjq.mp4`, supplied for pacing and interaction principles only.
- No customer testimonials, benchmarks, or commercial claims were provided and none should be fabricated.

## Product Principles

- Reach a useful, truthful Career Profile quickly.
- Explain practical constraints clearly without overwhelming or patronising users.
- Preserve user agency through explicit choices and review before persistence.
- Treat international-candidate needs as first-class while keeping the experience natural for UK-based candidates.
- Prefer clarity and confidence over ceremony.

## Accessibility & Inclusion

The onboarding must support keyboard and assistive-technology use, visible focus, semantic forms, understandable errors, sufficient contrast, reduced motion, and large touch targets. Language around eligibility and sponsorship should be precise, non-alarmist, and inclusive.
