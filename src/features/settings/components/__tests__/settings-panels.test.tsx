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

afterEach(() => cleanup());

import AccountSettings from '../AccountSettings';
import SecuritySettings from '../SecuritySettings';
import PrivacySettings from '../PrivacySettings';

describe('settings panels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.updateUser.mockResolvedValue({ data: { status: true }, error: null });
    auth.sendVerificationEmail.mockResolvedValue({ data: { status: true }, error: null });
    auth.changePassword.mockResolvedValue({ data: { status: true }, error: null });
    auth.listSessions.mockResolvedValue({ data: [], error: null });
    auth.revokeSession.mockResolvedValue({ data: { status: true }, error: null });
    auth.revokeOtherSessions.mockResolvedValue({ data: { status: true }, error: null });
  });

  it('shows immutable identity facts and verification state', () => {
    render(
      <AccountSettings
        user={{
          name: 'Ada Lovelace',
          email: 'ada@example.test',
          emailVerified: false,
          createdAt: '2026-09-01T00:00:00.000Z',
          providers: ['credential'],
        }}
      />
    );

    expect(screen.getByText('ada@example.test')).toBeVisible();
    expect(screen.getByText('Unverified')).toBeVisible();
    expect(screen.getByText('Email and password')).toBeVisible();
  });

  it('changes a credential password and revokes other sessions', async () => {
    render(
      <SecuritySettings
        emailVerified
        providers={['credential']}
        currentSessionId="current"
      />
    );

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(auth.changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-password',
        newPassword: 'new-password',
        revokeOtherSessions: true,
      })
    );
  });

  it('explains Google-only authentication without showing a password form', () => {
    render(
      <SecuritySettings emailVerified providers={['google']} currentSessionId="current" />
    );

    expect(screen.getByText('You sign in with Google')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument();
  });

  it('states only implemented privacy behavior', () => {
    render(
      <PrivacySettings
        storage={{
          sourceRetentionDays: 180,
          maxGeneratedCvs: 5,
          maxStoredAnalyses: 10,
        }}
      />
    );

    expect(screen.getByText(/kept for 180 days/i)).toBeVisible();
    expect(screen.queryByText(/GDPR compliant/i)).not.toBeInTheDocument();
  });
});
