// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/ai-usage' }));

import AdminShell from '../AdminShell';

describe('AdminShell', () => {
  it('separates admin navigation from the user workspace and marks the active route', () => {
    render(
      <AdminShell user={{ name: 'Align Operator', email: 'admin@align.test' }}>
        <p>Protected admin content</p>
      </AdminShell>
    );

    expect(screen.getByRole('navigation', { name: 'Admin navigation' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI usage' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByText('admin@align.test')).toBeInTheDocument();
    expect(screen.getByText('Protected admin content')).toBeInTheDocument();
  });
});
