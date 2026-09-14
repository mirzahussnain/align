import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Papa from 'papaparse';
import { API_CONFIG } from '@/shared/lib/config';
import type { Sponsor } from '@/shared/types/job';
import { getIndustryFromCompany } from '@/shared/utils/sponsor';
import {
  SponsorIndexStore,
  standardizeSponsorOrganisationName,
  type SponsorEmployerMatch,
  type SponsorIndex,
} from './sponsor-index';

let sponsorArrayCache: Sponsor[] | null = null;
let registerVersionCache: string | null = null;
let registerMetadataCache: SponsorRegisterMetadata | null = null;
let fetchPromise: Promise<Sponsor[]> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;
const sponsorIndexes = new SponsorIndexStore();

const BUNDLED_REGISTER = {
  releaseVersion: '2',
  publishedAt: '2026-07-29',
  file: 'SP_-_Worker_and_Temporary_Worker_Web_Register_-_2026-07-29.csv',
} as const;

export interface SponsorRegisterMetadata {
  releaseVersion: string;
  registerVersion: string;
  publishedAt?: string;
  rowCount: number;
  source: 'BUNDLED_RELEASE' | 'LIVE_FALLBACK';
}

/** Backwards-compatible export used by sponsor-match caching callers. */
export const standardizeCompanyName = standardizeSponsorOrganisationName;

function isValidSponsorUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'assets.publishing.service.gov.uk' && parsed.pathname.endsWith('.csv');
  } catch {
    return false;
  }
}

async function getLatestSponsorCsvUrl(): Promise<string> {
  const fallbackUrl = API_CONFIG.gov.fallbackCsvUrl;
  try {
    const response = await fetch(API_CONFIG.gov.sponsorRegistryPage, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Align sponsor-register loader)' },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return fallbackUrl;
    const html = await response.text();
    const match = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[a-zA-Z0-9]+\/[0-9_-]+Worker_and_Temporary_Worker\.csv/);
    return match && isValidSponsorUrl(match[0]) ? match[0] : fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

function parseSponsors(csvText: string): Sponsor[] {
  const results = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (results.errors.length) {
    const first = results.errors[0];
    throw new Error(`Failed to parse sponsor CSV data at row ${first.row ?? 'unknown'}: ${first.message}`);
  }
  return results.data.map((row) => {
    const organisationName = row['Organisation Name'] || '';
    return {
      organisationName,
      townCity: row['Town/City'] || '',
      county: row.County || '',
      rating: row['Type & Rating'] || row.Rating || '',
      route: row.Route || '',
      industry: getIndustryFromCompany(organisationName),
    };
  }).filter((sponsor) => sponsor.organisationName);
}

async function loadRemoteSponsorCsv(): Promise<string> {
  const configuredUrl = process.env.GOVUK_SPONSOR_CSV_URL;
  let response: Response | null = null;
  if (configuredUrl && isValidSponsorUrl(configuredUrl)) {
    try {
      response = await fetch(configuredUrl, { cache: 'no-store' });
    } catch (error) {
      console.warn('Failed to fetch configured sponsor CSV URL.', error);
    }
  }
  if (!response?.ok) {
    const resolvedUrl = await getLatestSponsorCsvUrl();
    try {
      response = await fetch(resolvedUrl, { cache: 'no-store' });
    } catch (error) {
      console.warn('Failed to fetch resolved sponsor CSV URL.', error);
    }
  }
  if (!response?.ok) response = await fetch(API_CONFIG.gov.fallbackCsvUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to fetch sponsor CSV data: ${response.status}`);
  return response.text();
}

/**
 * Loads the source once per register generation. The Sponsor list serves the
 * sponsor API; SponsorIndex is separate, reconstructable read-only acceleration
 * for employer matching.
 */
export async function getSponsors(): Promise<Sponsor[]> {
  if (sponsorArrayCache && Date.now() - lastFetchTime < CACHE_TTL) return sponsorArrayCache;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      let csvText: string;
      let source: SponsorRegisterMetadata['source'] = 'BUNDLED_RELEASE';
      try {
        csvText = await readFile(join(process.cwd(), 'data', 'sponsors', BUNDLED_REGISTER.file), 'utf8');
      } catch (error) {
        console.warn('Bundled sponsor register v2 is unavailable; using the GOV.UK fallback.', error);
        source = 'LIVE_FALLBACK';
        csvText = await loadRemoteSponsorCsv();
      }
      const sponsors = parseSponsors(csvText);
      const contentVersion = versionSponsors(sponsors);
      sponsorArrayCache = sponsors;
      registerVersionCache = source === 'BUNDLED_RELEASE'
        ? `v${BUNDLED_REGISTER.releaseVersion}-${BUNDLED_REGISTER.publishedAt}-${contentVersion}`
        : `live-${contentVersion}`;
      registerMetadataCache = {
        releaseVersion: source === 'BUNDLED_RELEASE' ? BUNDLED_REGISTER.releaseVersion : 'live',
        registerVersion: registerVersionCache,
        ...(source === 'BUNDLED_RELEASE' ? { publishedAt: BUNDLED_REGISTER.publishedAt } : {}),
        rowCount: sponsors.length,
        source,
      };
      lastFetchTime = Date.now();
      return sponsors;
    } catch (error) {
      if (sponsorArrayCache) return sponsorArrayCache;
      throw error;
    } finally {
      fetchPromise = null;
    }
  })();
  return fetchPromise;
}

export async function getSponsorRegisterVersion(): Promise<string> {
  await getSponsors();
  if (!registerVersionCache) throw new Error('Sponsor register version was not created with the loaded register.');
  return registerVersionCache;
}

export async function getSponsorRegisterMetadata(): Promise<SponsorRegisterMetadata> {
  await getSponsors();
  if (!registerMetadataCache) throw new Error('Sponsor register metadata was not created with the loaded register.');
  return registerMetadataCache;
}

/**
 * In-process SponsorIndex = parsed read-only register acceleration.
 * Redis sponsor-match cache = reusable completed employer lookup across requests.
 */
export async function getSponsorIndex(): Promise<SponsorIndex> {
  const sponsors = await getSponsors();
  // Read the version paired with this loaded array without another await, so a
  // concurrent refresh cannot combine an old dataset with a new namespace.
  if (!registerVersionCache) throw new Error('Sponsor register version was not created with the loaded register.');
  return sponsorIndexes.getOrBuild(registerVersionCache, sponsors);
}

export async function isCompanySponsor(companyName: string): Promise<boolean> {
  return (await getSponsorIndex()).matchEmployer(companyName).status === 'EXACT';
}

export async function batchCheckSponsors(companyNames: string[]): Promise<Map<string, boolean>> {
  const index = await getSponsorIndex();
  return new Map(companyNames.map((name) => [name, index.matchEmployer(name).status === 'EXACT']));
}

/** Conservative indexed matcher retained as the existing public integration boundary. */
export async function matchSponsorCompanies(companyNames: string[]): Promise<Map<string, SponsorEmployerMatch>> {
  const result = new Map<string, SponsorEmployerMatch>();
  if (!companyNames.length) return result;
  const index = await getSponsorIndex();
  for (const company of companyNames) result.set(company, index.matchEmployer(company));
  return result;
}

/** Full-content version computed while parsing: different datasets cannot share a cache namespace. */
function versionSponsors(sponsors: readonly Sponsor[]): string {
  const hash = createHash('sha256');
  for (const sponsor of sponsors) {
    hash.update(sponsor.organisationName).update('\0');
    hash.update(sponsor.townCity).update('\0');
    hash.update(sponsor.county).update('\0');
    hash.update(sponsor.rating).update('\0');
    hash.update(sponsor.route).update('\n');
  }
  return hash.digest('hex').slice(0, 16);
}
