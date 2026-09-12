// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DomainHistoryView from '../DomainHistoryView';
import { useDashboardStore } from '@/shared/stores/dashboard-store';

beforeEach(() => {
  useDashboardStore.setState({ selectedAnalysisId: null, selectedAnalysisDomain: null });
});

afterEach(() => cleanup());

describe('Job Match history actions', () => {
  it('reuses the canonical Jobs and own-job routes', () => {
    render(<DomainHistoryView domain="job_match" atsAnalyses={[]} jobMatches={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'New Job Match' }));

    expect(screen.getByRole('link', { name: /Choose a job from Jobs/i }).getAttribute('href')).toBe('/dashboard/jobs');
    expect(screen.getByRole('link', { name: /Analyse your own job/i }).getAttribute('href')).toBe('/dashboard/jobs/analyze');
  });
});
