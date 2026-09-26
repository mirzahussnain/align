// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CareerMarketExplorer from '../CareerMarketExplorer';

const snapshot = {
  id: 'market-1', marketKey: 'key', roleQuery: 'Analyst', locationQuery: 'UK', normalizedRole: 'analyst', normalizedLocation: 'uk',
  providerCoverage: [{ provider: 'NHS_JOBS', status: 'SUCCESS', sampled: 5 }, { provider: 'REED', status: 'SUCCESS', sampled: 3 }],
  sampleSize: 8, samplingStartedAt: '2026-09-26T00:00:00.000Z', samplingCompletedAt: '2026-09-26T00:00:01.000Z', generatedAt: '2026-09-26T00:00:01.000Z', expiresAt: '2026-09-27T00:00:01.000Z', calculationVersion: 'market-sample-v1',
  dataQuality: { salaryMissing: 2, contractTypeMissing: 1, workStyleUnknown: 1, locationMissing: 0, note: 'Current sample.' },
  metrics: {
    sampledVacancyCount: 8,
    salary: { disclosedCount: 6, eligibleAnnualCount: 4, disclosureRate: 75, annualGbp: { minimum: 30000, median: 42000, maximum: 60000 } },
    contractTypeMix: [{ label: 'permanent', count: 6, share: 75 }], workStyleMix: [{ label: 'HYBRID', count: 5, share: 62.5 }],
    regions: [{ label: 'London', count: 4, share: 50 }], topEmployers: [{ label: 'Acme', count: 2, share: 25 }], sponsorshipEmployerContext: [],
    currentVacancies: [{ id: 'job-1', title: 'Data Analyst', employer: 'Acme', location: 'London', provider: 'REED', url: 'https://jobs.test/1', salaryText: '£40,000' }],
  },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('UK Career Market explorer', () => {
  it('presents user-facing controls and truthful snapshot metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ freshness: 'GENERATED', snapshot, methodology: { statement: 'Current sample, not the whole market.', salaryMethod: 'Disclosed salaries only.', sponsorshipMethod: 'Register context only.' } }), { status: 200 })));
    const user = userEvent.setup();
    render(<CareerMarketExplorer />);
    await user.type(screen.getByLabelText(/role or occupation/i), 'Analyst');
    await user.click(screen.getByRole('button', { name: /explore market/i }));

    expect(await screen.findByText('Current vacancies sampled')).toBeInTheDocument();
    expect(screen.getByText('Sources included')).toBeInTheDocument();
    expect(screen.getByText('Salary available')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /market overview/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view original posting/i })).toHaveAttribute('href', 'https://jobs.test/1');
  });

  it('omits the work-style chart when the sample has no disclosed work style', async () => {
    const unknownWorkStyleSnapshot = {
      ...snapshot,
      dataQuality: { ...snapshot.dataQuality, workStyleUnknown: 8 },
      metrics: { ...snapshot.metrics, workStyleMix: [{ label: 'UNKNOWN', count: 8, share: 100 }] },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ freshness: 'GENERATED', snapshot: unknownWorkStyleSnapshot, methodology: { statement: 'Current sample.', salaryMethod: 'Disclosed salaries only.', sponsorshipMethod: 'Register context only.' } }), { status: 200 })));
    const user = userEvent.setup();
    render(<CareerMarketExplorer />);
    await user.type(screen.getByLabelText(/role or occupation/i), 'Analyst');
    await user.click(screen.getByRole('button', { name: /explore market/i }));

    await screen.findByRole('heading', { name: /market overview/i });
    expect(screen.queryByRole('heading', { name: /^work style$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
  });
});
