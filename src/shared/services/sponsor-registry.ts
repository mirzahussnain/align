import Papa from 'papaparse';
import { API_CONFIG } from '@/shared/lib/config';
import type { Sponsor } from '@/shared/types/job';
import { getIndustryFromCompany } from '@/shared/utils/sponsor';

let sponsorSetCache: Set<string> | null = null;
let sponsorArrayCache: Sponsor[] | null = null;
let fetchPromise: Promise<Sponsor[]> | null = null;
let lastFetchTime = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Standardizes a company name for fuzzy matching
 */
export function standardizeCompanyName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llc|inc|plc|group)\b/g, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()'"\\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Validates a CSV URL to prevent SSRF vulnerabilities.
 * Ensures the URL is an official Gov.UK domain.
 */
function isValidSponsorUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'assets.publishing.service.gov.uk' && parsed.pathname.endsWith('.csv');
  } catch {
    return false;
  }
}

/**
 * Scrapes the GOV.UK guidance page for the latest CSV link.
 */
async function getLatestSponsorCsvUrl(): Promise<string> {
  const fallbackUrl = API_CONFIG.gov.fallbackCsvUrl;
  try {
    const response = await fetch(API_CONFIG.gov.sponsorRegistryPage, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return fallbackUrl;

    const html = await response.text();
    const match = html.match(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[a-zA-Z0-9]+\/[0-9_-]+Worker_and_Temporary_Worker\.csv/);
    if (match && isValidSponsorUrl(match[0])) {
      return match[0];
    }
    return fallbackUrl;
  } catch {
    return fallbackUrl;
  }
}

/**
 * Core function to fetch and parse the Sponsor CSV into full objects.
 * Single source of truth for both API responses and boolean lookups.
 */
export async function getSponsors(): Promise<Sponsor[]> {
  const now = Date.now();

  if (sponsorArrayCache && now - lastFetchTime < CACHE_TTL) {
    return sponsorArrayCache;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = (async () => {
    let csvUrl = process.env.GOVUK_SPONSOR_CSV_URL;
    let response: Response | null = null;

    if (csvUrl && isValidSponsorUrl(csvUrl)) {
      try {
        response = await fetch(csvUrl, { cache: 'no-store' });
      } catch (e) {
        console.warn(`Failed to fetch configured CSV URL: ${csvUrl}`, e);
      }
    }

    if (!response || !response.ok) {
      const resolvedUrl = await getLatestSponsorCsvUrl();
      if (isValidSponsorUrl(resolvedUrl)) {
        try {
          response = await fetch(resolvedUrl, { cache: 'no-store' });
        } catch (e) {
          console.error(`Failed to fetch resolved CSV URL`, e);
        }
      }
    }

    if (!response || !response.ok) {
      const hardcodedUrl = API_CONFIG.gov.fallbackCsvUrl;
      response = await fetch(hardcodedUrl, { cache: 'no-store' });
    }

    if (!response || !response.ok) {
      if (sponsorArrayCache) return sponsorArrayCache;
      throw new Error(`Failed to fetch sponsor CSV data: ${response ? response.status : 'unknown error'}`);
    }

    try {
      const csvText = await response.text();

      return new Promise<Sponsor[]>((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            try {
              const sponsors = results.data.map((row: any) => {
                const name = row['Organisation Name'] || '';
                return {
                  organisationName: name,
                  townCity: row['Town/City'] || '',
                  county: row['County'] || '',
                  rating: row['Type & Rating'] || row['Rating'] || '',
                  route: row['Route'] || '',
                  industry: getIndustryFromCompany(name),
                };
              }).filter((s: Sponsor) => s.organisationName);
              
              sponsorArrayCache = sponsors;
              
              // Populate Set cache synchronously
              const newSponsorSet = new Set<string>();
              sponsors.forEach(s => {
                const standardized = standardizeCompanyName(s.organisationName);
                if (standardized) newSponsorSet.add(standardized);
              });
              sponsorSetCache = newSponsorSet;
              
              lastFetchTime = Date.now();
              resolve(sponsors);
            } catch (e) {
               reject(new Error("Error mapping sponsor data"));
            }
          },
          error: (error: any) => {
            reject(error);
          },
        });
      });
    } catch (error) {
      if (sponsorArrayCache) return sponsorArrayCache;
      throw error;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

/**
 * Checks if a specific company name is in the UK Sponsor Registry
 */
export async function isCompanySponsor(companyName: string): Promise<boolean> {
  if (!companyName) return false;
  
  // Ensure cache is populated
  await getSponsors();
  
  if (!sponsorSetCache) return false;

  const standardized = standardizeCompanyName(companyName);
  if (!standardized) return false;

  return sponsorSetCache.has(standardized);
}

/**
 * Batch-checks an array of company names against the UK Sponsor Registry.
 * Loads the registry ONCE from cache, then performs all lookups in O(n) time.
 * Use this instead of calling isCompanySponsor() in a loop to avoid N+1 async calls.
 *
 * @returns A Map<companyName, boolean> for O(1) lookups in the caller.
 */
export async function batchCheckSponsors(companyNames: string[]): Promise<Map<string, boolean>> {
  if (!companyNames.length) return new Map();

  // Ensure cache is populated once
  await getSponsors();

  const result = new Map<string, boolean>();
  for (const name of companyNames) {
    if (!name) { result.set(name, false); continue; }
    const standardized = standardizeCompanyName(name);
    result.set(name, sponsorSetCache?.has(standardized) ?? false);
  }
  return result;
}
