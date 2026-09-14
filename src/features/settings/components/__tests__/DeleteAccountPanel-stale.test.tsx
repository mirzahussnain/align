// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteAccountPanel from '../DeleteAccountPanel';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeleteAccountPanel stale-session guidance', () => {
  it('asks a Google-only user to sign in again without requesting a password', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ code: 'RECENT_AUTHENTICATION_REQUIRED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DeleteAccountPanel credentialUser={false} />);

    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));

    expect(await screen.findByRole('link', { name: 'Sign in again' })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/account/delete',
      expect.objectContaining({ body: JSON.stringify({ confirmation: 'DELETE' }) })
    );
  });
});
