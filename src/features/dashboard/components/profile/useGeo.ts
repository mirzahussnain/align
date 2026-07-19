'use client';

import { useEffect, useState } from 'react';

export interface CountryOption {
  name: string;
  iso2: string;
  dialCode: string;
}

// Module-level caches so switching between the onboarding wizard and the
// dashboard profile tab (or re-opening a section) never re-fetches the same
// reference data.
let countriesPromise: Promise<CountryOption[]> | null = null;
const statesCache = new Map<string, Promise<string[]>>();
const citiesCache = new Map<string, Promise<string[]>>();

function loadCountries(): Promise<CountryOption[]> {
  countriesPromise ??= fetch('/api/geo/countries')
    .then((r) => r.json())
    .then((j) => (j.countries as CountryOption[]) ?? [])
    .catch(() => {
      countriesPromise = null; // allow a retry on next mount
      return [];
    });
  return countriesPromise;
}

function loadStates(country: string): Promise<string[]> {
  if (!statesCache.has(country)) {
    statesCache.set(
      country,
      fetch(`/api/geo/states?country=${encodeURIComponent(country)}`)
        .then((r) => r.json())
        .then((j) => (j.states as string[]) ?? [])
        .catch(() => {
          statesCache.delete(country);
          return [];
        })
    );
  }
  return statesCache.get(country)!;
}

function loadCities(country: string, state: string): Promise<string[]> {
  const key = `${country}::${state}`;
  if (!citiesCache.has(key)) {
    const qs = new URLSearchParams({ country });
    if (state) qs.set('state', state);
    citiesCache.set(
      key,
      fetch(`/api/geo/cities?${qs.toString()}`)
        .then((r) => r.json())
        .then((j) => (j.cities as string[]) ?? [])
        .catch(() => {
          citiesCache.delete(key);
          return [];
        })
    );
  }
  return citiesCache.get(key)!;
}

export function useCountries(): { countries: CountryOption[]; loading: boolean } {
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    loadCountries().then((c) => {
      if (active) {
        setCountries(c);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  return { countries, loading };
}

export function useStates(country: string): { states: string[]; loading: boolean } {
  // `loading` is derived from whether the resolved key still matches the current
  // country, so the only setState happens inside the async callback (no
  // synchronous setState in the effect body).
  const [resolved, setResolved] = useState<{ key: string; states: string[] }>({ key: '', states: [] });
  useEffect(() => {
    let active = true;
    (country ? loadStates(country) : Promise.resolve<string[]>([])).then((states) => {
      if (active) setResolved({ key: country, states });
    });
    return () => {
      active = false;
    };
  }, [country]);
  const inSync = resolved.key === country;
  return { states: inSync ? resolved.states : [], loading: !inSync };
}

export function useCities(country: string, state: string): { cities: string[]; loading: boolean } {
  const key = `${country}::${state}`;
  const [resolved, setResolved] = useState<{ key: string; cities: string[] }>({ key: '::', cities: [] });
  useEffect(() => {
    let active = true;
    (country ? loadCities(country, state) : Promise.resolve<string[]>([])).then((cities) => {
      if (active) setResolved({ key, cities });
    });
    return () => {
      active = false;
    };
  }, [country, state, key]);
  const inSync = resolved.key === key;
  return { cities: inSync ? resolved.cities : [], loading: country ? !inSync : false };
}
