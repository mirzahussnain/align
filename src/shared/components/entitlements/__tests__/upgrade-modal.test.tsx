// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { EntitlementProvider, useEntitlements } from '../EntitlementProvider';
import { PRODUCT_CAPABILITIES, type CapabilityDecision } from '@/shared/entitlements/registry';

function Trigger() {
  const { decisionFor, openUpgrade } = useEntitlements();
  return <button onClick={() => openUpgrade({ capability: 'cv_regeneration', decision: decisionFor('cv_regeneration'), source: 'generation' })}>Generate</button>;
}

describe('central upgrade modal', () => {
  it('uses the attempted capability and displays remaining quota context', async () => {
    const decisions = Object.fromEntries(PRODUCT_CAPABILITIES.map((capability) => [capability, { capability, allowed: true, plan: 'FREE', mode: 'enabled', reason: 'allowed' } satisfies CapabilityDecision])) as Record<(typeof PRODUCT_CAPABILITIES)[number], CapabilityDecision>;
    decisions.cv_regeneration = { capability: 'cv_regeneration', allowed: false, plan: 'FREE', mode: 'quota', limit: 1, used: 1, remaining: 0, period: 'month', reason: 'quota_exhausted', upgradeTarget: 'PRO' };
    render(<EntitlementProvider initialSnapshot={{ plan: 'FREE', capabilities: decisions }}><Trigger /></EntitlementProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Generate a truthful tailored CV')).toBeInTheDocument();
    expect(screen.getByText(/used 1 of 1/i)).toBeInTheDocument();
  });
});
