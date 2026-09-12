// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DomainHistoryView from '../DomainHistoryView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

beforeEach(() => {
  useDashboardStore.setState({ selectedAnalysisId: null, selectedAnalysisDomain: null });
});

afterEach(() => cleanup());

describe('Job Match history', () => {
  it('stays focused on historical results', () => {
    render(<DomainHistoryView domain="job_match" atsAnalyses={[]} jobMatches={[]} />);

    expect(screen.getByRole('heading', { name: 'No Job Matches Yet' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Job Match' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});