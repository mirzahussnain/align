# Align documentation

Start with the current references below. Files labelled historical preserve the reasoning and state that existed when a programme began; they are not present-state specifications.

## Current references

| Document | Purpose |
| --- | --- |
| [Project status](./PROJECT_STATUS.md) | Implemented capabilities, launch work, and deliberate boundaries |
| [Architecture](./ARCHITECTURE.md) | Route, domain, data-flow, infrastructure, and security architecture |
| [Production deployment](./DEPLOYMENT.md) | Environment variables, provider setup, release sequence, and operations |
| [Product](../PRODUCT.md) | Audience, positioning, product principles, and trust boundaries |
| [Design system](../DESIGN.md) | Visual tokens, components, layout, and interaction conventions |
| [Object storage](./deployment/object-storage.md) | R2/MinIO privacy and upload CORS runbook |
| [ESCO skills](./ESCO_SKILLS.md) | Optional local taxonomy import and evidence semantics |

## Verification runbooks

| Document | Purpose |
| --- | --- |
| [Reservation smoke tests](./RESERVATION_SMOKE.md) | Metered-operation idempotency, concurrency, and reconciliation |
| [Golden CV review](./STAGE4_GOLDEN_CV_REVIEW.md) | Deterministic DOCX generation and human review boundary |

## Historical records

- [Job Board Stage A audit](./JOB_BOARD_STAGE_A_AUDIT.md)
- [Onboarding UX audit](./ONBOARDING_UX_AUDIT.md)
- [Pre-deployment hardening design](./superpowers/specs/2026-09-13-predeploy-p1-hardening-design.md)
- [Pre-deployment hardening plan](./superpowers/plans/2026-09-13-predeploy-p1-hardening.md)
- [Account lifecycle design](./superpowers/specs/2026-09-14-account-lifecycle-design.md)
- [Account lifecycle plan](./superpowers/plans/2026-09-14-account-lifecycle.md)

## Documentation rules

- Update `PROJECT_STATUS.md` when a product area moves between planned, implemented, and launch-ready.
- Update `ARCHITECTURE.md` when system boundaries, durable data ownership, or provider flows change.
- Update `DEPLOYMENT.md` and `.env.example` together whenever an environment variable is added or its production requirement changes.
- Preserve dated audits, designs, and plans; add a status banner or a superseding link instead of rewriting their original rationale.
- Do not embed secrets, private CV data, local absolute paths, or unsupported commercial claims.
