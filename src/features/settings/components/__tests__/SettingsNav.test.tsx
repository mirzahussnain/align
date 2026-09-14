// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/settings/account',
}));

import SettingsNav from '../SettingsNav';

describe('SettingsNav', () => {
  it('links every approved settings section and marks the current one', () => {
    render(<SettingsNav />);

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/dashboard/settings/account'
    );
    expect(screen.getByRole('link', { name: 'Billing & Subscription' })).toHaveAttribute(
      'href',
      '/dashboard/settings/billing'
    );
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute(
      'href',
      '/dashboard/settings/security'
    );
    expect(screen.getByRole('link', { name: 'Data & Privacy' })).toHaveAttribute(
      'href',
      '/dashboard/settings/privacy'
    );
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });
});
