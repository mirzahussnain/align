// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadAdminUsers: vi.fn() }));

vi.mock('@/shared/admin/data', () => ({ loadAdminUsers: mocks.loadAdminUsers }));

import AdminUsersPage from '../page';

describe('Admin users page', () => {
  it('badges internal users and offers Last activity sorting without losing pagination', async () => {
    mocks.loadAdminUsers.mockResolvedValue({
      rows: [
        {
          id: 'admin-1', email: 'admin@align.test', isInternal: true,
          signupDate: new Date('2026-09-01T10:00:00Z'), emailVerified: true,
          plan: 'PRO', onboardingState: 'Completed', storedCvCount: 1,
          analysisCount: 2, jobMatchCount: 3,
          lastActivityAt: new Date('2026-09-24T10:00:00Z'),
        },
      ],
      page: 1, pageSize: 20, total: 1, totalPages: 1,
    });

    render(await AdminUsersPage({ searchParams: Promise.resolve({ search: 'admin' }) }));

    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Last activity/i })).toHaveAttribute(
      'href',
      expect.stringContaining('sort=last_activity')
    );
    expect(mocks.loadAdminUsers).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'admin', sort: 'signup', direction: 'desc' })
    );
  });
});
