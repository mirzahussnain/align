// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  updateUser: vi.fn(),
  sendVerificationEmail: vi.fn(),
  changePassword: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
}));

vi.mock('@/shared/lib/auth-client', () => ({ authClient: auth }));

import AccountSettings from '../AccountSettings';
import SecuritySettings from '../SecuritySettings';

afterEach(() => cleanup());

describe('settings Better Auth actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.updateUser.mockResolvedValue({ data: { status: true }, error: null });
    auth.sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    auth.listSessions.mockResolvedValue({ data: [], error: null });
    auth.revokeSession.mockResolvedValue({ data: { status: true }, error: null });
    auth.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null });
  });

  it('updates the display name and resends verification through Better Auth', async () => {
    render(
      <AccountSettings
        user={{
          name: 'Ada',
          email: 'ada@example.test',
          emailVerified: false,
          createdAt: '2026-09-01T00:00:00.000Z',
          providers: ['credential'],
        }}
        data={{
          bytesUsed: 0,
          sourceRetentionDays: 180,
          maxGeneratedCvs: 3,
          maxStoredAnalyses: 10,
        }}
      />
    );

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ name: 'Ada Lovelace' }));

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification' }));
    await waitFor(() =>
      expect(auth.sendVerificationEmail).toHaveBeenCalledWith({
        email: 'ada@example.test',
        callbackURL: '/verify-email',
      })
    );
  });

  it('lists sessions and invokes individual and other-session revocation', async () => {
    auth.listSessions.mockResolvedValue({
      data: [
        {
          id: 'current',
          token: 'current-token',
          createdAt: new Date('2026-09-14T10:00:00Z'),
          expiresAt: new Date('2026-09-21T10:00:00Z'),
          userAgent: 'Desktop',
        },
        {
          id: 'other',
          token: 'other-token',
          createdAt: new Date('2026-09-13T10:00:00Z'),
          expiresAt: new Date('2026-09-20T10:00:00Z'),
          userAgent: 'Mobile',
        },
      ],
      error: null,
    });
    render(<SecuritySettings emailVerified providers={['google']} currentSessionId="current" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(auth.revokeSession).toHaveBeenCalledWith({ token: 'other-token' }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign out of other sessions' }));
    await waitFor(() => expect(auth.revokeOtherSessions).toHaveBeenCalledWith());
  });
});
