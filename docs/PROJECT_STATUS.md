# Project status

> Current implementation snapshot: 20 September 2026.

Align is feature-complete across its main product journeys but is still in the production-readiness phase. The application code supports a full deployment; external services, live credentials, database migration, and production smoke validation remain deployment responsibilities.

## Implemented

### Platform foundation

- Next.js App Router application with public, authentication, onboarding, dashboard, and settings route groups.
- PostgreSQL/Prisma persistence and migration history.
- MinIO-compatible local storage and Cloudflare R2 production contract.
- Distributed Upstash rate limiting and a separate Redis job-board cache.
- Central product policies, plan entitlements, usage counters, and retry-safe capability reservations.

### Identity and account lifecycle

- Credential signup/login, Google OAuth, email verification, forgot/reset password, and session revocation.
- Branded Resend messages for verification, welcome, password reset/change, and deletion confirmation.
- Retry-safe welcome delivery.
- Account, billing, and security settings within the dashboard shell.
- Deliberate account deletion with subscription blocking and owned-storage cleanup.

### Career profile and onboarding

- Manual and CV-assisted onboarding with durable resume/re-entry state.
- Multiple career profiles governed by plan limits.
- Structured experience, project, education, skill, practical-fact, and supporting-evidence records.
- CV-import proposal review and explicit confirmation before profile persistence.
- Optional local ESCO taxonomy import for skill suggestions.

### Analysis and application tooling

- Deterministic ATS checks plus schema-constrained AI feedback.
- Versioned ATS and job-match analysis domains.
- Evidence-aware job matching and profile snapshots.
- CV generation/regeneration with provenance checks, bounded repair, DOCX output, and private storage.
- Anonymous public ATS demo with abuse protection.

### Job and company intelligence

- Adzuna, Reed, and Jooble provider adapters and normalisation.
- Redis-backed result caching, merged search sessions, continuation, and refresh locking.
- Durable job snapshots, descriptions, saved jobs, companies, ATS sources, and sponsor history.
- GOV.UK sponsor-register discovery and indexed organisation matching.
- Job-to-profile match preparation and persisted requests.

### Billing

- Provider-neutral billing domain with Stripe checkout, portal, cancellation, and signed webhooks.
- Purchase convergence and replay-safe webhook receipts.
- A single launch offer, Pro Monthly, connected to the central entitlement registry.
- Billing and usage presentation driven by effective access rather than client claims.

## Required before production launch

1. Provision production PostgreSQL, R2, Upstash REST rate limiting, TCP Redis, Resend, Gemini, job providers, Google OAuth, and Stripe.
2. Configure all production variables documented in [Deployment](./DEPLOYMENT.md).
3. Verify the Resend sending domain and Google callback origin.
4. Create the Stripe product/price and webhook endpoint.
5. Apply Prisma migrations through the unpooled database URL.
6. Run `npm run check:env` and `npm run check:env:live` against production configuration.
7. Run the full test, typecheck, and production-build gates.
8. Complete authenticated browser smoke tests for signup/email, onboarding, uploads, analysis, jobs, checkout, portal, and deletion.

## Deliberate boundaries

- Two-factor authentication is not implemented.
- Align does not guarantee employment, salary, sponsorship, visa eligibility, or ATS outcomes.
- ESCO is a local import, not a runtime external service.
- Redis job-search data is a disposable cache; PostgreSQL holds durable state.
- There is no general-purpose background-worker or cron subsystem. Cleanup and reconciliation are request-driven or explicitly invoked.
- Historical audits and plans describe the state and decisions at their date; they are not the current architecture reference.

## Current references

- [Architecture](./ARCHITECTURE.md)
- [Deployment](./DEPLOYMENT.md)
- [Product](../PRODUCT.md)
- [Design system](../DESIGN.md)
- [Object storage](./deployment/object-storage.md)
- [Reservation smoke checklist](./RESERVATION_SMOKE.md)
- [Golden CV review](./STAGE4_GOLDEN_CV_REVIEW.md)
