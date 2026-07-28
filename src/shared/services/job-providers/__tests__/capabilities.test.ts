import { describe, expect, it } from 'vitest';
import {
  EMPLOYER_ATS_PROVIDERS,
  SEARCH_JOB_PROVIDERS,
  isEmployerAtsProvider,
  isSearchJobProvider,
} from '@/shared/types/job';
import {
  JOB_PROVIDER_CAPABILITIES,
  getProviderCapabilities,
  isInteractiveProvider,
  pushdownFilters,
} from '../capabilities';
import {
  getEmployerAtsAdapter,
  getProviderKind,
  getSearchAdapter,
  listEmployerAtsProviders,
  listImplementedEmployerAtsProviders,
  listSearchProviders,
} from '../registry';
import { SEARCH_PROVIDER_ADAPTERS } from '../search-adapters';

describe('provider taxonomy', () => {
  it('classifies every declared provider as exactly one kind', () => {
    for (const provider of SEARCH_JOB_PROVIDERS) {
      expect(getProviderKind(provider)).toBe('SEARCH');
      expect(isSearchJobProvider(provider)).toBe(true);
      expect(isEmployerAtsProvider(provider)).toBe(false);
    }
    for (const provider of EMPLOYER_ATS_PROVIDERS) {
      expect(getProviderKind(provider)).toBe('EMPLOYER_ATS');
      expect(isEmployerAtsProvider(provider)).toBe(true);
      expect(isSearchJobProvider(provider)).toBe(false);
    }
  });

  it('declares capabilities for every provider and nothing else', () => {
    expect(Object.keys(JOB_PROVIDER_CAPABILITIES).sort()).toEqual(
      [...SEARCH_JOB_PROVIDERS, ...EMPLOYER_ATS_PROVIDERS].sort()
    );
  });

  it('preserves the three existing market-wide providers', () => {
    expect(listSearchProviders()).toEqual(['ADZUNA', 'REED', 'JOOBLE']);
  });

  it('declares the four employer-ATS providers ahead of their integrations', () => {
    expect(listEmployerAtsProviders()).toEqual(['GREENHOUSE', 'LEVER', 'SMARTRECRUITERS', 'ASHBY']);
    // Phase 8A registers Greenhouse; the remaining ATS providers remain declarations only.
    expect(listImplementedEmployerAtsProviders()).toEqual(['GREENHOUSE']);
    expect(getEmployerAtsAdapter('GREENHOUSE')).not.toBeNull();
  });
});

describe('search provider capabilities', () => {
  it('exposes a configured check and an adapter for each search provider', () => {
    for (const provider of SEARCH_JOB_PROVIDERS) {
      const adapter = getSearchAdapter(provider);
      expect(adapter.provider).toBe(provider);
      expect(adapter.label).toBeTruthy();
      expect(typeof adapter.isConfigured()).toBe('boolean');
      expect(adapter.capabilities.kind).toBe('SEARCH');
    }
    expect(Object.keys(SEARCH_PROVIDER_ADAPTERS)).toHaveLength(SEARCH_JOB_PROVIDERS.length);
  });

  it('lets every search provider run on the interactive path within a sub-2s budget', () => {
    for (const provider of SEARCH_JOB_PROVIDERS) {
      const capabilities = getProviderCapabilities(provider);
      expect(isInteractiveProvider(provider)).toBe(true);
      expect(capabilities.interactiveTimeoutMs).toBeGreaterThan(0);
      expect(capabilities.interactiveTimeoutMs).toBeLessThanOrEqual(2_000);
      // The background budget must be the more generous of the two, or a
      // background refresh would be cut off sooner than a user-facing search.
      expect(capabilities.backgroundTimeoutMs).toBeGreaterThan(capabilities.interactiveTimeoutMs);
    }
  });

  it('does not claim a filter the integration never sends', () => {
    // Jooble takes no contract-type parameter, so contract filtering is local.
    expect(pushdownFilters('JOOBLE').contractType).toBe(false);
    // Reed's integration sends no sort parameter, so every order is local.
    expect(getProviderCapabilities('REED').sortOptions).toEqual([]);
    // No search provider currently filters on work style or posting age.
    for (const provider of SEARCH_JOB_PROVIDERS) {
      expect(pushdownFilters(provider).remote).toBe(false);
      expect(pushdownFilters(provider).postedWithin).toBe(false);
    }
  });

  it('records that aggregator descriptions are never a guaranteed full advert', () => {
    // This is what stops the completeness classifier from promoting a snippet.
    expect(getProviderCapabilities('JOOBLE').descriptionSemantics).toBe('SNIPPET');
    for (const provider of SEARCH_JOB_PROVIDERS) {
      expect(getProviderCapabilities(provider).descriptionSemantics).not.toBe('FULL');
      // None of the three link to the employer's own application page.
      expect(getProviderCapabilities(provider).employerDirectUrl).toBe(false);
    }
  });
});

describe('employer-ATS capabilities', () => {
  it('requires a board identifier and offers no market-wide query', () => {
    for (const provider of EMPLOYER_ATS_PROVIDERS) {
      const capabilities = getProviderCapabilities(provider);
      expect(capabilities.requiresEmployerIdentifier).toBe(true);
      expect(capabilities.keywordSearch).toBe(false);
      expect(capabilities.locationSearch).toBe(false);
    }
  });

  it('bars every employer board from the interactive path', () => {
    // Fanning a user's search across employer boards is the access pattern this
    // taxonomy exists to prevent: they are served from cache or snapshots.
    for (const provider of EMPLOYER_ATS_PROVIDERS) {
      expect(isInteractiveProvider(provider)).toBe(false);
      expect(getProviderCapabilities(provider).interactiveTimeoutMs).toBe(0);
      expect(getProviderCapabilities(provider).backgroundTimeoutMs).toBeGreaterThan(0);
    }
  });

  it('records that employer boards give the employerâ€™s own application URL', () => {
    for (const provider of EMPLOYER_ATS_PROVIDERS) {
      expect(getProviderCapabilities(provider).employerDirectUrl).toBe(true);
    }
  });
});
