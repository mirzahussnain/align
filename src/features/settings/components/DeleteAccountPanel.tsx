'use client';

import Link from 'next/link';
import { useState } from 'react';
import SettingsPanel from './SettingsPanel';

interface DeleteResponse {
  deleted?: boolean;
  code?: string;
  paidThrough?: string | null;
  portalAvailable?: boolean;
}

export default function DeleteAccountPanel({ credentialUser }: { credentialUser: boolean }) {
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [response, setResponse] = useState<DeleteResponse | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setResponse(null);
    try {
      const result = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmation,
          ...(credentialUser ? { password } : {}),
        }),
      });
      const body = (await result.json().catch(() => ({}))) as DeleteResponse;
      setResponse(result.ok ? { deleted: true } : body);
    } catch {
      setResponse({ code: 'ACCOUNT_DELETION_FAILED' });
    } finally {
      setPending(false);
    }
  }

  if (response?.deleted) {
    return (
      <SettingsPanel title="Account deleted" description="Your Align account has been deleted.">
        <Link href="/" className="text-sm font-semibold text-cyan-700">Return home</Link>
      </SettingsPanel>
    );
  }

  const blockedUntil = response?.paidThrough
    ? new Date(response.paidThrough).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <SettingsPanel title="Delete account" description="Permanently remove your account and stored files.">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm leading-6 text-slate-600">This action cannot be undone.</p>
        <label className="block text-sm font-semibold text-slate-700">
          Type DELETE to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            className="mt-1.5 w-full rounded-xl border border-red-200 px-3 py-2 text-sm"
          />
        </label>
        {credentialUser && (
          <label className="block text-sm font-semibold text-slate-700">
            Current password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              className="mt-1.5 w-full rounded-xl border border-red-200 px-3 py-2 text-sm"
            />
          </label>
        )}
        <button
          disabled={
            pending || confirmation !== 'DELETE' || (credentialUser && password.length === 0)
          }
          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Delete account
        </button>
      </form>

      {response?.code === 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION' && (
        <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Account deletion will be available after your paid period ends
            {blockedUntil ? ` on ${blockedUntil}` : ''}.
          </p>
          {response.portalAvailable && (
            <Link href="/dashboard/settings/billing" className="mt-2 inline-flex font-semibold underline">
              Manage subscription
            </Link>
          )}
        </div>
      )}
      {response?.code === 'RECENT_AUTHENTICATION_REQUIRED' && (
        <div role="alert" className="mt-4 text-sm text-slate-700">
          Sign in again before deleting your account.{' '}
          <Link href="/login" className="font-semibold text-cyan-700">Sign in again</Link>
        </div>
      )}
      {response?.code === 'INVALID_PASSWORD' && (
        <p role="alert" className="mt-4 text-sm text-red-700">Your current password is incorrect.</p>
      )}
      {response?.code && ![
        'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
        'RECENT_AUTHENTICATION_REQUIRED',
        'INVALID_PASSWORD',
      ].includes(response.code) && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          Your account could not be deleted. Try again later.
        </p>
      )}
    </SettingsPanel>
  );
}
