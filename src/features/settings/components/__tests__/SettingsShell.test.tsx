// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/settings/account',
}));

import { useDashboardStore } from '@/shared/stores/dashboard-store';
import SettingsShell from '../SettingsShell';

describe('SettingsShell', () => {
  beforeEach(() => {
    useDashboardStore.setState({ mobileNavOpen: false });
  });

  afterEach(() => {
    cleanup();
    useDashboardStore.setState({ mobileNavOpen: false });
  });

  it('uses the shared dashboard top bar to open mobile navigation', () => {
    render(
      <SettingsShell>
        <p>Account settings</p>
      </SettingsShell>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Navigation' }));
    expect(useDashboardStore.getState().mobileNavOpen).toBe(true);
  });

  it('keeps the shell stable while the active settings content owns vertical scrolling', () => {
    render(
      <SettingsShell>
        <p>Scrollable settings content</p>
      </SettingsShell>
    );

    const content = screen.getByRole('main');
    expect(content).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-y-contain');
    expect(content.parentElement).toHaveClass('min-h-0', 'overflow-hidden');
    expect(content.parentElement?.parentElement).toHaveClass('h-screen', 'overflow-hidden');
  });

  it('restores the two-column settings layout from the desktop breakpoint', () => {
    render(
      <SettingsShell>
        <p>Desktop settings content</p>
      </SettingsShell>
    );

    expect(screen.getByRole('main').parentElement).toHaveClass(
      'md:grid-cols-[15rem_minmax(0,1fr)]',
      'md:grid-rows-1'
    );
  });
});
