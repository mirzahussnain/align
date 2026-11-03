// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkflowSection from '../WorkflowSection';
import { MobileWorkflowSignals } from '../MobileWorkflowSignals';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, initial, whileInView, viewport, transition, ...props }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => {
      void initial;
      void whileInView;
      void viewport;
      void transition;
      return <div {...props}>{children}</div>;
    },
  },
}));

describe('MobileWorkflowSignals', () => {
  it('orchestrates all six workflow signals around the laptop on mobile', () => {
    render(<MobileWorkflowSignals />);
    const signals = screen.getByTestId('mobile-workflow-signals');

    expect(signals).toHaveClass('lg:hidden');
    for (const label of [
      'ATS Diagnostics',
      'Market Demand',
      'Role Fit Signals',
      'Visa Sponsor Filter',
      'Skill Gap Analysis',
      'Compensation Trends',
    ]) {
      expect(within(signals).getByText(label)).toBeInTheDocument();
    }

    expect(signals.querySelectorAll('[data-signal-path]')).toHaveLength(6);
    expect(signals.querySelectorAll('[data-signal-pulse]')).toHaveLength(6);
    for (const pulse of signals.querySelectorAll('[data-signal-pulse]')) {
      expect(pulse).toHaveClass('motion-reduce:hidden');
    }
  });

  it('adds the mobile orchestration without replacing the desktop diagram', () => {
    const { container } = render(<WorkflowSection />);

    expect(container.querySelector('[data-testid="mobile-workflow-signals"]')).not.toBeNull();
    const desktopDiagram = container.querySelector('svg.hidden.lg\\:block');
    expect(desktopDiagram).not.toBeNull();
    expect(desktopDiagram?.querySelectorAll(':scope > path')).toHaveLength(6);
  });
});
