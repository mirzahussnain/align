# Account Lifecycle v1 Design

## Summary

Align will add account lifecycle management while retaining Better Auth as the sole authentication authority. Better Auth owns email verification, password reset and change, sessions, recent-session checks, and final user deletion. Align owns pure product policies, branded Resend delivery, capability verification enforcement, settings presentation, billing-state evaluation, and private-object cleanup.

The implementation does not add Supabase Auth or 2FA, and it does not change Stripe pricing, products, checkout, portal, webhooks, entitlement values, or cancellation semantics.

## Existing Architecture Findings

- The application uses Next.js 16.2.6 App Router, React 19.2.4, Better Auth 1.6.23, Prisma 7.8.0 with PostgreSQL, and Vitest.
- Better Auth already persists `User`, `Account`, `Session`, and `Verification` through the Prisma adapter.
- Better Auth 1.6.23 supports verification callbacks, password reset callbacks, password changes, session listing and revocation, deletion hooks, recent-session checks, and custom rate-limit storage.
- Google user information maps Google's verified `email_verified` claim to `User.emailVerified`.
- Upstash Redis already backs application rate limiting.
- R2 and MinIO share one S3-compatible storage abstraction with separate uploads, rewrites, and avatar buckets.
- Stored CVs, upload intents, legacy CV revisions, generated CVs, and avatars contain user-owned object keys that must be cleaned before deletion.
- All direct `User` relations use `onDelete: Cascade`; indirect relations either cascade through their parent or use `SetNull` where historical shared records can survive.
- Billing state is resolved through the provider-neutral billing access service. Existing portal and cancellation behavior must remain unchanged.
- The baseline suite passed before implementation: 179 test files and 1,803 tests passed; 8 files and 80 tests were skipped.

## Architectural Boundaries

The implementation follows this dependency direction:

```text
Policy
  -> pure decision, limit, or product rule

Service
  -> obtains authoritative state and enforces policy

Repository / Prisma
  -> persistence

Provider adapter
  -> external API mechanics

Route / Server Action
  -> authentication, validation, and delegation
```

Better Auth configuration remains small. It wires lifecycle callbacks to focused Align services but does not contain email markup, billing queries, storage enumeration, or deletion orchestration.

## Product Policy Layer

`src/shared/policies` becomes the focused home for genuine Align product rules. It will initially contain only modules backed by existing or newly approved rules:

- `account-deletion.ts`: converts an authoritative billing snapshot into an account-deletion decision.
- `email-verification.ts`: defines provider-backed capabilities that require a verified email.
- `analysis.ts`: owns analysis input, evidence, HITL, and contextual payload ceilings currently mixed with runtime configuration.
- `uploads.ts`: owns supported user-upload formats and CV/avatar size limits.
- `retention.ts`: owns anonymous-result, upload-intent, abandoned-request, and stale-job lifetimes. Source-CV retention continues to derive its plan-specific value from the entitlement registry.
- `index.ts`: exposes intentional policy APIs.

No empty `usage.ts` or `jobs.ts` module will be created. Analysis versions, AI provider names, timeouts, SDK configuration, secrets, environment variables, Stripe identifiers, bucket names, Redis connections, Prisma queries, and HTTP response construction remain outside policies. Plan quotas and entitlement periods remain defined only in the entitlement registry.

Unused or duplicate retention constants that do not describe implemented behavior will be removed rather than exposed as product promises.

## Email Delivery and Templates

One server-only Resend service owns transactional delivery. It reads `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, defaults documented configuration to `Align <noreply@align.vyndra.tech>`, passes both HTML and plain-text bodies, maps provider failures to safe internal errors, and never logs tokens or lifecycle URLs.

All lifecycle templates share one table-based, inline-style Align email shell suitable for Gmail and Outlook. It uses a restrained text wordmark, accessible contrast, a clear CTA, a fallback URL where applicable, concise security context, and a simple footer. No JavaScript, Tailwind runtime, remote imagery, or email framework is required.

Templates and subjects:

- `Verify your Align email` with **Verify email**.
- `Welcome to Align` with **Go to your workspace**.
- `Reset your Align password` with **Reset password**.
- `Your Align password was changed` as a security notice.
- `Your Align account has been deleted` as a final confirmation.

Verification and password reset sends are part of the requested Better Auth operation. Welcome, password-changed, and account-deleted notification failures are best-effort and never undo a completed auth action.

## Welcome Email Idempotency

`User.welcomeEmailSentAt DateTime?` is added through a forward Prisma migration and exposed to Better Auth as a server-only additional user field where required.

The welcome service uses a per-user PostgreSQL advisory transaction lock:

1. acquire the user's welcome-email lock;
2. read `welcomeEmailSentAt`;
3. return when already set;
4. send with the stable Resend idempotency key `welcome/<userId>`;
5. set `welcomeEmailSentAt` only after Resend accepts delivery;
6. roll back without marking sent when delivery fails.

The database lock collapses concurrent application attempts. Resend's idempotency key protects ambiguous retries during its 24-hour idempotency window. Credential users enter this service after successful verification. A narrow Better Auth after-hook observes successful Google OAuth sessions and calls the same service; repeat logins become no-ops.

## Email Verification

Credential signup calls Better Auth with a same-origin `/verify-email` callback. Better Auth creates the account and session, sends its signed verification URL through the Align email service, and the UI moves to an awaiting-verification state. Users may resend from that state or Account settings.

Better Auth handles token validation and expiry. The landing page presents verified, already-verified, invalid, and expired states without exposing token contents. Resend behavior is enumeration-safe for unauthenticated callers and rate-limited.

Credential users may sign in and access onboarding and account settings while unverified. Google users trust the verified provider state Better Auth derives from Google's signed identity token and do not enter a redundant Align verification flow.

## Verification Capability Guard

The email-verification policy is capability-based, never route-based. It covers provider-backed work including AI-enhanced ATS, Job Match, profile/CV reconciliation, CV tailoring and regeneration, evidence assistance, and future enabled provider-backed generation capabilities.

A centralized service guard loads the user verification state and throws a stable `EMAIL_VERIFICATION_REQUIRED` product error. Services invoke it before quota reservation, provider invocation, source processing that exists only for the expensive operation, or other billable work. Direct API calls therefore cannot bypass the UI.

Deterministic ATS remains available. An unverified credential user may receive deterministic analysis but cannot reserve or invoke the AI enhancement.

## Forgot and Reset Password

The public Forgot Password page calls Better Auth's request-password-reset API with the same-origin `/reset-password` destination. The UI always displays:

> If an account exists for that email, we've sent password reset instructions.

It does so for known, unknown, disabled, verified, unverified, and Google-only accounts, including provider-delivery failure. The Better Auth reset callback sends only when the account has a credential provider; Google-only accounts do not receive a reset link and do not implicitly gain a password.

Better Auth owns expiring, single-use reset tokens, password validation, hashing, and token consumption. A successful reset revokes the user's existing sessions and displays a success state linking to login. Invalid, expired, and reused tokens share a safe invalid-link state. The successful reset callback triggers the best-effort password-changed notification.

## Change Password and Sessions

Credential users change their password with Better Auth using current password, new password, confirmation, and `revokeOtherSessions: true`. Align performs client-side confirmation validation for UX while Better Auth remains authoritative for the current password, password bounds, hashing, and session revocation.

A Better Auth after-hook observes successful password changes and sends the best-effort security notification. Google-only users see “You sign in with Google” instead of a misleading password form.

Security settings use Better Auth's session APIs to list active sessions, revoke a selected non-current session, and revoke all other sessions. The UI presents only useful metadata such as current status, creation/expiry time, and parsed device context; it does not build a detailed device-management product.

## Better Auth Distributed Rate Limiting

Better Auth 1.6.23's supported `customStorage` interface will be backed by the existing Upstash Redis client. The adapter implements atomic consumption and the required compatibility reads/writes without adding a second Redis abstraction.

Modest endpoint-specific rules protect signup, verification resend, password-reset requests and attempts, password changes, session-sensitive actions, and deletion. Align-owned routes continue using the existing application limiter and its production fail-closed behavior. When Upstash is absent locally, Better Auth may use its local fallback; production environment validation already requires Upstash.

## Settings Information Architecture

Settings is route-backed:

- `/dashboard/settings/account`
- `/dashboard/settings/billing`
- `/dashboard/settings/security`
- `/dashboard/settings/privacy`
- `/dashboard/settings` redirects to Account.

The main dashboard sidebar gains a Settings link. A dedicated responsive Settings layout combines the existing dashboard visual language with secondary navigation for Account, Billing & Subscription, Security, and Data & Privacy.

The onboarding exemption is explicit and narrow. The Settings route tree uses an auth-only layout at a separate route-group branch that resolves only `/dashboard/settings/**`. Existing workspace routes remain under the current onboarding-protected dashboard layout; the broad guard is not weakened.

### Account

Account shows display name editing through Better Auth, immutable email display, verified/unverified badge, verification resend, linked sign-in methods, creation date, and the deletion danger zone. It does not duplicate Career Profile editing or introduce email changing.

### Billing & Subscription

Billing reuses the existing billing status, storage-usage, checkout, and Billing Portal services/components. It displays effective plan, status, paid-through/access-end state, cancellation-at-period-end state, existing usage summaries, portal management, and the existing upgrade action. It does not change cancellation behavior or commercial configuration.

### Security

Security contains the credential password form or Google-only explanation, verified-email state, active sessions, individual revocation where useful, and “Sign out of other sessions.” There is no 2FA control or placeholder.

### Data & Privacy

Data & Privacy states only implemented behavior: private CV/document storage, entitlement-derived source-CV retention, generated-CV allowance/pruning behavior, history retention, earlier object expiry, and what deletion removes. It makes no GDPR, certification, legal, or unimplemented retention claims.

## Account Deletion Policy

The pure policy accepts a safe authoritative billing projection and returns:

```ts
type AccountDeletionDecision =
  | { status: 'allowed' }
  | {
      status: 'blocked_active_subscription'
      paidThrough: Date | null
    }
```

Any currently active paid access blocks deletion, including a subscription with `cancelAtPeriodEnd: true`. The decision carries the paid-through date when known. Terminal, expired, or Free state permits deletion.

The service handles this union exhaustively so a future `{ status: 'pending_deletion'; finalizeAfter: Date }` policy result can be introduced without relocating billing, storage, or persistence behavior. `pending_deletion` is not implemented or shown in v1.

## Account Deletion Entry Point

One Align-owned POST endpoint exists because Better Auth's native delete payload cannot enforce the required typed confirmation. It validates a strict Zod payload containing `confirmation: 'DELETE'` and an optional password, obtains the authoritative session, derives the user ID only from that session, applies the account-action limiter, establishes an in-process deletion authorization context, and calls Better Auth's native `deleteUser` API.

The authorization context uses Node `AsyncLocalStorage` with an internal symbol/value and the authenticated user ID. It cannot be created from headers, cookies, form values, or other request-controlled data. Better Auth's `beforeDelete` hook rejects raw `/api/auth/delete-user` attempts that did not originate inside this trusted context.

Align does not verify credential passwords separately. Better Auth verifies the supplied current password. Google-only deletion relies on Better Auth's default recent-session check. The UI maps Better Auth's stale-session error to a clear reauthentication action rather than a generic failure.

## Authoritative Deletion Service

Immediately before any destructive cleanup, Better Auth's `beforeDelete` hook calls one authoritative service with the authenticated user supplied by Better Auth. The service:

1. confirms the trusted in-process deletion authorization and matching user ID;
2. resolves current billing through the existing billing access service;
3. applies the pure deletion policy;
4. throws `ACTIVE_SUBSCRIPTION_BLOCKS_DELETION` with only safe `paidThrough` and presentation state when blocked;
5. enumerates exact user-owned object keys from Prisma and trusted server key derivation;
6. deduplicates keys and deletes each through the correct uploads, rewrites, or avatars storage target;
7. treats an already-missing object as success;
8. aborts before database deletion if any storage operation reports failure;
9. returns control to Better Auth, which deletes the user and sessions.

No client-supplied user ID, storage key, provider ID, subscription ID, or callback URL reaches the service. No subscription cancellation occurs. The blocked UI directs users to the existing Billing Portal and, for `cancelAtPeriodEnd`, explains that deletion becomes available after paid access ends.

Object sources include:

- `CvRevision.sourceObjectKey` in uploads;
- `StoredCv.storageKey` in uploads;
- `CvUploadIntent.objectKey` in uploads;
- `GeneratedCV.fileKey` in rewrites;
- the avatar key parsed only when it matches the configured public avatar base and expected user namespace, otherwise derived from trusted user storage conventions where possible.

Storage deletion is practically retry-safe: exact deletes are idempotent, missing objects succeed, and the user row is retained unless every delete succeeds. Database deletion then relies on audited cascades. A rare database failure after successful object cleanup leaves the account row available for the same deletion request to retry; the objects are already safely absent.

Better Auth's `afterDelete` hook receives the pre-deletion user value and sends the final confirmation from process memory. It does not persist a deleted-user email record, and delivery failure does not roll back deletion.

## Error and Security Model

- All user identity is session-derived.
- Public reset responses are enumeration-safe.
- Redirect destinations are fixed same-origin paths.
- Tokens, passwords, lifecycle URLs, and provider errors are never logged.
- Verification gating occurs before expensive work.
- Deletion requires authentication, deliberate confirmation, Better Auth password or recent-session enforcement, a trusted in-process marker, and an immediate billing re-check.
- Raw storage keys and billing identifiers never reach the client.
- Stable product errors include `EMAIL_VERIFICATION_REQUIRED`, `ACTIVE_SUBSCRIPTION_BLOCKS_DELETION`, and existing rate-limit codes.
- Email failures cannot undo completed verification, password mutation, OAuth creation, or account deletion.

## Environment and Deployment

`.env.example` and `scripts/check-env.mts` gain `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. They are optional for local non-email work and required in production because credential verification and reset are enabled. Lifecycle URLs derive from the existing Better Auth/application URL configuration.

`package.json` gains `postinstall: prisma generate`. It does not run migrations. Generated Prisma output remains ignored and uncommitted. Validation removes only the generated client output, runs the equivalent clean install generation path, and completes a production build.

Docker Compose topology remains unchanged. Automated tests inject or mock email delivery and never send real messages.

## Testing Strategy

Implementation follows red-green-refactor cycles with focused unit, component, route, and integration tests.

Coverage includes:

- pure account-deletion, verification, analysis, upload, and retention policies;
- credential verification send, valid/invalid/expired callback states, resend, already-verified behavior, and rate limiting;
- deterministic ATS availability plus pre-reservation/provider rejection of protected work;
- Google verified-email behavior;
- branded rendering, CTA and text fallback for every email;
- welcome timing, concurrency collapse, retry after delivery failure, and no repeat on later login;
- enumeration-safe forgot password and no Google-only credential creation;
- valid, invalid, expired, and reused password-reset behavior;
- credential password change, wrong password, validation, other-session revocation, and security notification;
- Google-only password UI and session controls;
- Settings navigation and account/billing/security/privacy states;
- unauthenticated deletion, missing confirmation, raw Better Auth endpoint bypass, cross-user resistance, stale Google session, and rate limiting;
- authoritative billing re-check for Free, terminal, active, and cancellation-at-period-end states;
- Stored CV, generated CV, upload-intent, legacy source, and avatar cleanup;
- missing-object success, partial storage failure, retry, cascade cleanup, session revocation, and final email behavior;
- unchanged billing portal/status integration.

Final validation runs focused lifecycle tests, the full test suite, typecheck, lint, production build, Prisma validate/generate, migration deploy/status when the local database is available, environment checks, the clean generated-client rebuild, and `git diff --check`. Results are reported exactly as executed.

## Commit Structure

Implementation will use small logical commits, expected to cover:

- product policy layer consolidation;
- branded Resend lifecycle email boundary;
- Better Auth verification and password lifecycle;
- centralized verification capability enforcement;
- Settings workspace;
- safe account deletion;
- focused lifecycle tests;
- isolated Prisma postinstall deployment fix.
