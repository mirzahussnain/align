import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getSessionCookie: vi.fn() }));

vi.mock('better-auth/cookies', () => ({ getSessionCookie: mocks.getSessionCookie }));

import { proxy } from '../proxy';

describe('admin proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionCookie.mockReturnValue(null);
  });

  it('preserves the requested admin destination for unauthenticated users', () => {
    const response = proxy(
      new NextRequest('https://align.test/admin/ai-usage?provider=groq')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://align.test/login?redirect=%2Fadmin%2Fai-usage%3Fprovider%3Dgroq'
    );
  });
});
