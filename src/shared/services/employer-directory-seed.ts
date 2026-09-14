import { normaliseEmployerName } from './employer-name.ts';
import type { EmployerDirectorySeed } from '../types/employer-source.ts';

type SeedCompany = Omit<EmployerDirectorySeed, 'normalisedName' | 'country'>;
const source = (providerIdentifier: string) => ({ provider: 'GREENHOUSE' as const, providerIdentifier, sourceOrigin: 'CURATED_SEED' as const });
const leverSource = (providerIdentifier: string, leverRegion: 'GLOBAL' | 'EU' = 'GLOBAL') => ({ provider: 'LEVER' as const, providerIdentifier, leverRegion, sourceOrigin: 'CURATED_SEED' as const });
const ashbySource = (providerIdentifier: string) => ({ provider: 'ASHBY' as const, providerIdentifier, sourceOrigin: 'CURATED_SEED' as const });
const company = (entry: SeedCompany): EmployerDirectorySeed => ({ ...entry, country: 'GB', normalisedName: normaliseEmployerName(entry.displayName) });

/**
 * Reviewed public-board candidates, not verification assertions. They were
 * collected from public ATS board URLs and intentionally begin PENDING/disabled.
 * Verification is the only process permitted to promote one to VERIFIED.
 */
export const EMPLOYER_DIRECTORY_SEED: readonly EmployerDirectorySeed[] = [
  company({ displayName: 'Airbnb', industry: 'Travel technology', websiteUrl: 'https://www.airbnb.co.uk', sources: [source('airbnb')] }),
  company({ displayName: 'Asana', industry: 'Software', websiteUrl: 'https://asana.com', sources: [source('asana')] }),
  company({ displayName: 'Atlassian', industry: 'Software', websiteUrl: 'https://www.atlassian.com', sources: [source('atlassian')] }),
  company({ displayName: 'Benchling', industry: 'Healthcare technology', websiteUrl: 'https://www.benchling.com', sources: [source('benchling')] }),
  company({ displayName: 'BlackRock', industry: 'Financial services', websiteUrl: 'https://www.blackrock.com', sources: [source('blackrock')] }),
  company({ displayName: 'Brex', industry: 'Fintech', websiteUrl: 'https://www.brex.com', sources: [source('brex')] }),
  company({ displayName: 'Canva', industry: 'Software', websiteUrl: 'https://www.canva.com', sources: [source('canva')] }),
  company({ displayName: 'Coinbase', industry: 'Financial services', websiteUrl: 'https://www.coinbase.com', sources: [source('coinbase')] }),
  company({ displayName: 'Confluent', industry: 'Data and AI', websiteUrl: 'https://www.confluent.io', sources: [source('confluent')] }),
  company({ displayName: 'Databricks', industry: 'Data and AI', websiteUrl: 'https://www.databricks.com', sources: [source('databricks')] }),
  company({ displayName: 'Datadog', industry: 'IT support and infrastructure', websiteUrl: 'https://www.datadoghq.com', sources: [source('datadog')] }),
  company({ displayName: 'Discord', industry: 'Software', websiteUrl: 'https://discord.com', sources: [source('discord')] }),
  company({ displayName: 'DoorDash', industry: 'Logistics', websiteUrl: 'https://www.doordash.com', sources: [source('doordash')] }),
  company({ displayName: 'Dropbox', industry: 'Software', websiteUrl: 'https://www.dropbox.com', sources: [source('dropbox')] }),
  company({ displayName: 'Duolingo', industry: 'Education technology', websiteUrl: 'https://www.duolingo.com', sources: [source('duolingo')] }),
  company({ displayName: 'Figma', industry: 'Software', websiteUrl: 'https://www.figma.com', sources: [source('figma')] }),
  company({ displayName: 'GitLab', industry: 'Software', websiteUrl: 'https://about.gitlab.com', sources: [source('gitlab')] }),
  company({ displayName: 'HashiCorp', industry: 'IT support and infrastructure', websiteUrl: 'https://www.hashicorp.com', sources: [source('hashicorp')] }),
  company({ displayName: 'HubSpot', industry: 'Software', websiteUrl: 'https://www.hubspot.com', sources: [source('hubspot')] }),
  company({ displayName: 'Instacart', industry: 'Retail', websiteUrl: 'https://www.instacart.com', sources: [source('instacart')] }),
  company({ displayName: 'Lyft', industry: 'Logistics', websiteUrl: 'https://www.lyft.com', sources: [source('lyft')] }),
  company({ displayName: 'MongoDB', industry: 'Data and AI', websiteUrl: 'https://www.mongodb.com', sources: [source('mongodb')] }),
  company({ displayName: 'Okta', industry: 'Cybersecurity', websiteUrl: 'https://www.okta.com', sources: [source('okta')] }),
  company({ displayName: 'PagerDuty', industry: 'IT support and infrastructure', websiteUrl: 'https://www.pagerduty.com', sources: [source('pagerduty')] }),
  company({ displayName: 'Palantir', industry: 'Data and AI', websiteUrl: 'https://www.palantir.com', sources: [source('palantir')] }),
  company({ displayName: 'Plaid', industry: 'Fintech', websiteUrl: 'https://plaid.com', sources: [source('plaid')] }),
  company({ displayName: 'Reddit', industry: 'Software', websiteUrl: 'https://www.redditinc.com', sources: [source('reddit')] }),
  company({ displayName: 'Robinhood', industry: 'Financial services', websiteUrl: 'https://robinhood.com', sources: [source('robinhood')] }),
  company({ displayName: 'Rubrik', industry: 'Cybersecurity', websiteUrl: 'https://www.rubrik.com', sources: [source('rubrik')] }),
  company({ displayName: 'Scale AI', industry: 'Data and AI', websiteUrl: 'https://scale.com', sources: [source('scaleai')] }),
  company({ displayName: 'Snyk', industry: 'Cybersecurity', websiteUrl: 'https://snyk.io', sources: [source('snyk')] }),
  company({ displayName: 'Splunk', industry: 'IT support and infrastructure', websiteUrl: 'https://www.splunk.com', sources: [source('splunk')] }),
  company({ displayName: 'Stripe', industry: 'Fintech', websiteUrl: 'https://stripe.com/gb', sources: [source('stripe')] }),
  company({ displayName: 'Twilio', industry: 'Software', websiteUrl: 'https://www.twilio.com', sources: [source('twilio')] }),
  company({ displayName: 'Uber', industry: 'Logistics', websiteUrl: 'https://www.uber.com/gb', sources: [source('uber')] }),
  company({ displayName: 'Unity', industry: 'Software', websiteUrl: 'https://unity.com', sources: [source('unity')] }),
  company({ displayName: 'Wayfair', industry: 'Retail', websiteUrl: 'https://www.wayfair.co.uk', sources: [source('wayfair')] }),
  company({ displayName: 'Webflow', industry: 'Software', websiteUrl: 'https://webflow.com', sources: [source('webflow')] }),
  company({ displayName: 'Wise', industry: 'Fintech', websiteUrl: 'https://wise.com/gb', sources: [source('wise')] }),
  company({ displayName: 'Zendesk', industry: 'Software', websiteUrl: 'https://www.zendesk.co.uk', sources: [source('zendesk')] }),
  company({ displayName: 'Zoom', industry: 'Software', websiteUrl: 'https://www.zoom.com', sources: [source('zoom')] }),
  company({ displayName: 'Affirm', industry: 'Fintech', websiteUrl: 'https://www.affirm.com', sources: [source('affirm')] }),
  company({ displayName: 'Anduril Industries', industry: 'Engineering', websiteUrl: 'https://www.anduril.com', sources: [source('andurilindustries')] }),
  company({ displayName: 'Cloudflare', industry: 'Cybersecurity', websiteUrl: 'https://www.cloudflare.com', sources: [source('cloudflare')] }),
  company({ displayName: 'Docusign', industry: 'Professional services', websiteUrl: 'https://www.docusign.com', sources: [source('docusign')] }),
  company({ displayName: 'Elastic', industry: 'Data and AI', websiteUrl: 'https://www.elastic.co', sources: [source('elastic')] }),
  company({ displayName: 'Grammarly', industry: 'Education technology', websiteUrl: 'https://www.grammarly.com', sources: [source('grammarly')] }),
  company({ displayName: 'Klarna', industry: 'Fintech', websiteUrl: 'https://www.klarna.com/uk', sources: [source('klarna')] }),
  company({ displayName: 'Nuro', industry: 'Engineering', websiteUrl: 'https://www.nuro.ai', sources: [source('nuro')] }),
  company({ displayName: 'OpenAI', industry: 'Data and AI', websiteUrl: 'https://openai.com', sources: [source('openai')] }),
  company({ displayName: 'Snowflake', industry: 'Data and AI', websiteUrl: 'https://www.snowflake.com', sources: [source('snowflake')] }),
  company({ displayName: 'Toast', industry: 'Retail technology', websiteUrl: 'https://pos.toasttab.com', sources: [source('toast')] }),
  company({ displayName: 'Workday', industry: 'Professional services', websiteUrl: 'https://www.workday.com', sources: [source('workday')] }),
  company({ displayName: 'Yelp', industry: 'Retail technology', websiteUrl: 'https://www.yelp.com', sources: [source('yelp')] }),
  // Public Lever boards manually checked for current UK roles. Identifiers come
  // from the provider URLs, never from lowercasing the company names.
  company({ displayName: 'Adlook', industry: 'Advertising technology', websiteUrl: 'https://adlook.com', sources: [leverSource('adlook')] }),
  company({ displayName: 'Airalo', industry: 'Travel technology', websiteUrl: 'https://www.airalo.com', sources: [leverSource('airalo')] }),
  company({ displayName: 'Capital.com', industry: 'Financial services', websiteUrl: 'https://capital.com', sources: [leverSource('capital')] }),
  company({ displayName: 'Cority', industry: 'Environmental health software', websiteUrl: 'https://www.cority.com', sources: [leverSource('cority')] }),
  company({ displayName: 'Crypto.com', industry: 'Financial services', websiteUrl: 'https://crypto.com', sources: [leverSource('crypto')] }),
  company({ displayName: 'Gearset', industry: 'Software', websiteUrl: 'https://gearset.com', sources: [leverSource('gearset')] }),
  company({ displayName: 'ghSMART', industry: 'Leadership advisory', websiteUrl: 'https://ghsmart.com', sources: [leverSource('ghsmartjobs')] }),
  company({ displayName: 'Legend', industry: 'Digital marketing', websiteUrl: 'https://www.legend.inc', sources: [leverSource('Legend')] }),
  company({ displayName: 'Matillion', industry: 'Data and AI', websiteUrl: 'https://www.matillion.com', sources: [leverSource('matillion')] }),
  company({ displayName: 'MoonPay', industry: 'Financial technology', websiteUrl: 'https://www.moonpay.com', sources: [leverSource('moonpay')] }),
  company({ displayName: 'Palantir Technologies', industry: 'Data and AI', websiteUrl: 'https://www.palantir.com', sources: [leverSource('palantir')] }),
  company({ displayName: 'Pattern', industry: 'E-commerce', websiteUrl: 'https://pattern.com', sources: [leverSource('pattern')] }),
  company({ displayName: 'Safe Security', industry: 'Cybersecurity', websiteUrl: 'https://www.safe.security', sources: [leverSource('safe')] }),
  company({ displayName: 'Serverfarm', industry: 'Data centres', websiteUrl: 'https://www.serverfarmllc.com', sources: [leverSource('serverfarm')] }),
  company({ displayName: 'Veeva Systems', industry: 'Life sciences software', websiteUrl: 'https://www.veeva.com', sources: [leverSource('veeva')] }),
  // Public Ashby boards manually evidenced from the hosted board and live UK-relevant postings.
  // These identifiers are copied from jobs.ashbyhq.com paths, never derived from company names.
  company({ displayName: 'Ashby', industry: 'Recruiting software', websiteUrl: 'https://www.ashbyhq.com', careersUrl: 'https://jobs.ashbyhq.com/Ashby', sources: [ashbySource('Ashby')] }),
  company({ displayName: 'Aptura', industry: 'Data and AI', careersUrl: 'https://jobs.ashbyhq.com/aptura', sources: [ashbySource('aptura')] }),
  company({ displayName: 'Lovable', industry: 'Data and AI', websiteUrl: 'https://lovable.dev', careersUrl: 'https://jobs.ashbyhq.com/lovable', sources: [ashbySource('lovable')] }),
  company({ displayName: 'Tessl', industry: 'Data and AI', websiteUrl: 'https://tessl.io', careersUrl: 'https://jobs.ashbyhq.com/tesslcareers', sources: [ashbySource('tesslcareers')] }),
  company({ displayName: 'Axle Energy', industry: 'Energy technology', websiteUrl: 'https://www.axle.energy', careersUrl: 'https://jobs.ashbyhq.com/axle-careers', sources: [ashbySource('axle-careers')] }),
  company({ displayName: 'Condukt', industry: 'Financial technology', websiteUrl: 'https://condukt.com', careersUrl: 'https://jobs.ashbyhq.com/condukt', sources: [ashbySource('condukt')] }),
  company({ displayName: 'CUBE', industry: 'Regulatory technology', websiteUrl: 'https://www.cube.global', careersUrl: 'https://jobs.ashbyhq.com/CUBE', sources: [ashbySource('CUBE')] }),
  company({ displayName: 'WRITER', industry: 'Data and AI', websiteUrl: 'https://writer.com', careersUrl: 'https://jobs.ashbyhq.com/WRITER', sources: [ashbySource('WRITER')] }),
  company({ displayName: 'Rogo', industry: 'Financial technology', websiteUrl: 'https://www.rogo.ai', careersUrl: 'https://jobs.ashbyhq.com/Rogo', sources: [ashbySource('Rogo')] }),] as const;