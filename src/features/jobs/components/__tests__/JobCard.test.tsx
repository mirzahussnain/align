// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobCard from '../JobCard';
import { blankSponsorSignal } from '@/shared/services/job-normalisation';
import type { NormalisedJob } from '@/shared/types/job';

afterEach(cleanup);

function job(overrides: Partial<NormalisedJob> = {}): NormalisedJob {
  return {
    source: 'REED',
    sourceJobId: '1',
    providerReferences: [{ provider: 'REED', sourceJobId: '1', sourceUrl: 'https://example.com/1' }],
    canonicalUrl: 'https://example.com/1',
    title: 'IT Support Technician',
    company: 'Acme Ltd',
    companyNormalised: 'acme',
    locationText: 'Birmingham',
    descriptionAvailability: 'FULL',
    remoteType: 'ONSITE',
    sponsorSignal: blankSponsorSignal(),
    eligibilityHints: [],
    dedupeFingerprint: 'fingerprint-1',
    canonicalJobId: 'canonical-1',
    fetchedAt: '2026-07-28T00:00:00.000Z',
    ...overrides,
  };
}

const render_ = (props: Partial<React.ComponentProps<typeof JobCard>> = {}) =>
  render(<JobCard job={job()} saved={false} saving={false} onToggleSave={vi.fn()} {...props} />);

describe('JobCard relevance claims', () => {
  it('makes no Career Track relevance claim before an analysis exists', () => {
    render_();
    // This card used to state "Career Track relevance: Strong title alignment"
    // on every vacancy, computed from nothing.
    expect(screen.queryByText(/career track relevance/i)).toBeNull();
    expect(screen.queryByText(/strong title alignment/i)).toBeNull();
  });

  it('shows no fit percentage', () => {
    render_();
    expect(screen.queryByText(/\d+%\s*(fit|match)/i)).toBeNull();
  });
});

describe('JobCard sponsorship wording', () => {
  it('says the employer appears on the register, not that the role is sponsored', () => {
    render_({ job: job({ sponsorSignal: { ...blankSponsorSignal(), registerMatchStatus: 'EXACT' } }) });
    expect(screen.getByText(/appears on sponsor register/i)).toBeInTheDocument();
    expect(screen.queryByText(/visa.friendly|guaranteed sponsorship|sponsoring vacancy/i)).toBeNull();
  });

  it('describes an uncertain register match as possible rather than confirmed', () => {
    render_({ job: job({ sponsorSignal: { ...blankSponsorSignal(), registerMatchStatus: 'LIKELY' } }) });
    expect(screen.getByText(/possible sponsor-register match/i)).toBeInTheDocument();
  });
});

describe('JobCard save control', () => {
  it('reflects saved state from the server rather than a local flag', () => {
    render_({ saved: true });
    const control = screen.getByRole('button', { name: /saved/i });
    // aria-pressed is what makes the state available to assistive tech, and it
    // is now driven by reconciled server state instead of a one-way local flag.
    expect(control).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers unsaving once a job is saved', async () => {
    const onToggleSave = vi.fn();
    render_({ saved: true, onToggleSave });
    await userEvent.click(screen.getByRole('button', { name: /saved/i }));
    expect(onToggleSave).toHaveBeenCalledTimes(1);
  });

  it('blocks a second request while one is in flight', async () => {
    const onToggleSave = vi.fn();
    render_({ saving: true, onToggleSave });
    const control = screen.getByRole('button', { name: /saving/i });
    expect(control).toBeDisabled();
    await userEvent.click(control);
    expect(onToggleSave).not.toHaveBeenCalled();
  });
});

describe('JobCard external action', () => {
  it('labels the provider link as the original listing rather than as applying', () => {
    render_();
    const link = screen.getByRole('link', { name: /open original listing/i });
    expect(link).toHaveAttribute('href', 'https://example.com/1');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.queryByText(/apply now/i)).toBeNull();
  });

  it('says a partial description is partial and what to do about it', () => {
    render_({ job: job({ descriptionAvailability: 'PARTIAL' }) });
    expect(screen.getByText(/supplied only part of the vacancy description/i)).toBeInTheDocument();
  });
});
