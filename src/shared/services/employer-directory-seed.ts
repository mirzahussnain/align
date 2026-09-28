import { normaliseEmployerName } from './employer-name.ts';
import type { EmployerDirectorySeed } from '../types/employer-source.ts';

type SeedCompany = Omit<EmployerDirectorySeed, 'normalisedName' | 'country'>;
const greenhouseSource = (providerIdentifier: string) => ({ provider: 'GREENHOUSE' as const, providerIdentifier, sourceOrigin: 'CURATED_SEED' as const });
const leverSource = (providerIdentifier: string) => ({ provider: 'LEVER' as const, providerIdentifier, leverRegion: 'GLOBAL' as const, sourceOrigin: 'CURATED_SEED' as const });
const ashbySource = (providerIdentifier: string) => ({ provider: 'ASHBY' as const, providerIdentifier, sourceOrigin: 'CURATED_SEED' as const });
const company = (entry: SeedCompany): EmployerDirectorySeed => ({ ...entry, country: 'GB', normalisedName: normaliseEmployerName(entry.displayName) });

/**
 * Approved initial production ATS catalogue. Every identifier was copied from
 * an official hosted board and must still pass verification before enablement.
 */
export const EMPLOYER_DIRECTORY_SEED: readonly EmployerDirectorySeed[] = [
  company({ displayName: 'Deliveroo', industry: 'Food delivery and logistics', websiteUrl: 'https://deliveroo.co.uk', careersUrl: 'https://boards.greenhouse.io/deliveroo', sources: [greenhouseSource('deliveroo')] }),
  company({ displayName: 'Gymshark', industry: 'Consumer apparel and retail', websiteUrl: 'https://www.gymshark.com', careersUrl: 'https://boards.greenhouse.io/gymshark', sources: [greenhouseSource('gymshark')] }),
  company({ displayName: 'Ogilvy UK', industry: 'Advertising and communications', websiteUrl: 'https://www.ogilvy.com/uk', careersUrl: 'https://boards.greenhouse.io/ogilvyuk', sources: [greenhouseSource('ogilvyuk')] }),
  company({ displayName: 'Pay.UK', industry: 'Payments infrastructure', websiteUrl: 'https://www.wearepay.uk', careersUrl: 'https://boards.greenhouse.io/payuk', sources: [greenhouseSource('payuk')] }),
  company({ displayName: 'Octopus Energy Group', industry: 'Energy and utilities', websiteUrl: 'https://octopusenergy.group', careersUrl: 'https://jobs.lever.co/octoenergy', sources: [leverSource('octoenergy')] }),
  company({ displayName: 'Avalere Health', industry: 'Healthcare consulting', websiteUrl: 'https://avalerehealth.com', careersUrl: 'https://jobs.lever.co/avalerehealth', sources: [leverSource('avalerehealth')] }),
  company({ displayName: 'Airalo', industry: 'Travel connectivity', websiteUrl: 'https://www.airalo.com', careersUrl: 'https://jobs.lever.co/airalo', sources: [leverSource('airalo')] }),
  company({ displayName: 'Pattern', industry: 'E-commerce', websiteUrl: 'https://pattern.com', careersUrl: 'https://jobs.lever.co/pattern', sources: [leverSource('pattern')] }),
  company({ displayName: 'Neko Health', industry: 'Preventative healthcare', websiteUrl: 'https://www.nekohealth.com', careersUrl: 'https://jobs.ashbyhq.com/neko-health', sources: [ashbySource('neko-health')] }),
  company({ displayName: 'Checkatrade', industry: 'Home-services marketplace', websiteUrl: 'https://www.checkatrade.com', careersUrl: 'https://jobs.ashbyhq.com/checkatrade', sources: [ashbySource('checkatrade')] }),
  company({ displayName: 'Ashby', industry: 'Recruiting software', websiteUrl: 'https://www.ashbyhq.com', careersUrl: 'https://jobs.ashbyhq.com/Ashby', sources: [ashbySource('Ashby')] }),
  company({ displayName: 'CUBE', industry: 'Regulatory technology', websiteUrl: 'https://www.cube.global', careersUrl: 'https://jobs.ashbyhq.com/CUBE', sources: [ashbySource('CUBE')] }),
] as const;