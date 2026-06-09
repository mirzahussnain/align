'use client';

import { useState, useEffect, useRef } from 'react';
import type { Job } from '@/shared/types/job';

export function useJobs() {
  const [query, setQuery] = useState('');
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

  // Auto-search when filters change
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
  }, [source, contractType, techFilter, salaryMin, sponsorshipFilter, experienceLevel, sortBy]);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const initialQuery = params.get('query');
      if (initialQuery) {
        setQuery(initialQuery);
        searchJobs(1, initialQuery);
      }
    }
  }, []);

  const searchJobs = async (pageNumber: number = 1, overrideQuery?: string) => {
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
  };

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
