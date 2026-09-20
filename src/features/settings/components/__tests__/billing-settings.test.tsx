// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BillingView from '@/features/dashboard/components/views/BillingView';

afterEach(() => cleanup());

describe('billing settings presentation', () => {
  const entitlements = {
    ai_enhanced_ats_analysis: {
      capability: 'ai_enhanced_ats_analysis', plan: 'PRO', mode: 'quota', allowed: true,
      reason: 'quota_available', used: 4, limit: 15, remaining: 11, period: 'month',
    },
    job_match_analysis: {
      capability: 'job_match_analysis', plan: 'PRO', mode: 'quota', allowed: true,
      reason: 'quota_available', used: 6, limit: 30, remaining: 24, period: 'month',
    },
    cv_regeneration: {
      capability: 'cv_regeneration', plan: 'PRO', mode: 'quota', allowed: true,
      reason: 'quota_available', used: 2, limit: 10, remaining: 8, period: 'month',
    },
    additional_career_profiles: {
      capability: 'additional_career_profiles', plan: 'PRO', mode: 'resource_limit', allowed: true,
      reason: 'allowed', used: 2, limit: 3, remaining: 1,
    },
    stored_source_cvs: {
      capability: 'stored_source_cvs', plan: 'PRO', mode: 'resource_limit', allowed: true,
      reason: 'allowed', used: 1, limit: 25, remaining: 24,
    },
    stored_generated_cvs: {
      capability: 'stored_generated_cvs', plan: 'PRO', mode: 'resource_limit', allowed: true,
      reason: 'allowed', used: 7, limit: 50, remaining: 43,
    },
    stored_analyses: {
      capability: 'stored_analyses', plan: 'PRO', mode: 'resource_limit', allowed: true,
      reason: 'allowed', used: 9, limit: 100, remaining: 91,
    },
  } as const;

  function renderBilling() {
    render(
      <BillingView
        tier="pro"
        billing={{
          plan: 'PRO',
          status: 'ACTIVE',
          cancelAtPeriodEnd: false,
          accessEndsAt: '2026-10-01T00:00:00.000Z',
          graceEndsAt: null,
          checkoutAvailable: false,
          portalAvailable: true,
        }}
        entitlements={entitlements}
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
  }

  it('keeps subscription status and management together in Current Plan', () => {
    renderBilling();

    const section = screen.getByRole('region', { name: 'Current Plan' });
    expect(section).toHaveTextContent('Pro');
    expect(section).toHaveTextContent('Active');
    expect(section).toHaveTextContent(/£12\.99/);
    expect(section).toHaveTextContent('Renews 1 Oct 2026');
    expect(within(section).getByRole('button', { name: 'Manage subscription' })).toBeVisible();
  });

  it('separates monthly quotas from persistent account limits', () => {
    renderBilling();

    const monthly = screen.getByRole('region', { name: 'Monthly Usage' });
    expect(monthly).toHaveTextContent('AI analyses');
    expect(monthly).toHaveTextContent('4 / 15');
    expect(monthly).toHaveTextContent('11 remaining');
    expect(monthly).toHaveTextContent('Resets monthly');
    expect(monthly).toHaveTextContent('Job Matches');
    expect(monthly).toHaveTextContent('6 / 30');
    expect(monthly).toHaveTextContent('CV regenerations');
    expect(monthly).toHaveTextContent('2 / 10');

    const limits = screen.getByRole('region', { name: 'Account Limits' });
    expect(limits).toHaveTextContent('Career Profiles');
    expect(limits).toHaveTextContent('2 / 3');
    expect(limits).toHaveTextContent('Stored CVs');
    expect(limits).toHaveTextContent('Generated CVs');
    expect(limits).toHaveTextContent('Analyses retained');
    expect(limits).not.toHaveTextContent(/reset/i);
  });

  it('keeps storage facts and plan comparison in their own sections', () => {
    renderBilling();

    const storage = screen.getByRole('region', { name: 'Storage' });
    expect(storage).toHaveTextContent('200 B');
    expect(storage).toHaveTextContent('365 days');

    const comparison = screen.getByRole('region', { name: 'Plan Comparison' });
    expect(within(comparison).getAllByText('Free')).toHaveLength(2);
    expect(within(comparison).getByText('Pro')).toBeVisible();
    expect(comparison).not.toHaveTextContent(/token/i);
  });
});
