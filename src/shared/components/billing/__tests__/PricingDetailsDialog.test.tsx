// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PricingDetailsDialog } from '../PricingDetailsDialog';

describe('PricingDetailsDialog', () => {
  it('summarises every public plan and sends the user to full billing only on request', async () => {
    const onClose = vi.fn();
    const onViewPlans = vi.fn();
    render(
      <PricingDetailsDialog
        open
        onClose={onClose}
        onViewPlans={onViewPlans}
        context={{ title: 'See what Pro includes' }}
      />
    );

    expect(screen.getByRole('dialog', { name: 'See what Pro includes' })).toBeInTheDocument();
    expect(screen.getAllByText('Free').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pro').length).toBeGreaterThan(0);
    expect(screen.getByText('No Job Matches included')).toBeInTheDocument();
    expect(screen.getAllByText('Monthly allowances')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /view full plan & billing/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onViewPlans).toHaveBeenCalledTimes(1);
  });
});
