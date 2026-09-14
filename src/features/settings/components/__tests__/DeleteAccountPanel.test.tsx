// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DeleteAccountPanel from '../DeleteAccountPanel';

afterEach(() => vi.unstubAllGlobals());

describe('DeleteAccountPanel', () => {
  it('requires deliberate confirmation and explains a paid-through block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 'ACTIVE_SUBSCRIPTION_BLOCKS_DELETION',
            paidThrough: '2026-10-01T00:00:00.000Z',
            status: 'CANCELLED_ACTIVE',
            portalAvailable: true,
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    render(<DeleteAccountPanel credentialUser={false} />);

    const submit = screen.getByRole('button', { name: 'Delete account' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'DELETE' },
    });
    fireEvent.click(submit);

    expect(await screen.findByText(/available after .*paid period ends/i)).toBeVisible();
    expect(screen.getByRole('link', { name: /manage subscription/i })).toBeVisible();
  });
});
