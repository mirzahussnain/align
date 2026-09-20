'use client';

import Link from 'next/link';
import { useState } from 'react';

import { authClient } from '@/shared/lib/auth-client';

const GENERIC_RESET_COPY =
  "If an account exists for that email, we've sent password reset instructions.";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    } finally {
      setSent(true);
      setPending(false);
    }
  }

  if (sent) return <LifecycleMessage title="Check your email" body={GENERIC_RESET_COPY} />;

  return (
    <LifecycleCard title="Forgot your password?" subtitle="Enter your email to request a reset link.">
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-semibold text-white/70">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field-dark w-full"
            required
          />
        </label>
        <button className="rounded-xl bg-accent-cyan px-4 py-3 text-sm font-bold text-white disabled:opacity-50" disabled={pending}>
          Send reset instructions
        </button>
      </form>
    </LifecycleCard>
  );
}

export function ResetPasswordForm({ token, invalid = false }: { token: string | null; invalid?: boolean }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [state, setState] = useState<'ready' | 'invalid' | 'success'>(invalid || !token ? 'invalid' : 'ready');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return setState('invalid');
    if (newPassword !== confirmation) return setError('Passwords do not match.');
    const result = await authClient.resetPassword({ newPassword, token });
    if (result.error) return setState('invalid');
    setState('success');
  }

  if (state === 'invalid') {
    return <LifecycleMessage title="Invalid reset link" body="This password reset link is invalid or has expired." />;
  }
  if (state === 'success') {
    return <LifecycleMessage title="Password reset" body="Your password has been updated. You can now sign in." />;
  }

  return (
    <LifecycleCard title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <PasswordField label="New password" value={newPassword} onChange={setNewPassword} />
        <PasswordField label="Confirm new password" value={confirmation} onChange={setConfirmation} />
        {error && <p role="alert" className="text-xs text-error">{error}</p>}
        <button className="rounded-xl bg-accent-cyan px-4 py-3 text-sm font-bold text-white">Reset password</button>
      </form>
    </LifecycleCard>
  );
}

export function VerificationResult({ error }: { error?: string }) {
  if (error === 'TOKEN_EXPIRED') {
    return <LifecycleMessage title="Verification link expired" body="Request a new verification email and try again." />;
  }
  if (error) {
    return <LifecycleMessage title="Invalid verification link" body="This verification link is invalid or has already been used." />;
  }
  return <LifecycleMessage title="Email verified" body="Your email is verified. You can continue to your workspace." />;
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-white/70">
      {label}
      <input type="password" value={value} onChange={(event) => onChange(event.target.value)} minLength={8} className="field-dark w-full" required />
    </label>
  );
}

function LifecycleCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <div className="w-full max-w-sm"><h1 className="text-3xl font-black text-white">{title}</h1><p className="mt-2 text-sm text-white/50">{subtitle}</p>{children}</div>;
}

function LifecycleMessage({ title, body }: { title: string; body: string }) {
  return <LifecycleCard title={title} subtitle={body}><Link href="/login" className="mt-6 inline-flex text-sm font-semibold text-accent-cyan">Return to sign in</Link></LifecycleCard>;
}
