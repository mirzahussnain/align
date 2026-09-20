'use client';

import { useState } from 'react';
import { authClient } from '@/shared/lib/auth-client';
import SettingsPanel from './SettingsPanel';

export interface AccountSettingsUser {
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  providers: string[];
}

export interface AccountSettingsData {
  bytesUsed: number;
  sourceRetentionDays: number | null;
  maxGeneratedCvs: number | null;
  maxStoredAnalyses: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countLimit(limit: number | null): string {
  return limit === null ? 'No plan count limit' : `Up to ${limit}`;
}

function providerLabel(provider: string): string {
  if (provider === 'credential') return 'Email and password';
  if (provider === 'google') return 'Google';
  return provider;
}

export default function AccountSettings({
  user,
  data,
  dangerZone,
}: {
  user: AccountSettingsUser;
  data: AccountSettingsData;
  dangerZone?: React.ReactNode;
}) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    const result = await authClient.updateUser({ name: name.trim() });
    setMessage(result.error ? 'Your name could not be updated.' : 'Name updated.');
    setPending(false);
  }

  async function resendVerification() {
    setPending(true);
    setMessage('');
    const result = await authClient.sendVerificationEmail({
      email: user.email,
      callbackURL: '/verify-email',
    });
    setMessage(
      result.error
        ? 'A verification email could not be sent right now.'
        : 'Verification email sent.'
    );
    setPending(false);
  }

  return (
    <div className="space-y-6">
      <SettingsPanel title="Account" description="Your sign-in identity and display name.">
        <form onSubmit={saveName} className="space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent-cyan"
            />
          </label>
          <div>
            <p className="text-sm font-semibold text-slate-700">Email</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-800">{user.email}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {user.emailVerified ? 'Verified' : 'Unverified'}
              </span>
              {!user.emailVerified && (
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={pending}
                  className="text-xs font-semibold text-cyan-700 disabled:opacity-50"
                >
                  Resend verification
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Email changes are not supported.</p>
          </div>
          <button
            type="submit"
            disabled={pending || name.trim().length === 0}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Save name
          </button>
          {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
        </form>
      </SettingsPanel>

      <SettingsPanel title="Sign-in methods" description="Methods currently linked to this account.">
        <ul className="space-y-2">
          {user.providers.map((provider) => (
            <li key={provider} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
              {providerLabel(provider)}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-500">
          Account created {new Date(user.createdAt).toLocaleDateString('en-GB')}.
        </p>
      </SettingsPanel>
      <div role="region" aria-label="Your data">
        <SettingsPanel title="Your data" description="Storage facts for your current plan.">
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-slate-700">Archived file storage</dt>
              <dd className="mt-1 tabular-nums text-slate-600">{formatBytes(data.bytesUsed)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Source CV retention</dt>
              <dd className="mt-1 text-slate-600">
                {data.sourceRetentionDays === null ? 'No automatic expiry' : `${data.sourceRetentionDays} days`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Generated CVs stored</dt>
              <dd className="mt-1 text-slate-600">{countLimit(data.maxGeneratedCvs)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-700">Analyses retained</dt>
              <dd className="mt-1 text-slate-600">{countLimit(data.maxStoredAnalyses)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Analysis history can remain available after an original source CV expires. Deleting
            your account removes its records and stored files.
          </p>
        </SettingsPanel>
      </div>
      {dangerZone}
    </div>
  );
}
