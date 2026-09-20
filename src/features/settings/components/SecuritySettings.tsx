'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/shared/lib/auth-client';
import SettingsPanel from './SettingsPanel';

interface SessionView {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string | null;
}

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/mobile|android|iphone/i.test(userAgent)) return 'Mobile browser';
  return 'Desktop browser';
}

export default function SecuritySettings({
  emailVerified,
  providers,
  currentSessionId,
}: {
  emailVerified: boolean;
  providers: string[];
  currentSessionId: string;
}) {
  const credentialUser = providers.includes('credential');
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    void authClient.listSessions().then((result) => {
      if (!active || !result.data) return;
      setSessions(
        result.data.map((session) => ({
          id: session.id,
          token: session.token,
          createdAt: new Date(session.createdAt).toISOString(),
          expiresAt: new Date(session.expiresAt).toISOString(),
          userAgent: session.userAgent,
        }))
      );
    });
    return () => {
      active = false;
    };
  }, []);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setPending(true);
    setMessage('');
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    setMessage(result.error ? 'Your password could not be changed.' : 'Password changed.');
    setPending(false);
  }

  async function revoke(token: string) {
    const result = await authClient.revokeSession({ token });
    if (!result.error) setSessions((current) => current.filter((session) => session.token !== token));
  }

  async function revokeOthers() {
    const result = await authClient.revokeOtherSessions();
    if (!result.error) setSessions((current) => current.filter((session) => session.id === currentSessionId));
  }

  return (
    <div className="space-y-6">
      <SettingsPanel title="Security" description={`Email ${emailVerified ? 'verified' : 'unverified'}.`}>
        {credentialUser ? (
          <form onSubmit={changePassword} className="space-y-4">
            {[
              ['Current password', currentPassword, setCurrentPassword],
              ['New password', newPassword, setNewPassword],
              ['Confirm new password', confirmation, setConfirmation],
            ].map(([label, value, setter]) => (
              <label key={label as string} className="block text-sm font-semibold text-slate-700">
                {label as string}
                <input
                  type="password"
                  aria-label={label as string}
                  value={value as string}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                  minLength={8}
                  required
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            ))}
            <button disabled={pending} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Change password
            </button>
            {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
          </form>
        ) : (
          <div>
            <p className="font-semibold text-slate-900">You sign in with Google</p>
            <p className="mt-1 text-sm text-slate-500">Password changes are managed by your Google account.</p>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel title="Active sessions" description="Browsers currently signed in to your account.">
        <div className="space-y-3">
          {sessions.map((session) => {
            const current = session.id === currentSessionId;
            return (
              <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {deviceLabel(session.userAgent)} {current && <span className="text-cyan-700">(current)</span>}
                  </p>
                  <p className="text-xs text-slate-500">Expires {new Date(session.expiresAt).toLocaleDateString('en-GB')}</p>
                </div>
                {!current && (
                  <button type="button" onClick={() => revoke(session.token)} className="text-xs font-semibold text-red-700">
                    Revoke
                  </button>
                )}
              </div>
            );
          })}
          {sessions.length === 0 && <p className="text-sm text-slate-500">No session details are available.</p>}
        </div>
        <button type="button" onClick={revokeOthers} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
          Sign out of other sessions
        </button>
      </SettingsPanel>
    </div>
  );
}
