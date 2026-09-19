// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import BillingView from '@/features/dashboard/components/views/BillingView';

describe('billing settings presentation', () => {
  it('reuses the existing customer portal action', () => {
    render(
      <BillingView
        tier="pro"
        billing={{
          plan: 'PRO',
          status: 'ACTIVE',
          cancelAtPeriodEnd: false,
          accessEndsAt: null,
          graceEndsAt: null,
          checkoutAvailable: false,
          portalAvailable: true,
        }}
        storage={{
          sourceCvs: 1,
          maxSourceCvs: 25,
          sourceCvBytes: 100,
          generatedCvs: 1,
          maxGeneratedCvs: 25,
          generatedCvBytes: 100,
          atsAnalyses: 1,
          jobMatches: 0,
          temporaryDemoBytes: 0,
          storedCvs: 1,
          maxStoredCvs: 25,
          storedAnalyses: 1,
          maxStoredAnalyses: null,
          bytesUsed: 200,
          sourceRetentionDays: 365,
        }}
      />
    );

    expect(screen.getByRole('button', { name: 'Manage subscription' })).toBeVisible();
  });
});
