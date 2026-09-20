import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as null | { user: { id: string; name: string; email: string } },
  findUnique: vi.fn(),
  listProfiles: vi.fn(async () => [{ id: 'p1', isDefault: true }]),
  getEntitlementSnapshot: vi.fn(async () => ({
    plan: 'FREE',
    capabilities: { additional_career_profiles: { limit: 1 } },
  })),
  routeShell: vi.fn(),
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
vi.mock('@/features/dashboard/data/load-profile', () => ({ listProfiles: mocks.listProfiles }));
vi.mock('@/shared/entitlements/server', () => ({
  getEntitlementSnapshot: mocks.getEntitlementSnapshot,
}));
vi.mock('@/features/dashboard/components/DashboardRouteShell', () => ({
  default: mocks.routeShell,
}));
vi.mock('@/features/settings/components/SettingsShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SettingsLayout from '@/app/(settings)/dashboard/settings/layout';
import WorkspaceLayout from '@/app/(dashboard)/layout';

describe('settings and workspace route guards', () => {
  it('allows authenticated users into settings without checking onboarding', async () => {
    mocks.session = { user: { id: 'u1', name: 'User', email: 'user@example.test' } };

    const layout = await SettingsLayout({ children: <p>Settings</p> });
    expect(layout.type).toBe(mocks.routeShell);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.listProfiles).toHaveBeenCalledWith('u1');
    expect(mocks.getEntitlementSnapshot).toHaveBeenCalledWith('u1');
  });

  it('preserves the workspace onboarding guard', async () => {
    mocks.session = { user: { id: 'u1', name: 'User', email: 'user@example.test' } };
    mocks.findUnique.mockResolvedValue({ onboardedAt: null });

    await expect(WorkspaceLayout({ children: <p>Dashboard</p> })).rejects.toThrow(
      'REDIRECT:/onboarding'
    );
  });
});
