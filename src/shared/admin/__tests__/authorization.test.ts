import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: null as null | {
    user: { id: string; email: string; name: string; emailVerified: boolean };
  },
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/shared/lib/auth', () => ({
  auth: { api: { getSession: vi.fn(async () => mocks.session) } },
}));

import { isAdminEmail, requireAdminPage } from '../authorization';

describe('admin authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    process.env.ADMIN_EMAILS = 'owner@align.test, Operations@Align.test ';
  });

  it('redirects unauthenticated users to the existing login flow with the intended destination', async () => {
    await expect(
      requireAdminPage({ destination: '/admin/ai-usage?provider=groq' })
    ).rejects.toThrow(
      'REDIRECT:/login?redirect=%2Fadmin%2Fai-usage%3Fprovider%3Dgroq'
    );
  });

  it('denies an authenticated non-admin by returning them to the normal dashboard', async () => {
    mocks.session = {
      user: { id: 'u1', email: 'member@align.test', name: 'Member', emailVerified: true },
    };

    await expect(requireAdminPage({ destination: '/admin' })).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });

  it('denies an allowlisted account until Better Auth has verified its email', async () => {
    mocks.session = {
      user: {
        id: 'admin-1',
        email: 'operations@align.test',
        name: 'Operator',
        emailVerified: false,
      },
    };

    await expect(requireAdminPage({ destination: '/admin' })).rejects.toThrow(
      'REDIRECT:/dashboard'
    );
  });

  it('allows an authenticated admin using a case-insensitive server allowlist', async () => {
    mocks.session = {
      user: { id: 'admin-1', email: 'operations@align.test', name: 'Operator', emailVerified: true },
    };

    await expect(requireAdminPage({ destination: '/admin' })).resolves.toEqual(
      mocks.session
    );
    expect(isAdminEmail('OPERATIONS@ALIGN.TEST')).toBe(true);
  });
});
