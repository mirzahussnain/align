# Reservation & reliability — smoke checklist

Repeatable local verification for the reservation/reliability programme (Stage 3).
No real paid provider calls are required — use a local dev account and, where an
AI provider would be hit, either a controlled fixture analysis or an
intentionally-unconfigured provider (leave `GEMINI_API_KEY`/`GROQ_API_KEY` empty
to force a deterministic provider failure).

## Prerequisites

```bash
npm run dev:up          # local Postgres + MinIO
npm run db:deploy       # apply migrations (includes capability_reservation)
npm run dev             # app on http://localhost:3000
```

Sign in with a local development account in the browser, then copy the session
cookie for API calls:

```bash
# From browser devtools → Application → Cookies. Better-Auth session cookie.
export COOKIE='better-auth.session_token=...'
export BASE=http://localhost:3000
```

A stable operation id makes a retry idempotent; a fresh one starts a new logical
operation:

```bash
OP=$(uuidgen)
```

## A. Authenticated API smoke

| # | Check | How | Expected |
|---|-------|-----|----------|
| 1 | Deterministic ATS is unmetered | `POST /api/analyze` mode=ats while AI quota is exhausted | 200, body `aiSkipped:"quota"`, no reservation row created for that op |
| 2 | AI ATS reserve/commit | `POST /api/analyze` mode=ats with quota available | 200; one `capability_reservation` row COMMITTED for `ai_enhanced_ats_analysis` |
| 3 | Job-match independent quota | Exhaust `ai_enhanced_ats_analysis`, then `POST /api/analyze` mode=job_match | job match still allowed (separate quota) |
| 4 | Operation-in-progress | Fire two concurrent `POST /api/analyze` with the SAME `x-operation-id` | one 200, the other 409 `OPERATION_IN_PROGRESS` |
| 5 | Fingerprint conflict | Reuse a committed `x-operation-id` with a DIFFERENT file/JD | 409 `OPERATION_CONFLICT` |
| 6 | Provider failure release | Empty `GEMINI_API_KEY`+`GROQ_API_KEY`, `POST /api/analyze` mode=job_match | 502 `AI_OPERATION_FAILED` reason `provider_unavailable`, reservation RELEASED, no charge |
| 7 | Truthfulness failure release | Force a rewrite that fails validation | 422, reservation RELEASED, nothing persisted/charged |
| 8 | Committed analysis recovery | Re-`POST /api/analyze` with a committed `x-operation-id` | 200, same `analysisId`, model NOT re-run, no second charge |
| 9 | Committed CV recovery | Re-`POST /api/cv/regenerate` with a committed `x-operation-id` | 200 DOCX re-streamed, not regenerated |
| 10 | Result-unavailable | Delete the committed analysis row, re-`POST /api/analyze` with its op-id | 409 `AI_OPERATION_FAILED`/`RESULT_UNAVAILABLE`, still charged |
| 11 | Non-double-charged CV repair | `POST /api/cv/regenerate` with header `x-repair-of: <committed op-id>` and a fresh `x-operation-id` | 200 DOCX; a repair row (`repairOfOperationId` set) COMMITTED; `countActiveUsage` unchanged |
| 12 | Reconciliation no-AI vs AI | `POST /api/cv/profile-bridge` (reconcile) that does/doesn't reach the provider | usage increments only when `usedAI` |
| 13 | HITL retry no duplicate | `POST /api/profile-evidence` twice with the SAME `x-operation-id` | second call returns the SAME record, no duplicate row, single charge |
| 14 | Profile-only generation unmetered | `POST /api/cv/from-profile` | no `cv_regeneration` reservation |

Example (check 2 → 8, committed recovery):

```bash
# First run — commits one unit
curl -sS -X POST "$BASE/api/analyze" -H "Cookie: $COOKIE" -H "x-operation-id: $OP" \
  -F mode=ats -F file=@fixtures/sample-cv.pdf | jq '.analysisId'

# Retry with the SAME op-id — recovers, no re-run, no second charge
curl -sS -X POST "$BASE/api/analyze" -H "Cookie: $COOKIE" -H "x-operation-id: $OP" \
  -F mode=ats -F file=@fixtures/sample-cv.pdf | jq '.analysisId'
```

Inspect the ledger directly:

```bash
npm run db:studio      # capability_reservation: status, operationStatus, resultRef, repairOfOperationId
```

### Usage aggregate reconciliation (Stage 3.8)

`src/shared/services/reservation-reconciliation.ts` rebuilds `UsageCounter` from
committed reservations. In a dev REPL / test:

```ts
import { reconcileUsage, repairUsageDrift } from '@/shared/services/reservation-reconciliation';
await reconcileUsage(userId, '2026-07');       // { expected, actual, delta, hasDrift }
await repairUsageDrift(userId, '2026-07');      // dev/admin only; overwrites the derived counter
```

Quota enforcement never depends on `UsageCounter` — it counts committed + active
reservations directly — so reconciliation is diagnostic only.

## B. Browser smoke / manual UI checklist

Automated browser tooling is not wired into this repo. Run the following by hand
(or with Playwright if available); capture a screenshot on any failure.

- [ ] **Entitlement modal** opens for a genuine plan/quota block (exhaust
      `cv_regeneration` on FREE, then generate) — central upgrade modal, not an
      inline error.
- [ ] **Operation-in-progress** shows "This request is already being processed."
      and does NOT open the upgrade modal (double-submit the wizard fast).
- [ ] **Retryable failure** (provider down) says "…You were not charged. Please
      try again." — no provider name, no stack trace.
- [ ] **Result-unavailable** for a generated CV shows the repair copy and a
      "Recover my CV" button; clicking it re-requests with `x-repair-of` and a
      fresh operation id.
- [ ] **Retry keeps the same logical operation id** (network-retry the analyze
      call without changing inputs → no duplicate analysis, no second charge).
- [ ] **Recovered success** silently re-opens/downloads the stored result.
- [ ] **HITL retry** (approve the same evidence twice) does not create duplicate
      UI entries or duplicate profile/application records.

Report format: check ✅/❌ per item; attach a screenshot/trace for each ❌.
