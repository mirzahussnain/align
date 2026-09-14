// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DashboardTopBar from '../DashboardTopBar';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

beforeEach(() => {
  useDashboardStore.setState({ tab: 'overview' });
});

afterEach(() => cleanup());

describe('DashboardTopBar split action button', () => {
  it('renders default button that redirects to CV Analysis', () => {
    render(<DashboardTopBar title="Overview" subtitle="Welcome" />);

    const defaultButton = screen.getByRole('button', { name: /New Analysis/i });
    expect(defaultButton).toBeInTheDocument();

    fireEvent.click(defaultButton);
    expect(useDashboardStore.getState().tab).toBe('analyze');
  });

  it('toggles dropdown when dropdown arrow is clicked and selects Job Match', () => {
    render(<DashboardTopBar title="Overview" subtitle="Welcome" />);

    const toggleButton = screen.getByRole('button', { name: 'Analysis options' });
    expect(toggleButton).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Open dropdown
    fireEvent.click(toggleButton);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Should contain ATS Analysis and Job Match options
    expect(screen.getByRole('menuitem', { name: /ATS Analysis/i })).toBeInTheDocument();
    const jobMatchOption = screen.getByRole('menuitem', { name: /Job Match/i });
    expect(jobMatchOption).toBeInTheDocument();

    // Select Job Match
    fireEvent.click(jobMatchOption);
    expect(useDashboardStore.getState().tab).toBe('job_match');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('selects ATS Analysis from dropdown and redirects to CV Analysis', () => {
    render(<DashboardTopBar title="Overview" subtitle="Welcome" />);

    const toggleButton = screen.getByRole('button', { name: 'Analysis options' });
    fireEvent.click(toggleButton);

    const atsOption = screen.getByRole('menuitem', { name: /ATS Analysis/i });
    fireEvent.click(atsOption);

    expect(useDashboardStore.getState().tab).toBe('analyze');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes dropdown when Escape key is pressed', () => {
    render(<DashboardTopBar title="Overview" subtitle="Welcome" />);

    const toggleButton = screen.getByRole('button', { name: 'Analysis options' });
    fireEvent.click(toggleButton);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('hides new analysis button when showNewAnalysis is false', () => {
    render(<DashboardTopBar title="Overview" subtitle="Welcome" showNewAnalysis={false} />);

    expect(screen.queryByRole('button', { name: /New Analysis/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Analysis options' })).not.toBeInTheDocument();
  });
});
