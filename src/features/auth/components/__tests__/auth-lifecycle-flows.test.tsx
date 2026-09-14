// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signUp: vi.fn(),
  signIn: vi.fn(),
  social: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/shared/lib/auth-client', () => ({
  authClient: {
    signUp: { email: mocks.signUp },
    signIn: { email: mocks.signIn, social: mocks.social },
    requestPasswordReset: mocks.requestPasswordReset,
    resetPassword: mocks.resetPassword,
  },
}));

import AuthForm from '../AuthForm';
import { ForgotPasswordForm, ResetPasswordForm } from '../LifecycleForms';

describe('public account lifecycle flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUp.mockResolvedValue({ data: {}, error: null });
    mocks.requestPasswordReset.mockResolvedValue({ data: {}, error: null });
    mocks.resetPassword.mockResolvedValue({ data: {}, error: null });
  });

  it('moves credential signup into an awaiting-verification state', async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);

    await user.type(screen.getByLabelText('Name'), 'Ada');
    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ callbackURL: '/verify-email' })
    );
    expect(screen.getByText(/check your email/i)).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows the same forgot-password result when delivery fails', async () => {
    mocks.requestPasswordReset.mockResolvedValueOnce({
      data: null,
      error: { message: 'provider detail' },
    });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);

    await user.type(screen.getByLabelText('Email'), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: /send reset instructions/i }));

    expect(screen.getByText(
      "If an account exists for that email, we've sent password reset instructions."
    )).toBeVisible();
    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: 'ada@example.com',
      redirectTo: '/reset-password',
    });
  });

  it('uses one safe invalid-link state when no reset token is available', () => {
    render(<ResetPasswordForm token={null} invalid />);
    expect(screen.getByText(/password reset link is invalid or has expired/i)).toBeVisible();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
