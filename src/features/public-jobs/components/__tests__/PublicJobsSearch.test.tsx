// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  it('uses title case for the public job-board heading', () => {
    render(<PublicJobsSearch />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Find Your Next UK Opportunity',
    );
  });

  it('keeps the dashboard continuation with the search controls above the results canvas', () => {
    render(<PublicJobsSearch />);

    const chapter = screen.getByTestId('jobs-search-chapter');
    const results = screen.getByTestId('jobs-results-canvas');
    expect(chapter.className).toContain('linear-gradient');
    expect(within(chapter).getByRole('link', { name: /continue in your dashboard/i })).toBeInTheDocument();
    expect(within(results).queryByRole('link', { name: /continue in your dashboard/i })).not.toBeInTheDocument();
  });

  it('uses an incoming public resource query as the initial search value', () => {
    render(<PublicJobsSearch initialQuery="North NHS Trust" />);
    expect(screen.getByLabelText(/job title/i)).toHaveValue('North NHS Trust');
  });

  it('bounds independent filter scrolling to the desktop sidebar breakpoint', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<PublicJobsSearch initialQuery="Engineer" />);

    const filterRail = screen.getByRole('complementary', { name: /job filters/i });
    const filterScroller = within(filterRail).getByTestId('jobs-filter-scroll');
    const resultsShell = screen.getByTestId('jobs-results-shell');
    expect(resultsShell).toContainElement(filterRail);
    expect(filterRail).toHaveClass('lg:rounded-none', 'lg:border-l');
    expect(filterScroller).toHaveClass('lg:sticky', 'lg:overflow-y-auto');
    expect(filterRail.className).not.toMatch(/(?:^|\s)overflow-y-auto(?:\s|$)/);

    fireEvent.scroll(filterScroller, { target: { scrollTop: 120 } });

    expect(screen.getByLabelText(/job title/i)).toHaveValue('Engineer');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prevents an empty request before it reaches the jobs API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/enter a job title or keyword/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches anonymously and renders original provider vacancies without personalized actions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify(response), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/job title/i), 'nurse');
    await user.type(screen.getByLabelText(/^location/i), 'Leeds');
    await user.selectOptions(screen.getByLabelText(/contract type/i), 'permanent');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await screen.findByRole('heading', { name: 'Registered Nurse' });
    expect(screen.getByText('North NHS Trust')).toBeInTheDocument();
    expect(screen.getByText('£29,970 to £36,483')).toBeInTheDocument();
    expect(screen.getAllByText('NHS Jobs')).not.toHaveLength(0);
    expect(screen.getByRole('link', { name: /view original posting/i })).toHaveAttribute(
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

  it('sends supported decision-useful filters to the public jobs API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return new Response(JSON.stringify(response), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/job title/i), 'analyst');
    await user.selectOptions(screen.getByLabelText(/experience level/i), 'senior');
    await user.selectOptions(screen.getByLabelText(/minimum salary/i), '50000');
    await user.selectOptions(screen.getByLabelText(/sponsorship context/i), 'registered');
    await user.selectOptions(screen.getByLabelText(/source/i), 'nhs_jobs');
    await user.selectOptions(screen.getByLabelText(/sort results/i), 'salary_desc');
    await user.click(screen.getByRole('button', { name: /apply filters/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://align.test');
    expect(Object.fromEntries(requested.searchParams)).toMatchObject({
      query: 'analyst',
      experience: 'senior',
      salaryMin: '50000',
      sponsorship: 'registered',
      source: 'nhs_jobs',
      sortBy: 'salary_desc',
    });
  });

  it('shows a useful recovery state when the provider request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/job title/i), 'analyst');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/try the search again/i);
  });

  it('does not display an unknown workplace type as a vacancy tag', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...response,
      jobs: [{ ...response.jobs[0], workplaceType: 'UNKNOWN' }],
    }), { status: 200 })));
    const user = userEvent.setup();
    render(<PublicJobsSearch />);

    await user.type(screen.getByLabelText(/job title/i), 'nurse');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await screen.findByRole('heading', { name: 'Registered Nurse' });
    expect(screen.queryByText(/^unknown$/i)).not.toBeInTheDocument();
  });
});
