'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Job } from '@/shared/types/job';

export function useJobs() {
  // Seeded from the URL so a shared /jobs?query=... link searches on load
  // without an effect having to set state after mount.
  const [query, setQuery] = useState(() =>
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('query') ?? ''
      : ''
  );
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('all');
  const [contractType, setContractType] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [salaryMin, setSalaryMin] = useState('');
  const [sponsorshipFilter, setSponsorshipFilter] = useState('all');
  const [experienceLevel, setExperienceLevel] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sources, setSources] = useState<{ name: string; count: number; error?: string }[]>([]);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const isFirstMount = useRef(true);

  const searchJobs = useCallback(async (pageNumber: number = 1, overrideQuery?: string) => {
    const activeQuery = overrideQuery !== undefined ? overrideQuery : query;
    if (!activeQuery.trim()) return;

    setIsLoading(true);
    setError(null);
    setHasSearched(true);
    setPage(pageNumber);

    try {
      const params = new URLSearchParams({
        query: activeQuery.trim(),
        tech: techFilter !== 'all' ? techFilter : '',
        location: location.trim(),
        source,
        contractType,
        page: String(pageNumber),
        perPage: '50',
        sponsorship: sponsorshipFilter,
        experience: experienceLevel,
        sortBy: sortBy,
      });

      if (salaryMin) {
        params.set('salaryMin', salaryMin);
      }

      const response = await fetch(`/api/jobs?${params}`);
      
      if (!response.ok) {
        throw new Error('Failed to query job listings');
      }

      const data = await response.json();

      if (pageNumber === 1) {
        setJobs(data.jobs || []);
        setSources(data.sources || []);
      } else {
        setJobs(prev => {
          const newJobs = (data.jobs || []).filter((j: Job) => !prev.some(p => p.id === j.id));
          return [...prev, ...newJobs];
        });
        setSources(prev => {
          const newSources = [...prev];
          (data.sources || []).forEach((s: { name: string; count: number; error?: string }) => {
            const existing = newSources.find(x => x.name === s.name);
            if (existing) {
              existing.count += s.count;
            } else {
              newSources.push(s);
            }
          });
          return newSources;
        });
      }
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred during search');
      setJobs([]);
      setTotal(0);
      setSources([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, location, source, contractType, techFilter, salaryMin, sponsorshipFilter, experienceLevel, sortBy]);

  // Auto-search when filters change (debounced); skipped on first mount so
  // landing on the page never fires an empty search.
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    if (hasSearched) {
      const timer = setTimeout(() => {
        searchJobs(1);
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes `query`: typing must not auto-search
  }, [source, contractType, techFilter, salaryMin, sponsorshipFilter, experienceLevel, sortBy]);

  // A URL-seeded query searches immediately on load. Deferred a tick so the
  // search's own state updates never run synchronously inside the effect.
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(() => searchJobs(1, query), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only by design
  }, []);

  return {
    query,
    setQuery,
    location,
    setLocation,
    source,
    setSource,
    contractType,
    setContractType,
    techFilter,
    setTechFilter,
    salaryMin,
    setSalaryMin,
    sponsorshipFilter,
    setSponsorshipFilter,
    experienceLevel,
    setExperienceLevel,
    sortBy,
    setSortBy,
    jobs,
    total,
    isLoading,
    hasSearched,
    sources,
    error,
    page,
    searchJobs,
  };
}
