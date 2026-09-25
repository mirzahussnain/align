// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PublicJobsSearch from '../PublicJobsSearch';

const response = {
  jobs: [
    {
      id: 'public-job-1',
      title: 'Registered Nurse',
      company: { displayName: 'North NHS Trust' },
      location: 'Leeds',
      workplaceType: 'ONSITE',
      employmentType: 'Permanent',
      salary: { text: '£29,970 to £36,483' },
      postedAt: '2026-09-24T10:00:00.000Z',
      fullDescriptionExternalUrl: 'https://www.jobs.nhs.uk/candidate/jobadvert/C1234',
      sourceSummary: { preferredProvider: 'NHS_JOBS', providerCount: 1, employerDirect: true },
      sponsorEvidenceSummary: { label: 'Register evidence available' },
      saved: false,
    },
  ],
  sessionId: 'session-1',
  meta: { hasMore: false, partialResults: false, providerCounts: [] },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('public job discovery', () => {
  it('searches anonymously and renders original provider vacancies without personalized actions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify(response), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/keyword or role/i), 'nurse');
    await user.type(screen.getByLabelText(/^location/i), 'Leeds');
    await user.selectOptions(screen.getByLabelText(/contract type/i), 'permanent');
    await user.click(screen.getByRole('button', { name: /search vacancies/i }));

    await screen.findByRole('heading', { name: 'Registered Nurse' });
    expect(screen.getByText('North NHS Trust')).toBeInTheDocument();
    expect(screen.getByText('£29,970 to £36,483')).toBeInTheDocument();
    expect(screen.getByText('NHS Jobs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /visit original job posting/i })).toHaveAttribute(
      'href',
      'https://www.jobs.nhs.uk/candidate/jobadvert/C1234',
    );
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /match/i })).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('query=nurse');
    expect(requested).toContain('location=Leeds');
    expect(requested).toContain('contractType=permanent');
  });

  it('shows a useful recovery state when the provider request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/keyword or role/i), 'analyst');
    await user.click(screen.getByRole('button', { name: /search vacancies/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/try the search again/i);
  });
});
