'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/shared/lib/auth-client';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

// Only allow same-site relative paths as a post-auth destination, so a crafted
// ?redirect=https://evil.com can't turn the login page into an open redirect.
function safeRedirect(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/dashboard';
}

const COPY = {
  login: {
    heading: 'Welcome back',
    sub: 'Sign in to pick up where your search left off.',
    action: 'Sign in',
    altPrompt: 'New to Align?',
    altLabel: 'Create an account',
    altHref: '/signup',
  },
  signup: {
    heading: 'Create your account',
    sub: 'Save your profile once, and tailor it to every role you apply for.',
    action: 'Create account',
    altPrompt: 'Already have an account?',
    altLabel: 'Sign in',
    altHref: '/login',
  },
} as const;

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = safeRedirect(searchParams.get('redirect'));
  const copy = COPY[mode];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [isGooglePending, setIsGooglePending] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setIsPending(true);

    const { error: authError } =
      mode === 'signup'
        ? await authClient.signUp.email({ name, email, password, callbackURL: '/verify-email' })
        : await authClient.signIn.email({ email, password });

    if (authError) {
      setError(authError.message || 'Something went wrong. Please try again.');
      setIsPending(false);
      return;
    }

    if (mode === 'signup') {
      setAwaitingVerification(true);
      setIsPending(false);
      return;
    }

    router.push(destination);
    router.refresh();
  }

  async function handleGoogle() {
    setError('');
    setIsGooglePending(true);
    const { error: authError } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: destination,
    });
    if (authError) {
      setError(authError.message || 'Google sign-in is unavailable right now.');
      setIsGooglePending(false);
    }
  }

  async function resendVerification() {
    setResendStatus('');
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: '/verify-email',
    });
    setResendStatus(result.error ? 'Unable to resend right now.' : 'Verification email sent.');
  }

  const fieldClass = 'field-dark w-full transition-colors';

  if (awaitingVerification) {
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black tracking-tight text-white">Check your email</h1>
        <p className="mt-2 text-sm text-white/50">
          We sent a verification link to {email}. Verify your email before using provider-backed features.
        </p>
        <button type="button" onClick={resendVerification} className="mt-6 text-sm font-semibold text-accent-cyan">
          Resend verification email
        </button>
        {resendStatus && <p role="status" className="mt-3 text-xs text-white/60">{resendStatus}</p>}
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <h1 className="text-3xl font-black tracking-tight text-white">{copy.heading}</h1>
      <p className="mt-2 text-sm text-white/50">{copy.sub}</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        {mode === 'signup' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-xs font-semibold text-white/70">
              Name
            </label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-semibold text-white/70">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-semibold text-white/70">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={fieldClass}
            minLength={8}
            required
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-xs font-medium text-error"
          >
            {error}
          </p>
        )}

        {mode === 'login' && (
          <Link href="/forgot-password" className="self-end text-xs font-semibold text-accent-cyan">
            Forgot password?
          </Link>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-cyan px-4 py-3 text-sm font-bold text-white transition-all hover:bg-accent-cyan/90 hover:shadow-[0_0_28px_-4px_hsl(199_89%_48%/0.6)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {copy.action}
        </button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">or</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={isGooglePending}
        className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGooglePending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.64 6.16-4.64Z"
            />
          </svg>
        )}
        Continue with Google
      </button>

      <p className="mt-8 text-center text-xs text-white/40">
        {copy.altPrompt}{' '}
        <Link
          href={destination === '/dashboard' ? copy.altHref : `${copy.altHref}?redirect=${encodeURIComponent(destination)}`}
          className="font-semibold text-white underline underline-offset-4 transition-colors hover:text-accent-cyan"
        >
          {copy.altLabel}
        </Link>
      </p>
    </div>
  );
}
