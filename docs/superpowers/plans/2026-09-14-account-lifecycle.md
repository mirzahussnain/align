# Account Lifecycle v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add verified-email, password, session, settings, and subscription-safe account-deletion lifecycle features while keeping Better Auth and existing billing registries authoritative.

**Architecture:** Pure product decisions live in `src/shared/policies`; focused server services obtain authoritative state and enforce them. Better Auth owns authentication mutations and final user deletion, while Align supplies branded email delivery, capability gates, settings UI, billing checks, and storage cleanup through narrow callbacks and one deliberate deletion endpoint.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, Better Auth 1.6.23, Prisma 7.8/PostgreSQL, Resend, Upstash Redis, S3-compatible R2/MinIO, Zod 4, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-account-lifecycle-design.md`

## Global Constraints

- Better Auth 1.6.23 remains the only authentication authority; do not add Supabase Auth or 2FA.
- Do not change Stripe pricing, products, webhooks, entitlement architecture, or cancellation semantics.
- Never cancel a subscription during deletion; currently active paid access always blocks deletion.
- Keep the onboarding exemption limited to `/dashboard/settings/**`; all other `/dashboard/**` routes retain the existing guard.
- Use the existing Upstash client, billing resolver/portal, storage abstraction, error conventions, entitlement registry, and UI primitives.
- Policies contain product rules only: no Prisma, providers, secrets, environment access, HTTP responses, or duplicated plan limits.
- All identity and storage keys are server-derived. Email delivery must never log passwords, tokens, lifecycle URLs, or provider errors.
- Follow red-green-refactor for every task and commit only after its focused tests pass.

---

### Task 1: Centralize Product Policies

**Files:**
- Create: `src/shared/policies/account-deletion.ts`
- Create: `src/shared/policies/email-verification.ts`
- Create: `src/shared/policies/analysis.ts`
- Create: `src/shared/policies/uploads.ts`
- Create: `src/shared/policies/retention.ts`
- Create: `src/shared/policies/index.ts`
- Create: `src/shared/policies/__tests__/account-deletion.test.ts`
- Create: `src/shared/policies/__tests__/email-verification.test.ts`
- Create: `src/shared/policies/__tests__/product-rules.test.ts`
- Modify: `src/shared/config/analysis-domain.ts`
- Modify: `src/shared/services/cv-extraction/formats.ts`
- Modify: `src/shared/services/cv-upload-intent.ts`
- Modify: `src/shared/services/retention-service.ts`
- Modify: callers importing moved constants

**Interfaces:**
- Produces: `decideAccountDeletion(snapshot): AccountDeletionDecision`, `requiresVerifiedEmail(capability): boolean`, `ANALYSIS_LIMITS`, `REGENERATION_CONTEXT_LIMITS`, `UPLOAD_POLICY`, and `RETENTION_POLICY`.
- Preserves: `ANALYSIS_VERSIONS` and `AI_BOUNDS` in runtime configuration and all plan limits in the entitlement registry.

- [ ] **Step 1: Write failing pure-policy tests**

```ts
expect(decideAccountDeletion({ effectivePlan: 'FREE', paidAccessActive: false, paidThrough: null }))
  .toEqual({ status: 'allowed' });
expect(decideAccountDeletion({ effectivePlan: 'PRO', paidAccessActive: true, paidThrough }))
  .toEqual({ status: 'blocked_active_subscription', paidThrough });
expect(decideAccountDeletion({ effectivePlan: 'PRO', paidAccessActive: true, paidThrough, cancelAtPeriodEnd: true }))
  .toEqual({ status: 'blocked_active_subscription', paidThrough });
expect(requiresVerifiedEmail('ats_analysis')).toBe(false);
expect(requiresVerifiedEmail('ai_enhanced_ats_analysis')).toBe(true);
expect(UPLOAD_POLICY.cv.maxBytes).toBe(10 * 1024 * 1024);
```

- [ ] **Step 2: Run the new tests and confirm missing-module failures**

Run: `npx vitest run src/shared/policies/__tests__`
Expected: FAIL because `@/shared/policies` does not exist.

- [ ] **Step 3: Implement the pure contracts and move existing rules**

```ts
export type AccountDeletionDecision =
  | { status: 'allowed' }
  | { status: 'blocked_active_subscription'; paidThrough: Date | null };

export function decideAccountDeletion(input: AccountDeletionBillingSnapshot): AccountDeletionDecision {
  return input.paidAccessActive
    ? { status: 'blocked_active_subscription', paidThrough: input.paidThrough }
    : { status: 'allowed' };
}

export const VERIFIED_EMAIL_CAPABILITIES = new Set<ProductCapability>([
  'ai_enhanced_ats_analysis', 'job_match_analysis', 'profile_reconciliation',
  'cv_import_reconciliation', 'tailored_cv_generation', 'cv_regeneration',
  'human_evidence_capture',
]);
```

Move the current analysis/regeneration ceilings, PDF/DOCX upload rules, 10 MiB CV limit, 4 MiB direct multipart limit, 5 MiB avatar limit, anonymous-demo lifetime, stale-job lifetime, abandoned-request lifetime, and upload-intent state lifetimes. Remove duplicate Free/Pro source-retention and unused generated-CV promises; source retention continues through `source_file_retention` entitlements.

- [ ] **Step 4: Update imports and run policy plus affected tests**

Run: `npx vitest run src/shared/policies src/shared/services/__tests__/retention-service.test.ts src/shared/services/__tests__/cv-upload-intent.test.ts src/shared/services/cv-extraction/__tests__ src/shared/services/__tests__/public-ats-upload-limits.test.ts`
Expected: PASS with unchanged behavioral values.

- [ ] **Step 5: Commit**

```bash
git add src/shared/policies src/shared/config/analysis-domain.ts src/shared/services
git commit -m "refactor: centralize product policies"
```

### Task 2: Add Branded Transactional Email Delivery

**Files:**
- Create: `src/shared/email/resend.ts`
- Create: `src/shared/email/templates/shell.ts`
- Create: `src/shared/email/templates/lifecycle.ts`
- Create: `src/shared/email/__tests__/templates.test.ts`
- Create: `src/shared/email/__tests__/resend.test.ts`
- Modify: `package.json`, `package-lock.json`, `.env.example`, `scripts/check-env.mts`

**Interfaces:**
- Produces: `sendLifecycleEmail({ to, template, idempotencyKey? }): Promise<void>` and template factories returning `{ subject, html, text }`.

- [ ] **Step 1: Write failing render and adapter tests**

```ts
const email = verificationEmail({ name: 'Ada', url: 'https://align.test/verify' });
expect(email.subject).toBe('Verify your Align email');
expect(email.html).toContain('Verify email');
expect(email.text).toContain('https://align.test/verify');
expect(email.html).not.toContain('<script');
await sendLifecycleEmail({ to: 'ada@example.com', template: email, idempotencyKey: 'verify/u1' });
expect(send).toHaveBeenCalledWith(expect.objectContaining({ from: 'Align <noreply@align.vyndra.tech>' }), { idempotencyKey: 'verify/u1' });
```

- [ ] **Step 2: Run and observe missing dependency/modules**

Run: `npx vitest run src/shared/email`
Expected: FAIL because the email boundary is absent.

- [ ] **Step 3: Install Resend and implement one server-only adapter and shared inline shell**

Run: `npm install resend`

```ts
export interface LifecycleTemplate { subject: string; html: string; text: string }
export async function sendLifecycleEmail(input: SendLifecycleEmailInput): Promise<void> {
  const result = await client().emails.send(
    { from: fromAddress(), to: input.to, subject: input.template.subject,
      html: input.template.html, text: input.template.text },
    input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
  );
  if (result.error) throw new EmailDeliveryError();
}
```

Implement verification, welcome, reset, password-changed, and account-deleted templates through the same escaped table-based shell. Require `RESEND_API_KEY` and `AUTH_EMAIL_FROM` in production environment validation without requiring them for non-email local tests.

- [ ] **Step 4: Run focused tests and environment validation tests**

Run: `npx vitest run src/shared/email && npm run check:env`
Expected: PASS; local env check may report only pre-existing missing live values according to its current mode.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example scripts/check-env.mts src/shared/email
git commit -m "feat: add lifecycle email delivery"
```

### Task 3: Add Retry-Safe Welcome Delivery

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_welcome_email_sent_at/migration.sql`
- Create: `src/shared/services/welcome-email.ts`
- Create: `src/shared/services/__tests__/welcome-email.test.ts`

**Interfaces:**
- Produces: `sendWelcomeEmailOnce(user: { id: string; email: string; name: string }): Promise<'sent' | 'already_sent'>`.

- [ ] **Step 1: Write failing retry/concurrency tests**

```ts
await expect(sendWelcomeEmailOnce(user)).rejects.toThrow('EMAIL_DELIVERY_FAILED');
expect(updateWelcomeTimestamp).not.toHaveBeenCalled();
await sendWelcomeEmailOnce(user);
expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'welcome/u1' }));
await Promise.all([sendWelcomeEmailOnce(user), sendWelcomeEmailOnce(user)]);
expect(sendEmail).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Confirm the service/schema tests fail**

Run: `npx vitest run src/shared/services/__tests__/welcome-email.test.ts`
Expected: FAIL because the service and Prisma field are absent.

- [ ] **Step 3: Add the nullable column and advisory-lock transaction**

```sql
ALTER TABLE "user" ADD COLUMN "welcomeEmailSentAt" TIMESTAMP(3);
```

```ts
return prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', user.id, 'welcome-email');
  const state = await tx.user.findUnique({ where: { id: user.id }, select: { welcomeEmailSentAt: true } });
  if (state?.welcomeEmailSentAt) return 'already_sent';
  await sendLifecycleEmail({ to: user.email, template: welcomeEmail(user), idempotencyKey: `welcome/${user.id}` });
  await tx.user.update({ where: { id: user.id }, data: { welcomeEmailSentAt: new Date() } });
  return 'sent';
});
```

- [ ] **Step 4: Generate Prisma client and run tests/validation**

Run: `npx prisma generate && npx prisma validate && npx vitest run src/shared/services/__tests__/welcome-email.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma src/shared/services/welcome-email.ts src/shared/services/__tests__/welcome-email.test.ts
git commit -m "feat: add retry-safe welcome delivery"
```

### Task 4: Wire Better Auth Verification, Password Reset, OAuth Welcome, and Distributed Limits

**Files:**
- Create: `src/shared/lib/better-auth-rate-limit.ts`
- Create: `src/shared/lib/__tests__/better-auth-rate-limit.test.ts`
- Create: `src/shared/lib/__tests__/auth-lifecycle.test.ts`
- Modify: `src/shared/lib/auth.ts`
- Modify: `src/shared/lib/rate-limit.ts` (export/reuse the existing Redis accessor only)
- Modify: `src/features/auth/components/AuthForm.tsx`
- Create: `src/app/(auth)/verify-email/page.tsx`
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: focused component tests beside the auth feature

**Interfaces:**
- Better Auth callbacks call `sendLifecycleEmail` and `sendWelcomeEmailOnce`; reset delivery first verifies a credential `Account` exists.
- Client pages use `authClient.sendVerificationEmail`, `requestPasswordReset`, and `resetPassword` with fixed same-origin callback paths.

- [ ] **Step 1: Write failing auth configuration and public-flow tests**

```ts
expect(authOptions.emailVerification.sendOnSignUp).toBe(true);
expect(authOptions.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
expect(screen.getByText("If an account exists for that email, we've sent password reset instructions.")).toBeVisible();
expect(sendReset).not.toHaveBeenCalledForGoogleOnlyUser();
expect(await consume('verify-email', 'ip')).toMatchObject({ allowed: false });
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npx vitest run src/shared/lib/__tests__/auth-lifecycle.test.ts src/shared/lib/__tests__/better-auth-rate-limit.test.ts src/features/auth`
Expected: FAIL on absent configuration/pages.

- [ ] **Step 3: Configure Better Auth using verified 1.6.23 APIs**

```ts
emailVerification: {
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  sendVerificationEmail: async ({ user, url }) => sendLifecycleEmail({ to: user.email, template: verificationEmail({ name: user.name, url }) }),
  afterEmailVerification: async (user) => { await bestEffort(() => sendWelcomeEmailOnce(user)); },
},
emailAndPassword: {
  enabled: true,
  revokeSessionsOnPasswordReset: true,
  sendResetPassword: sendResetOnlyForCredentialAccount,
  onPasswordReset: async ({ user }) => { await bestEffort(() => sendPasswordChanged(user)); },
},
```

Add a narrow after-hook for successful Google callbacks to call the same welcome service and for successful password changes to send the security notice. Implement Better Auth `rateLimit.customStorage` with the existing Upstash connection and atomic `INCR`/expiry semantics plus modest `customRules`; do not introduce another Redis client.

- [ ] **Step 4: Implement and test signup awaiting-verification, resend, verify result, forgot, and reset states**

Use fixed callback URLs `/verify-email` and `/reset-password`. Unknown, disabled, unverified, delivery-failed, and Google-only forgot-password submissions render the same generic success copy. Invalid, expired, and reused reset tokens render one safe invalid-link state.

Run: `npx vitest run src/shared/lib src/features/auth`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib src/features/auth src/app/(auth)
git commit -m "feat: add Better Auth lifecycle flows"
```

### Task 5: Enforce Verification at the Capability Boundary

**Files:**
- Create: `src/shared/services/email-verification-guard.ts`
- Create: `src/shared/services/__tests__/email-verification-guard.test.ts`
- Modify: `src/shared/services/capability-reservation.ts`
- Modify: `src/shared/services/ats-analysis-service.ts`
- Modify: reservation tests and affected route tests

**Interfaces:**
- Produces: `assertEmailVerifiedForCapability(userId, capability): Promise<void>` and `EmailVerificationRequiredError extends APIError` with code `EMAIL_VERIFICATION_REQUIRED`.
- `reserveCapability` invokes the guard before billing/quota work for protected capabilities.

- [ ] **Step 1: Write failing pre-reservation/provider tests**

```ts
await expect(reserveCapability({ userId: 'unverified', capability: 'job_match_analysis', operationId: 'op' }))
  .rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED', statusCode: 403 });
expect(resolveBillingAccess).not.toHaveBeenCalled();
expect(provider.generate).not.toHaveBeenCalled();
expect(await runAtsAnalysis(unverifiedInput)).toMatchObject({ aiEnhanced: false });
```

- [ ] **Step 2: Run guard/reservation/ATS tests and confirm failure**

Run: `npx vitest run src/shared/services/__tests__/email-verification-guard.test.ts src/shared/services/__tests__/capability-reservation.test.ts src/shared/services/__tests__/public-ats-service.test.ts`
Expected: FAIL because unverified users are not rejected.

- [ ] **Step 3: Implement the centralized guard and deterministic ATS branch**

```ts
export async function assertEmailVerifiedForCapability(userId: string, capability: ProductCapability) {
  if (!requiresVerifiedEmail(capability)) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) throw new EmailVerificationRequiredError();
}
```

At the start of `reserveCapability`, call the guard before its transaction. In ATS, always compute deterministic results, and attempt `ai_enhanced_ats_analysis` only when verification permits it; do not reserve or invoke AI for an unverified user.

- [ ] **Step 4: Run all reservation and provider-backed route tests**

Run: `npx vitest run src/shared/services/__tests__/capability-reservation src/shared/services/__tests__/public-ats-service.test.ts src/app/api/cv/__tests__ src/app/api/profile-evidence/__tests__`
Expected: PASS, including call-order assertions.

- [ ] **Step 5: Commit**

```bash
git add src/shared/services src/app/api
git commit -m "feat: require verification for provider work"
```

### Task 6: Build the Narrow Settings Route Shell

**Files:**
- Create: `src/app/(settings)/dashboard/settings/layout.tsx`
- Create: `src/app/(settings)/dashboard/settings/page.tsx`
- Create: `src/features/settings/components/SettingsShell.tsx`
- Create: `src/features/settings/components/SettingsNav.tsx`
- Create: `src/features/settings/components/__tests__/SettingsNav.test.tsx`
- Create: layout guard test
- Modify: `src/features/dashboard/components/Sidebar.tsx`
- Modify: `src/features/dashboard/components/__tests__/sidebar-active-state.test.tsx`

**Interfaces:**
- Settings layout authenticates with `auth.api.getSession` but never checks `onboardedAt`; existing `(dashboard)/layout.tsx` remains unchanged.
- `/dashboard/settings` redirects to `/dashboard/settings/account`.

- [ ] **Step 1: Write failing navigation and guard tests**

```tsx
expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/dashboard/settings/account');
expect(settingsGuard({ session, onboardedAt: null })).toEqual({ allowed: true });
expect(workspaceGuard({ session, onboardedAt: null })).toEqual({ redirect: '/onboarding' });
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/features/dashboard/components/__tests__/sidebar-active-state.test.tsx src/features/settings`
Expected: FAIL because Settings UI/routes are absent.

- [ ] **Step 3: Implement the auth-only route group and responsive settings navigation**

```tsx
const session = await auth.api.getSession({ headers: await headers() });
if (!session) redirect('/login');
return <SettingsShell user={session.user}>{children}</SettingsShell>;
```

Add Account, Billing & Subscription, Security, and Data & Privacy links. Add one Settings link to the existing sidebar and preserve its current tab/route active-state behavior.

- [ ] **Step 4: Run route/navigation tests**

Run: `npx vitest run src/features/settings src/features/dashboard/components/__tests__/sidebar-active-state.test.tsx`
Expected: PASS and no change to the existing dashboard layout guard.

- [ ] **Step 5: Commit**

```bash
git add src/app/(settings) src/features/settings src/features/dashboard/components
git commit -m "feat: add settings workspace shell"
```

### Task 7: Add Account, Billing, Security, and Privacy Settings

**Files:**
- Create: `src/app/(settings)/dashboard/settings/account/page.tsx`
- Create: `src/app/(settings)/dashboard/settings/billing/page.tsx`
- Create: `src/app/(settings)/dashboard/settings/security/page.tsx`
- Create: `src/app/(settings)/dashboard/settings/privacy/page.tsx`
- Create: focused components/actions/tests under `src/features/settings/`
- Modify: `src/features/dashboard/components/views/BillingView.tsx` only to extract reusable presentation if required

**Interfaces:**
- Account uses Better Auth `updateUser` and verification resend.
- Billing consumes `resolveBillingAccess`, `getStorageUsage`, entitlements, existing checkout, and existing Billing Portal actions.
- Security uses Better Auth `changePassword({ revokeOtherSessions: true })`, `listSessions`, `revokeSession`, and `revokeOtherSessions`.

- [ ] **Step 1: Write failing component/action tests**

```tsx
expect(screen.getByText(user.email)).toBeVisible();
expect(screen.getByText('Unverified')).toBeVisible();
expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeVisible();
expect(changePassword).toHaveBeenCalledWith(expect.objectContaining({ revokeOtherSessions: true }));
expect(screen.getByText('You sign in with Google')).toBeVisible();
expect(screen.queryByText(/GDPR compliant/i)).not.toBeInTheDocument();
```

- [ ] **Step 2: Run settings tests and confirm failure**

Run: `npx vitest run src/features/settings`
Expected: FAIL because pages and components are absent.

- [ ] **Step 3: Implement factual server-loaded settings and Better Auth client mutations**

Account shows name, read-only email, verification status/resend, providers, creation date, and danger-zone slot. Billing exposes only safe billing presentation and reuses portal/upgrade behavior. Security distinguishes credential versus Google-only accounts and provides other-session revocation. Privacy derives source retention from the active entitlement and states only implemented storage/deletion behavior.

```ts
await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
await authClient.revokeSession({ token });
await authClient.revokeOtherSessions();
```

- [ ] **Step 4: Run settings and billing regression tests**

Run: `npx vitest run src/features/settings src/shared/billing src/app/api/billing`
Expected: PASS; portal/cancellation tests remain unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/app/(settings) src/features/settings src/features/dashboard/components/views/BillingView.tsx
git commit -m "feat: add account security billing settings"
```

### Task 8: Implement the Authoritative Account-Deletion Boundary

**Files:**
- Create: `src/shared/account-deletion/context.ts`
- Create: `src/shared/account-deletion/errors.ts`
- Create: `src/shared/account-deletion/service.ts`
- Create: `src/shared/account-deletion/__tests__/context.test.ts`
- Create: `src/shared/account-deletion/__tests__/service.test.ts`
- Modify: `src/shared/lib/auth.ts`

**Interfaces:**
- Produces: `withAccountDeletionAuthorization(userId, fn)`, `assertAccountDeletionAuthorization(userId)`, and `prepareAccountDeletion(user): Promise<void>`.
- Throws stable `ACTIVE_SUBSCRIPTION_BLOCKS_DELETION` with only `paidThrough` and safe status, or `ACCOUNT_DELETION_STORAGE_FAILED`.

- [ ] **Step 1: Write failing authorization, billing, and cleanup tests**

```ts
await expect(prepareAccountDeletion(user)).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_NOT_AUTHORIZED' });
await expect(withAccountDeletionAuthorization('u1', () => prepareAccountDeletion(user)))
  .rejects.toMatchObject({ code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION', paidThrough });
expect(cancelActiveSubscription).not.toHaveBeenCalled();
expect(storage.delete).toHaveBeenCalledWith('uploads', 'users/u1/source.pdf');
expect(storage.delete).toHaveBeenCalledWith('rewrites', 'users/u1/generated.docx');
expect(storage.delete).toHaveBeenCalledWith('avatars', 'avatars/u1/avatar.png');
```

- [ ] **Step 2: Run deletion service tests and confirm failure**

Run: `npx vitest run src/shared/account-deletion`
Expected: FAIL because the trusted boundary does not exist.

- [ ] **Step 3: Implement unspoofable context and immediate authoritative billing decision**

```ts
const deletionContext = new AsyncLocalStorage<{ token: typeof INTERNAL_TOKEN; userId: string }>();
export function withAccountDeletionAuthorization<T>(userId: string, fn: () => Promise<T>) {
  return deletionContext.run({ token: INTERNAL_TOKEN, userId }, fn);
}
```

Query `CvRevision.sourceObjectKey`, `StoredCv.storageKey`, `CvUploadIntent.objectKey`, `GeneratedCV.fileKey`, and the server-validated avatar URL. Deduplicate `{ bucket, key }`, delete through `storage.delete`, accept missing objects as success, and throw before DB deletion on any `false`. Never accept keys or IDs from a request.

- [ ] **Step 4: Wire Better Auth deletion hooks and run focused tests**

`beforeDelete` calls `prepareAccountDeletion`; `afterDelete` sends the captured email best-effort. Raw Better Auth deletion without the AsyncLocalStorage token is rejected. Better Auth alone verifies credential password or recent-session freshness.

Run: `npx vitest run src/shared/account-deletion src/shared/lib/__tests__/auth-lifecycle.test.ts src/shared/lib/__tests__/storage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/account-deletion src/shared/lib/auth.ts
git commit -m "feat: enforce safe account deletion boundary"
```

### Task 9: Add the Deliberate Deletion Endpoint and UI

**Files:**
- Create: `src/app/api/account/delete/route.ts`
- Create: `src/app/api/account/delete/__tests__/route.test.ts`
- Create: `src/features/settings/components/DeleteAccountPanel.tsx`
- Create: `src/features/settings/components/__tests__/DeleteAccountPanel.test.tsx`
- Modify: account settings page
- Modify: `src/shared/lib/rate-limit.ts` only to add the account-action limiter through the existing abstraction

**Interfaces:**
- Endpoint input: `{ confirmation: 'DELETE'; password?: string }`.
- Endpoint success: `{ deleted: true }`; block response includes code `ACTIVE_SUBSCRIPTION_BLOCKS_DELETION`, safe `paidThrough`, and portal action availability—never Stripe IDs.

- [ ] **Step 1: Write failing route and UI tests**

```ts
expect(await post(undefined)).toMatchObject({ status: 401 });
expect(await post({ confirmation: 'delete' })).toMatchObject({ status: 400 });
expect(auth.api.deleteUser).not.toHaveBeenCalled();
expect((await post({ confirmation: 'DELETE' })).body.code).toBe('ACTIVE_SUBSCRIPTION_BLOCKS_DELETION');
expect(screen.getByText(/available after .*paid period ends/i)).toBeVisible();
expect(screen.getByRole('link', { name: /manage subscription/i })).toBeVisible();
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run src/app/api/account/delete src/features/settings/components/__tests__/DeleteAccountPanel.test.tsx`
Expected: FAIL because endpoint/panel are absent.

- [ ] **Step 3: Implement strict route delegation**

```ts
const DeleteAccountSchema = z.object({ confirmation: z.literal('DELETE'), password: z.string().optional() }).strict();
return withAccountDeletionAuthorization(session.user.id, () =>
  auth.api.deleteUser({ headers: request.headers, body: parsed.data.password ? { password: parsed.data.password } : {} })
);
```

Rate-limit before mutation. Map stale-session failure to `RECENT_AUTHENTICATION_REQUIRED`; map storage and billing errors to stable safe bodies. Do not pre-verify a password and do not call cancellation.

- [ ] **Step 4: Implement confirmation UI and run deletion regression tests**

Require exact `DELETE`, request password only for credential accounts, guide Google-only stale sessions to sign in again, show paid-through date for cancellation-at-period-end, and reuse Billing Portal.

Run: `npx vitest run src/app/api/account/delete src/features/settings src/shared/account-deletion src/shared/billing/__tests__/portal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/account src/features/settings src/shared/lib/rate-limit.ts
git commit -m "feat: add deliberate account deletion flow"
```

### Task 10: Add Database-Level Lifecycle Integration Coverage

**Files:**
- Create: `src/shared/account-deletion/__tests__/service.integration.test.ts`
- Create: `src/shared/services/__tests__/welcome-email.integration.test.ts`
- Extend: auth lifecycle integration tests where the repository convention permits

**Interfaces:**
- Tests exercise real Prisma rows/cascades while mocking only external email, storage, and billing providers.
- Local test helper `seedLifecycleUser(options): Promise<{ userId: string; sessionToken: string; objectKeys: Array<{ bucket: StorageBucket; key: string }> }>` creates the complete fixture and registers every created row for cleanup.

- [ ] **Step 1: Write integration cases for concurrency, cleanup, retry, and cascades**

```ts
it('collapses concurrent welcome claims and records sent only after acceptance', async () => {
  const fixture = await seedLifecycleUser({ billing: 'FREE' });
  await Promise.all([sendWelcomeEmailOnce(fixture.user), sendWelcomeEmailOnce(fixture.user)]);
  expect(sendLifecycleEmail).toHaveBeenCalledTimes(1);
  await expect(prisma.user.findUniqueOrThrow({ where: { id: fixture.userId } }))
    .resolves.toMatchObject({ welcomeEmailSentAt: expect.any(Date) });
});

it('retains the user after one storage delete fails and succeeds on retry', async () => {
  const fixture = await seedLifecycleUser({ billing: 'FREE', withEveryObjectKind: true });
  vi.mocked(storage.delete).mockResolvedValueOnce(false).mockResolvedValue(true);
  await expect(authorizeAndPrepare(fixture.userId)).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_STORAGE_FAILED' });
  await expect(prisma.user.findUnique({ where: { id: fixture.userId } })).resolves.not.toBeNull();
  await expect(authorizeAndDelete(fixture.userId)).resolves.toBeUndefined();
});

it('deletes cascaded auth and domain rows after all object deletes succeed', async () => {
  const fixture = await seedLifecycleUser({ billing: 'FREE', withEveryObjectKind: true });
  vi.mocked(storage.delete).mockResolvedValue(true);
  await authorizeAndDelete(fixture.userId);
  await expect(prisma.user.findUnique({ where: { id: fixture.userId } })).resolves.toBeNull();
  await expect(prisma.session.count({ where: { userId: fixture.userId } })).resolves.toBe(0);
});

it('blocks cancel-at-period-end access without calling provider cancellation', async () => {
  const fixture = await seedLifecycleUser({ billing: 'CANCELLED_ACTIVE', cancelAtPeriodEnd: true });
  await expect(authorizeAndPrepare(fixture.userId)).rejects.toMatchObject({ code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION' });
  expect(cancelActiveSubscription).not.toHaveBeenCalled();
  expect(storage.delete).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run with the local database and verify red failures**

Run: `npx vitest run src/shared/account-deletion/__tests__/service.integration.test.ts src/shared/services/__tests__/welcome-email.integration.test.ts`
Expected: FAIL only on integration behaviors not yet correctly covered; if `DATABASE_URL` is unavailable, record the skip condition and do not claim execution.

- [ ] **Step 3: Make only integration-discovered corrections**

Keep fixes inside existing services/hooks. Do not add a second deletion or welcome implementation. Assert that storage failure prevents Better Auth DB deletion and that already-missing object responses permit retry.

- [ ] **Step 4: Re-run focused lifecycle and integration suites**

Run: `npx vitest run src/shared/account-deletion src/shared/services/__tests__/welcome-email src/shared/lib/__tests__/auth-lifecycle.test.ts src/features/settings src/app/api/account/delete`
Expected: PASS or explicitly reported database-only skips.

- [ ] **Step 5: Commit**

```bash
git add src/shared/account-deletion/__tests__ src/shared/services/__tests__ src/shared/lib/__tests__
git commit -m "test: cover account lifecycle integration"
```

### Task 11: Add the Isolated Prisma Generation Deployment Fix

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` only if npm rewrites lifecycle metadata

**Interfaces:**
- Produces npm lifecycle script `postinstall: prisma generate`; it never applies migrations.

- [ ] **Step 1: Add a failing package contract test/check**

Run: `node -e "const p=require('./package.json'); if(p.scripts?.postinstall!=='prisma generate') process.exit(1)"`
Expected: exit 1.

- [ ] **Step 2: Add only the postinstall script**

```json
"postinstall": "prisma generate"
```

- [ ] **Step 3: Verify clean generation and production compilation**

Temporarily move the ignored `src/generated/prisma` directory to an explicit temp directory, run `npm run postinstall`, confirm the client is regenerated, then restore/remove only the verified temp copy as appropriate. Never recursively delete an unresolved path.

Run: `npm run postinstall && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 4: Commit separately**

```bash
git add package.json package-lock.json
git commit -m "build: generate Prisma client after install"
```

### Task 12: Full Verification and Documentation Reconciliation

**Files:**
- Modify: implementation docs only when actual commands or behavior differ from the approved spec

**Interfaces:**
- Produces an evidence-backed final report; no new product behavior.

- [ ] **Step 1: Run static and schema checks**

Run: `npx prisma validate && npx prisma generate && npm run typecheck && npm run lint && git diff --check`
Expected: all PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`
Expected: all tests PASS; report exact file/test/skip counts.

- [ ] **Step 3: Run production/deployment checks**

Run: `npm run check:env && npm run build && npx prisma migrate status`
Expected: env and build PASS; migration status PASS when the configured database is reachable, otherwise report the exact external prerequisite.

- [ ] **Step 4: Audit forbidden changes and policy duplication**

Run: `git diff main...HEAD -- src/shared/billing src/shared/entitlements docker-compose.yml; rg -n "RETENTION_FREE_SOURCE_CV_DAYS|RETENTION_PRO_SOURCE_CV_DAYS|cancelActiveSubscription" src/shared/account-deletion src/app/api/account src/shared/policies`
Expected: no pricing/product/webhook/entitlement/cancellation-semantic changes and no deletion-path cancellation call or duplicated plan retention.

- [ ] **Step 5: Review every spec requirement against tests, then commit documentation corrections if any**

```bash
git add docs
git commit -m "docs: reconcile account lifecycle implementation"
```

Skip this commit when no documentation changed. Before claiming completion, apply `superpowers:verification-before-completion` and cite only commands actually run.
