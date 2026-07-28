'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalisedJob, ProviderCount } from '@/shared/types/job';

/** One page of results. The server caps this too; the client must not guess it. */
export const JOBS_PER_PAGE = 15;

type Track = {
  profileId: string;
  label: string;
  isDefault: boolean;
  targetRoleTitle: string;
  targetOccupation: string;
  targetIndustry: string;
  targetSeniority: string;
};

type SearchOverride = { query?: string; location?: string; profileId?: string };

/**
 * A save/unsave problem the user must act on. Entitlement limits are not
 * transient, so they stay on screen as an inline alert rather than flashing past
 * in a toast — the user has to upgrade or remove a saved job to proceed.
 */
type SaveAlert = { message: string; kind: 'entitlement' | 'error' };

/** Placeholder id held while a save is in flight and the real id is unknown. */
const PENDING_SAVE = '__pending__';

export function useJobs() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('all');
  const [contractType, setContractType] = useState('all');
  const [salaryMin, setSalaryMin] = useState('');
  const [sponsorshipFilter, setSponsorshipFilter] = useState('all');
  const [experienceLevel, setExperienceLevel] = useState('all');
  const [remoteType, setRemoteType] = useState('all');
  const [postedWithinDays, setPostedWithinDays] = useState('');
  const [sortBy, setSortBy] = useState('relevance');

  const [jobs, setJobs] = useState<NormalisedJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const [profiles, setProfiles] = useState<Track[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<Track | null>(null);
  const [providerCounts, setProviderCounts] = useState<ProviderCount[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [partialMessage, setPartialMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** canonicalIdentity (dedupeFingerprint) → SavedJob id. */
  const [savedJobIds, setSavedJobIds] = useState<Record<string, string>>({});
  const [savingIdentities, setSavingIdentities] = useState<string[]>([]);
  const [saveAlert, setSaveAlert] = useState<SaveAlert | null>(null);

  const searchRef = useRef<AbortController | null>(null);
  /**
   * Signature of the request currently in flight. Two components mounting, a
   * double submit or a career-track switch that resolves to the same criteria
   * used to abort the running request and start an identical one — burning a
   * provider round trip and flickering the list — so an identical request that
   * is already running is now joined rather than restarted.
   */
  const inFlightSignatureRef = useRef<string | null>(null);

  const searchJobs = useCallback(
    async (loadMore = false, override: SearchOverride = {}) => {
      const activeQuery = override.query ?? query;
      const activeLocation = override.location ?? location;
      if (!activeQuery.trim()) return;

      const params = new URLSearchParams({
        query: activeQuery.trim(),
        location: activeLocation.trim(),
        source,
        contractType,
        perPage: String(JOBS_PER_PAGE),
        sponsorship: sponsorshipFilter,
        experience: experienceLevel,
        remoteType,
        sortBy,
      });
      if (salaryMin) params.set('salaryMin', salaryMin);
      if (postedWithinDays) params.set('postedWithinDays', postedWithinDays);

      const signature = `${loadMore ? 'more' : 'new'}:${params.toString()}`;
      if (inFlightSignatureRef.current === signature) return;
      if (loadMore && sessionId) params.set('sessionId', sessionId);

      searchRef.current?.abort();
      const controller = new AbortController();
      searchRef.current = controller;
      inFlightSignatureRef.current = signature;
      setIsLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const response = await fetch(`/api/jobs?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Unable to search job sources right now.');
        const data = await response.json();
        const incoming = data.jobs as NormalisedJob[];

        setSessionId(data.sessionId);
        setProviderCounts(data.meta?.providerCounts ?? []);
        setPartialMessage(data.meta?.message ?? null);
        // Compared against the page size actually requested. Hardcoding 15 here
        // meant any other page size either hid a Load more that was warranted or
        // offered one that returned nothing.
        setHasMore(incoming.length === JOBS_PER_PAGE);
        setJobs((previous) =>
          loadMore
            ? [...previous, ...incoming.filter((job) => !previous.some((existing) => existing.canonicalJobId === job.canonicalJobId))]
            : incoming
        );
        if (!loadMore) window.history.replaceState(null, '', `/jobs?${params}`);
      } catch (caught) {
        if ((caught as Error).name !== 'AbortError') {
          setError(caught instanceof Error ? caught.message : 'Unable to search jobs.');
          // The previous results are deliberately kept. Clearing them on a failed
          // refresh replaced a working list with an empty page, which loses the
          // user's place and their scroll position to report a problem an inline
          // message already conveys.
        }
      } finally {
        if (inFlightSignatureRef.current === signature) inFlightSignatureRef.current = null;
        if (!controller.signal.aborted) setIsLoading(false);
      }
    },
    [query, location, source, contractType, salaryMin, sponsorshipFilter, experienceLevel, remoteType, postedWithinDays, sortBy, sessionId]
  );

  /**
   * Which results the user has already saved. A signed-out visitor gets a 401
   * here, which is not an error worth showing — the board simply has no saved
   * state to reconcile against.
   */
  const loadSavedJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/saved-jobs');
      if (!response.ok) return;
      const data = await response.json();
      const rows = (data.jobs ?? []) as { id: string; canonicalIdentity: string }[];
      setSavedJobIds(Object.fromEntries(rows.map((row) => [row.canonicalIdentity, row.id])));
    } catch {
      // Saved state is additive; failing to load it must not block discovery.
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/jobs/bootstrap');
        const data = await response.json();
        const track = data.selectedProfile as Track | null;
        setProfiles(data.profiles ?? []);
        setSelectedProfile(track);
        const initial = new URLSearchParams(window.location.search);
        const urlQuery = initial.get('query');
        const nextQuery = urlQuery || data.defaultSearch.query;
        const nextLocation = initial.get('location') ?? data.defaultSearch.location;
        setQuery(nextQuery);
        setLocation(nextLocation);
        await Promise.all([
          searchJobs(false, { query: nextQuery, location: nextLocation, profileId: track?.profileId }),
          loadSavedJobs(),
        ]);
      } catch {
        setError('Unable to prepare your Job Board search.');
      } finally {
        setInitialising(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectProfile = useCallback(
    (profileId: string) => {
      const track = profiles.find((profile) => profile.profileId === profileId) ?? null;
      if (!track) return;
      const nextQuery = track.targetRoleTitle || track.targetOccupation || track.targetIndustry || 'jobs';
      setSelectedProfile(track);
      setQuery(nextQuery);
      setSessionId(null);
      searchJobs(false, { query: nextQuery, profileId });
    },
    [profiles, searchJobs]
  );

  /**
   * Save or unsave, applied to the UI immediately and rolled back if the server
   * refuses. The button previously flipped to "Saved" on a local flag that was
   * never reconciled with the server, could not be undone, and stayed lit even
   * when the request had failed.
   */
  const toggleSave = useCallback(
    async (job: NormalisedJob) => {
      const identity = job.dedupeFingerprint;
      if (savingIdentities.includes(identity)) return;

      const existingId = savedJobIds[identity];
      const rollback = () =>
        setSavedJobIds((previous) => {
          const next = { ...previous };
          if (existingId) next[identity] = existingId;
          else delete next[identity];
          return next;
        });

      setSaveAlert(null);
      setSavingIdentities((previous) => [...previous, identity]);
      setSavedJobIds((previous) => {
        const next = { ...previous };
        if (existingId) delete next[identity];
        else next[identity] = PENDING_SAVE;
        return next;
      });

      try {
        if (existingId) {
          const response = await fetch(`/api/saved-jobs?id=${encodeURIComponent(existingId)}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Unable to remove this saved job.');
        } else {
          const response = await fetch('/api/saved-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job, profileId: selectedProfile?.profileId }),
          });
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            if (body?.code === 'ENTITLEMENT_REQUIRED') {
              const limit = typeof body.limit === 'number' ? body.limit : null;
              throw Object.assign(
                new Error(
                  limit === null
                    ? 'Saving jobs is not available on your current plan.'
                    : `You have saved the maximum of ${limit} jobs on your current plan. Remove one, or upgrade to save more.`
                ),
                { kind: 'entitlement' as const }
              );
            }
            throw new Error(body?.error ?? 'Unable to save this job.');
          }
          setSavedJobIds((previous) => ({ ...previous, [identity]: body.saved.id }));
        }
      } catch (caught) {
        rollback();
        const kind = (caught as { kind?: 'entitlement' }).kind === 'entitlement' ? 'entitlement' : 'error';
        setSaveAlert({ message: caught instanceof Error ? caught.message : 'Unable to update your saved jobs.', kind });
      } finally {
        setSavingIdentities((previous) => previous.filter((value) => value !== identity));
      }
    },
    [savedJobIds, savingIdentities, selectedProfile]
  );

  const isSaved = useCallback((job: NormalisedJob) => Boolean(savedJobIds[job.dedupeFingerprint]), [savedJobIds]);
  const isSaving = useCallback((job: NormalisedJob) => savingIdentities.includes(job.dedupeFingerprint), [savingIdentities]);

  return {
    query, setQuery, location, setLocation, source, setSource, contractType, setContractType,
    salaryMin, setSalaryMin, sponsorshipFilter, setSponsorshipFilter, experienceLevel, setExperienceLevel,
    remoteType, setRemoteType, postedWithinDays, setPostedWithinDays, sortBy, setSortBy,
    jobs, isLoading, hasSearched, initialising, profiles, selectedProfile, selectProfile,
    providerCounts, error, hasMore, partialMessage, searchJobs,
    isSaved, isSaving, toggleSave, saveAlert, dismissSaveAlert: () => setSaveAlert(null),
  };
}
