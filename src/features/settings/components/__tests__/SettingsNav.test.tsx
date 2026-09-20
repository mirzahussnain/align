// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/settings/account',
}));

import SettingsNav from '../SettingsNav';

describe('SettingsNav', () => {
  afterEach(cleanup);

  it('links the approved settings sections without a separate privacy tab', () => {
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
    expect(screen.queryByRole('link', { name: 'Data & Privacy' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('keeps the mobile tab row and restores the desktop side navigation styling', () => {
    render(<SettingsNav />);

    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(nav.parentElement).toHaveClass(
      'rounded-2xl',
      'border',
      'border-slate-200',
      'bg-white'
    );
    expect(nav).toHaveClass('overflow-x-auto', 'overscroll-x-contain', 'md:overflow-visible');
    expect(nav).not.toHaveClass('overflow-y-auto');

    const activeTab = screen.getByRole('link', { name: 'Account' });
    expect(activeTab).toHaveClass(
      'bg-slate-900/5',
      'text-slate-900',
      'md:bg-slate-900',
      'md:text-white'
    );
  });
});
