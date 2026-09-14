// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { OnboardingShell } from '../OnboardingShell';
import { GoalStep } from '../GoalStep';
import { CvSourceStep } from '../CvSourceStep';
import { FirstActionStep } from '../FirstActionStep';

/**
 * UX guarantees that are easy to regress and expensive to notice: what the goal
 * screen does NOT say, that progress is described as journey progress, and that
 * every plan number on screen came from the server.
 */

// Vitest is not configured with `globals`, so React Testing Library's automatic
// cleanup never registers — without this each render stacks on the last and
// every query finds several matches.
afterEach(cleanup);

function decision(overrides: Partial<CapabilityDecision> = {}): CapabilityDecision {
  return {
    capability: 'ai_enhanced_ats_analysis',
    plan: 'FREE',
    mode: 'quota',
    allowed: true,
    limit: 1,
    used: 0,
    remaining: 1,
    period: 'month',
    reason: 'quota_available',
    ...overrides,
  };
}

describe('goal screen', () => {
  const props = {
    stageIndex: 0,
    totalStages: 9,
    busy: false,
    error: null,
    onChoose: vi.fn(),
    onDismiss: vi.fn(),
  };

  it('offers the four goals as a keyboard-operable radio group', () => {
    render(<GoalStep {...props} />);
    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(4);
    expect(screen.getByRole('group', { name: /choose what you would like to do first/i })).toBeTruthy();
  });

  it('shows no upgrade messaging — nobody is asked to pay before seeing anything work', () => {
    const { container } = render(<GoalStep {...props} />);
    expect(container.textContent).not.toMatch(/upgrade|pro plan|subscribe|free plan/i);
  });

  it('will not continue until a goal is chosen', async () => {
    const onChoose = vi.fn();
    render(<GoalStep {...props} onChoose={onChoose} />);

    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton.hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByRole('radio', { name: /check my cv/i }));
    await userEvent.click(continueButton);
    expect(onChoose).toHaveBeenCalledWith('CHECK_CV');
  });
});

describe('onboarding progress', () => {
  it('describes journey progress and never claims profile completeness', () => {
    const { container } = render(
      <OnboardingShell stageIndex={1} totalStages={9} title="Upload your CV">
        <p>content</p>
      </OnboardingShell>
    );

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('1');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('9');
    expect(container.textContent).toContain('Step 2 of 9');
    // The old defect: "Step 2 of 5 · Profile 40% complete" for an empty profile.
    expect(container.textContent).not.toMatch(/profile \d+% complete/i);
  });

  it('moves focus to the new heading when the stage changes', () => {
    const { rerender } = render(
      <OnboardingShell stageIndex={0} totalStages={9} title="First stage">
        <p>content</p>
      </OnboardingShell>
    );
    rerender(
      <OnboardingShell stageIndex={1} totalStages={9} title="Second stage">
        <p>content</p>
      </OnboardingShell>
    );
    expect(document.activeElement?.textContent).toBe('Second stage');
  });

  it('announces long operations without inventing a second live region', () => {
    const { container } = render(
      <OnboardingShell stageIndex={2} totalStages={9} title="Reading your CV" busy busyLabel="Extracting CV text…">
        <p>content</p>
      </OnboardingShell>
    );
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe('Extracting CV text…');
  });

  it('renders errors as an alert rather than plain text', () => {
    render(
      <OnboardingShell stageIndex={2} totalStages={9} title="Upload" error="That file is too large.">
        <p>content</p>
      </OnboardingShell>
    );
    expect(screen.getByRole('alert').textContent).toBe('That file is too large.');
  });
});

describe('storage claims', () => {
  const props = {
    stageIndex: 1,
    totalStages: 9,
    maxBytes: 10 * 1024 * 1024,
    busy: false,
    error: null,
    onUploadPath: vi.fn(),
    onManualPath: vi.fn(),
    onBack: vi.fn(),
  };

  it('states the plan’s real retention window rather than promising permanence', () => {
    const { container } = render(<CvSourceStep {...props} retentionDays={30} />);
    expect(container.textContent).toContain('kept for 30 days');
    expect(container.textContent).not.toMatch(/stored forever|permanently|always keep/i);
  });

  it('says so plainly when there is no expiry', () => {
    const { container } = render(<CvSourceStep {...props} retentionDays={null} />);
    expect(container.textContent).toContain('kept until you delete it');
  });

  it('claims no malware scanning, because none runs', () => {
    const { container } = render(<CvSourceStep {...props} retentionDays={30} />);
    expect(container.textContent).not.toMatch(/malware|virus|scanned for/i);
  });

  it('promises review before anything reaches the profile', () => {
    const { container } = render(<CvSourceStep {...props} retentionDays={30} />);
    expect(container.textContent).toMatch(/reviewed and confirmed/i);
  });
});

describe('first action', () => {
  const props = {
    stageIndex: 8,
    totalStages: 9,
    onRunAts: vi.fn(),
    onRunJobMatch: vi.fn(),
    onGoToDashboard: vi.fn(),
  };

  it('offers exactly one primary action', () => {
    const { container } = render(
      <FirstActionStep
        {...props}
        goal="CHECK_CV"
        aiAtsDecision={decision()}
        jobMatchDecision={decision({ capability: 'job_match_analysis', limit: 2, remaining: 2 })}
      />
    );
    const footer = container.querySelectorAll('button');
    // One primary, one secondary — never three equal-weight choices.
    expect(footer).toHaveLength(2);
    expect(screen.getByRole('button', { name: /check my cv/i })).toBeTruthy();
  });

  it('quotes allowances from the server decision, never a constant', () => {
    const { container } = render(
      <FirstActionStep
        {...props}
        goal="MATCH_JOB"
        aiAtsDecision={decision()}
        jobMatchDecision={decision({ capability: 'job_match_analysis', limit: 30, used: 4, remaining: 26 })}
      />
    );
    expect(container.textContent).toContain('30 job matches a month');
    expect(container.textContent).toContain('26 left');
  });

  it('does not hide the deterministic result behind an upgrade when AI quota is spent', () => {
    const { container } = render(
      <FirstActionStep
        {...props}
        goal="CHECK_CV"
        aiAtsDecision={decision({ allowed: false, used: 1, remaining: 0, reason: 'quota_exhausted' })}
        jobMatchDecision={decision({ capability: 'job_match_analysis' })}
      />
    );
    expect(container.textContent).toContain('always included, with no monthly limit');
    expect(container.textContent).toContain('standard review');
    // The primary action still runs; it is not replaced by an upgrade prompt.
    const primary = screen.getByRole('button', { name: /check my cv/i });
    expect(within(primary).queryByText(/upgrade/i)).toBeNull();
  });
});
