/**
 * The vacancy-source registry: the single place that answers "which providers
 * exist, what kind is each, and which are usable right now".
 *
 * Employer-ATS adapters are registered here as they land. Until then
 * `getEmployerAtsAdapter` returns null rather than throwing, so orchestration
 * written against the contract degrades to "no employer-direct results"
 * instead of failing a user's search.
 */

import {
  EMPLOYER_ATS_PROVIDERS,
  SEARCH_JOB_PROVIDERS,
  type EmployerAtsProvider,
  type JobProvider,
  type SearchJobProvider,
} from '@/shared/types/job';
import type { EmployerAtsProviderAdapter, JobProviderKind, SearchJobProviderAdapter } from '@/shared/types/job-provider';
import { JOB_PROVIDER_CAPABILITIES } from './capabilities';
import { SEARCH_PROVIDER_ADAPTERS } from './search-adapters';

/** Employer-ATS adapters, registered per provider as each integration lands. */
const EMPLOYER_ATS_ADAPTERS: Partial<Record<EmployerAtsProvider, EmployerAtsProviderAdapter>> = {};

export function getProviderKind(provider: JobProvider): JobProviderKind {
  return JOB_PROVIDER_CAPABILITIES[provider].kind;
}

export function getSearchAdapter(provider: SearchJobProvider): SearchJobProviderAdapter {
  return SEARCH_PROVIDER_ADAPTERS[provider];
}

/** The adapter for an employer-ATS provider, or null when not yet implemented. */
export function getEmployerAtsAdapter(provider: EmployerAtsProvider): EmployerAtsProviderAdapter | null {
  return EMPLOYER_ATS_ADAPTERS[provider] ?? null;
}

/** Register an employer-ATS adapter. Called by each integration at module load. */
export function registerEmployerAtsAdapter(adapter: EmployerAtsProviderAdapter): void {
  EMPLOYER_ATS_ADAPTERS[adapter.provider] = adapter;
}

export function listSearchProviders(): readonly SearchJobProvider[] {
  return SEARCH_JOB_PROVIDERS;
}

export function listEmployerAtsProviders(): readonly EmployerAtsProvider[] {
  return EMPLOYER_ATS_PROVIDERS;
}

/** Search providers whose credentials are present. Configuration only, no I/O. */
export function listConfiguredSearchProviders(): SearchJobProvider[] {
  return SEARCH_JOB_PROVIDERS.filter((provider) => SEARCH_PROVIDER_ADAPTERS[provider].isConfigured());
}

/** Employer-ATS providers with an implemented adapter. */
export function listImplementedEmployerAtsProviders(): EmployerAtsProvider[] {
  return EMPLOYER_ATS_PROVIDERS.filter((provider) => EMPLOYER_ATS_ADAPTERS[provider] !== undefined);
}
