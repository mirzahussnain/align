import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; name: string; email: string } },
  findUnique: vi.fn(),
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => mocks.session) } },
}));
vi.mock('@/shared/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));
vi.mock('@/features/settings/components/SettingsShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SettingsLayout from '@/app/(settings)/dashboard/settings/layout';
import WorkspaceLayout from '@/app/(dashboard)/layout';

describe('settings and workspace route guards', () => {
  it('allows authenticated users into settings without checking onboarding', async () => {
    mocks.session = { user: { id: 'u1', name: 'User', email: 'user@example.test' } };

    await expect(SettingsLayout({ children: <p>Settings</p> })).resolves.toBeTruthy();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('preserves the workspace onboarding guard', async () => {
    mocks.session = { user: { id: 'u1', name: 'User', email: 'user@example.test' } };
    mocks.findUnique.mockResolvedValue({ onboardedAt: null });

    await expect(WorkspaceLayout({ children: <p>Dashboard</p> })).rejects.toThrow(
      'REDIRECT:/onboarding'
    );
  });
});
