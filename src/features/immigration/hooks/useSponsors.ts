'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Sponsor } from '@/shared/types/job';

export type SponsorRegisterMetadata = {
  releaseVersion: string;
  registerVersion: string;
  publishedAt?: string;
  rowCount: number;
  source: 'BUNDLED_RELEASE' | 'LIVE_FALLBACK';
};

export function useSponsors() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || searchParams.get('query') || '';

  const [query, setQuery] = useState(initialQuery);
  const [route, setRoute] = useState('all');
  const [industry, setIndustry] = useState('all');
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [register, setRegister] = useState<SponsorRegisterMetadata | null>(null);

  useEffect(() => {
    const urlQuery = searchParams.get('q') || searchParams.get('query') || '';
    if (urlQuery && urlQuery !== query) {
      setQuery(urlQuery);
    }
  }, [searchParams]);

  const fetchSponsors = async (searchQuery: string, searchRoute: string, searchIndustry: string, targetPage: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        query: searchQuery.trim(),
        route: searchRoute,
        industry: searchIndustry,
        page: String(targetPage),
        perPage: '10'
      });
      const response = await fetch(`/api/sponsors?${params}`);
      
      if (!response.ok) {
         throw new Error('Failed to load sponsors data');
      }
      
      const data = await response.json();
      
      if (data.error) {
         throw new Error(data.error);
      }
      
      setSponsors(data.sponsors || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
      setRegister(data.register || null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An error occurred loading sponsors');
      setSponsors([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      fetchSponsors(query, route, industry, 1);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [query, route, industry]);

  const handlePageChange = (newPage: number) => {
    fetchSponsors(query, route, industry, newPage);
  };

  return {
    query,
    setQuery,
    route,
    setRoute,
    industry,
    setIndustry,
    sponsors,
    total,
    isLoading,
    page,
    error,
    register,
    handlePageChange,
  };
}
