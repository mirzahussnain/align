// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useJobs } from '../useJobs';
import { blankSponsorSignal } from '@/shared/services/job-normalisation';
import type { NormalisedJob } from '@/shared/types/job';

const vacancy: NormalisedJob = {
  source: 'REED',
  sourceJobId: '1',
  providerReferences: [{ provider: 'REED', sourceJobId: '1', sourceUrl: 'https://example.com/1' }],
  canonicalUrl: 'https://example.com/1',
  title: 'IT Support Technician',
  company: 'Acme Ltd',
  locationText: 'Birmingham',
  descriptionAvailability: 'FULL',
  remoteType: 'ONSITE',
  sponsorSignal: blankSponsorSignal(),
  eligibilityHints: [],
  dedupeFingerprint: 'fingerprint-1',
  canonicalJobId: 'canonical-1',
  fetchedAt: '2026-07-28T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);

/** Routes each request by URL so a test only has to describe what it cares about. */
function mockFetch(handlers: { savedJobs?: () => Promise<Response>; save?: () => Promise<Response>; remove?: () => Promise<Response> } = {}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/jobs/bootstrap')) return json({ profiles: [], selectedProfile: null, defaultSearch: { query: 'it support', location: 'Birmingham' } });
    if (url.startsWith('/api/jobs?')) return json({ jobs: [vacancy], sessionId: 'session-1', meta: { providerCounts: [] } });
    if (url.startsWith('/api/saved-jobs') && init?.method === 'DELETE') return (handlers.remove ?? (() => json({ ok: true })))();
    if (url.startsWith('/api/saved-jobs') && init?.method === 'POST') return (handlers.save ?? (() => json({ saved: { id: 'saved-1' } }, 201)))();
    if (url.startsWith('/api/saved-jobs')) return (handlers.savedJobs ?? (() => json({ jobs: [] })))();
    return json({}, 404);
  });
}

async function mounted(handlers?: Parameters<typeof mockFetch>[0]) {
  vi.stubGlobal('fetch', mockFetch(handlers));
  const view = renderHook(() => useJobs());
  await waitFor(() => expect(view.result.current.initialising).toBe(false));
  return view;
}

beforeEach(() => {
  window.history.replaceState(null, '', '/jobs');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('saved state is reconciled with the server', () => {
  it('marks a job saved on load when the server already holds it', async () => {
    const { result } = await mounted({ savedJobs: () => json({ jobs: [{ id: 'saved-1', canonicalIdentity: 'fingerprint-1' }] }) });
    // The card previously started every result as unsaved regardless of what the
    // user had already saved, because the flag was component-local.
    expect(result.current.isSaved(vacancy)).toBe(true);
  });

  it('starts unsaved when the server holds nothing', async () => {
    const { result } = await mounted();
    expect(result.current.isSaved(vacancy)).toBe(false);
  });
});

describe('save and unsave', () => {
  it('saves optimistically and keeps the state once the server confirms', async () => {
    const { result } = await mounted();
    await act(async () => { await result.current.toggleSave(vacancy); });
    expect(result.current.isSaved(vacancy)).toBe(true);
    expect(result.current.saveAlert).toBeNull();
  });

  it('unsaves a previously saved job', async () => {
    const { result } = await mounted({ savedJobs: () => json({ jobs: [{ id: 'saved-1', canonicalIdentity: 'fingerprint-1' }] }) });
    await act(async () => { await result.current.toggleSave(vacancy); });
    expect(result.current.isSaved(vacancy)).toBe(false);
  });
});

describe('failures roll the optimistic update back', () => {
  it('restores the unsaved state and explains a plain failure', async () => {
    const { result } = await mounted({ save: () => json({ error: 'Unable to save this job.' }, 500) });
    await act(async () => { await result.current.toggleSave(vacancy); });

    // The button must not sit on "Saved" for a job the server never stored.
    expect(result.current.isSaved(vacancy)).toBe(false);
    expect(result.current.saveAlert?.kind).toBe('error');
  });

  it('restores the saved state when removal fails', async () => {
    const { result } = await mounted({
      savedJobs: () => json({ jobs: [{ id: 'saved-1', canonicalIdentity: 'fingerprint-1' }] }),
      remove: () => json({ error: 'nope' }, 500),
    });
    await act(async () => { await result.current.toggleSave(vacancy); });
    expect(result.current.isSaved(vacancy)).toBe(true);
  });

  it('surfaces a quota limit as a persistent, actionable alert', async () => {
    const { result } = await mounted({
      save: () => json({ code: 'ENTITLEMENT_REQUIRED', capability: 'saved_jobs', reason: 'resource_limit_reached', plan: 'FREE', limit: 10 }, 403),
    });
    await act(async () => { await result.current.toggleSave(vacancy); });

    expect(result.current.isSaved(vacancy)).toBe(false);
    expect(result.current.saveAlert?.kind).toBe('entitlement');
    // The message has to say what the limit is and what the user can do, since
    // this is not a transient failure they can simply retry past.
    expect(result.current.saveAlert?.message).toContain('10');
    expect(result.current.saveAlert?.message).toMatch(/remove one|upgrade/i);
  });

  it('lets the user dismiss the alert', async () => {
    const { result } = await mounted({ save: () => json({ error: 'boom' }, 500) });
    await act(async () => { await result.current.toggleSave(vacancy); });
    expect(result.current.saveAlert).not.toBeNull();
    act(() => { result.current.dismissSaveAlert(); });
    expect(result.current.saveAlert).toBeNull();
  });
});

describe('search resilience', () => {
  it('keeps existing results when a refresh fails', async () => {
    const { result } = await mounted();
    expect(result.current.jobs).toHaveLength(1);

    vi.stubGlobal('fetch', vi.fn(() => json({ error: 'down' }, 500)));
    await act(async () => { await result.current.searchJobs(false); });

    // A failed refresh used to blank the list, losing the user's place to
    // report a problem the inline error already states.
    expect(result.current.jobs).toHaveLength(1);
    expect(result.current.error).toBeTruthy();
  });
});
