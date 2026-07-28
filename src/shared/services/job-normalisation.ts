import { createHash } from 'node:crypto';
import type {
  EligibilityHint,
  JobProvider,
  JobRemoteType,
  JobSalaryPeriod,
  JobSponsorshipWording,
  NormalisedJob,
  ProviderJob,
  SponsorSignal,
} from '@/shared/types/job';

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const excerpt = (description: string, match: RegExpMatchArray) => clean(description.slice(Math.max(0, match.index! - 70), Math.min(description.length, match.index! + match[0].length + 100))).slice(0, 240);

export function normaliseCompanyName(value: string): string {
  return clean(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(ltd|limited|plc|llp|uk)\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseLocation(locationText: string): Pick<NormalisedJob, 'locationText' | 'city' | 'region' | 'country' | 'remoteType'> {
  const value = clean(locationText);
  const lower = value.toLowerCase();
  const remoteType: JobRemoteType = /\bhybrid\b/.test(lower) ? 'HYBRID' : /\bremote\b/.test(lower) ? 'REMOTE' : /\b(on[- ]?site|office[- ]?based)\b/.test(lower) ? 'ONSITE' : 'UNKNOWN';
  if (/^(remote|nationwide)(\s*[-,]\s*uk)?$/i.test(value)) return { locationText: value, country: /uk/i.test(value) ? 'UK' : undefined, remoteType };
  if (/\//.test(value)) return { locationText: value, remoteType };
  const parts = value.replace(/^hybrid\s*[-,:]?\s*/i, '').replace(/^remote\s*[-,:]?\s*/i, '').split(',').map(clean).filter(Boolean);
  const [city, region] = parts;
  return { locationText: value, city: city && !/^(uk|united kingdom)$/i.test(city) ? city : undefined, region, country: /\b(uk|united kingdom)\b/i.test(value) ? 'UK' : undefined, remoteType };
}

export function parseSalary(text: string | null, min: number | null, max: number | null) {
  const salaryText = clean(text) || undefined;
  const lower = salaryText?.toLowerCase() ?? '';
  const salaryPeriod: JobSalaryPeriod = /\b(hour|hourly|p\/?h)\b/.test(lower) ? 'HOUR' : /\b(day|daily|p\/?d)\b/.test(lower) ? 'DAY' : /\bweek(ly)?\b/.test(lower) ? 'WEEK' : /\bmonth(ly)?\b/.test(lower) ? 'MONTH' : /\b(year|annum|annual|p\.?a\.)\b/.test(lower) || min || max ? 'YEAR' : 'UNKNOWN';
  const values = [...(salaryText?.matchAll(/£\s*(\d+(?:,\d{3})*(?:\.\d+)?)(k)?/gi) ?? [])].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
  const parsedMin = min ?? (values.length ? Math.min(...values) : undefined);
  const parsedMax = max ?? (values.length > 1 ? Math.max(...values) : undefined);
  return { salaryText, salaryMin: parsedMin ?? undefined, salaryMax: parsedMax ?? undefined, salaryPeriod: salaryPeriod === 'UNKNOWN' ? undefined : salaryPeriod, currency: salaryText?.includes('£') || min || max ? 'GBP' as const : undefined };
}

function wording(description: string): { jobWording: JobSponsorshipWording; sourceExcerpts?: string[] } {
  const tests: Array<[JobSponsorshipWording, RegExp]> = [
    ['EXPLICITLY_UNAVAILABLE', /\b(no|not|unable to (?:offer|provide)|cannot offer)\s+(?:visa\s+)?sponsorship|no visa support\b/i],
    ['RIGHT_TO_WORK_REQUIRED', /\b(?:must|already) have (?:the )?(?:right to work|right-to-work)|existing right to work\b/i],
    ['EXPLICITLY_AVAILABLE', /\b(?:skilled worker |visa )?sponsorship (?:is )?(?:available|provided|offered)\b|\bcertificate of sponsorship\b/i],
    ['POSSIBLY_AVAILABLE', /\b(?:skilled worker |visa )?sponsorship (?:can be |will be |is )?(?:considered|supported|possible)\b/i],
  ];
  for (const [jobWording, pattern] of tests) {
    const match = description.match(pattern);
    if (match) return { jobWording, sourceExcerpts: [excerpt(description, match)] };
  }
  return { jobWording: 'NOT_MENTIONED' };
}

export function extractEligibilityHints(description: string, remoteType: JobRemoteType): EligibilityHint[] {
  const tests: Array<[EligibilityHint['type'], EligibilityHint['severity'], string, RegExp]> = [
    ['NO_SPONSORSHIP', 'BLOCKING_LANGUAGE', 'No sponsorship wording', /\b(no|not|unable to (?:offer|provide)|cannot offer)\s+(?:visa\s+)?sponsorship|no visa support\b/i],
    ['RIGHT_TO_WORK', 'BLOCKING_LANGUAGE', 'Right to work required', /\b(?:must|already) have (?:the )?(?:right to work|right-to-work)|existing right to work\b/i],
    ['SECURITY_CLEARANCE', 'WARNING', 'Security clearance mentioned', /\b(?:SC|DV|security) clearance\b/i],
    ['RESIDENCY_REQUIREMENT', 'WARNING', 'UK residency requirement mentioned', /\b(?:UK )?residen(?:cy|t) (?:requirement|period)|resident for \d+ years?\b/i],
    ['DBS', 'WARNING', 'DBS check mentioned', /\b(?:enhanced |basic )?DBS (?:check|clearance)\b/i],
    ['DRIVING_LICENCE', 'WARNING', 'Driving licence mentioned', /\b(?:full |valid )?(?:UK )?driving licen[cs]e\b/i],
    ['PROFESSIONAL_REGISTRATION', 'WARNING', 'Professional registration mentioned', /\b(?:HCPC|NMC|GMC|professional registration)\b/i],
    ['TRAVEL_REQUIREMENT', 'INFO', 'Travel requirement mentioned', /\b(?:willingness to travel|regular travel|travel(?:ling)? required)\b/i],
  ];
  const hints: EligibilityHint[] = tests.flatMap(([type, severity, label, pattern]) => {
    const match = description.match(pattern);
    return match ? [{ type, severity, label, sourceExcerpt: excerpt(description, match) }] : [];
  });
  if (remoteType === 'ONSITE') hints.push({ type: 'ONSITE_REQUIREMENT', severity: 'INFO', label: 'Onsite location indicated' });
  return hints;
}

export function blankSponsorSignal(): SponsorSignal {
  return { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'The employer was not matched to the sponsor register. This is not a sponsorship decision for this vacancy.' };
}

export function normaliseProviderJob(raw: ProviderJob): NormalisedJob {
  const source = raw.source.toUpperCase() as JobProvider;
  const description = clean(raw.description);
  const location = normaliseLocation(raw.location);
  const salary = parseSalary(raw.salary, raw.salaryMin, raw.salaryMax);
  const extractedWording = wording(description);
  const companyNormalised = normaliseCompanyName(raw.company);
  const dedupeFingerprint = createHash('sha256').update(`${normaliseTitle(raw.title)}|${companyNormalised}|${normaliseLocationKey(raw.location)}`).digest('hex').slice(0, 24);
  const isTruncated = /\.\.\.$/.test(description);
  return {
    source, sourceJobId: raw.id.replace(/^(adzuna|reed|jooble)-/, ''), providerReferences: [{ provider: source, sourceJobId: raw.id.replace(/^(adzuna|reed|jooble)-/, ''), sourceUrl: raw.url }],
    canonicalUrl: raw.url, title: clean(raw.title), company: clean(raw.company), companyNormalised: companyNormalised || undefined,
    ...location, description: description || undefined,
    descriptionAvailability: description ? (source === 'JOOBLE' || isTruncated ? 'PARTIAL' : 'FULL') : 'EXTERNAL_ONLY',
    ...salary, employmentType: raw.contractType ?? undefined, contractType: raw.contractType ?? undefined,
    postedAt: validDate(raw.postedDate), remoteType: raw.isRemote && location.remoteType === 'UNKNOWN' ? 'REMOTE' : location.remoteType,
    sponsorSignal: { ...blankSponsorSignal(), ...extractedWording, explanation: wordingExplanation(extractedWording.jobWording) },
    eligibilityHints: extractEligibilityHints(description, location.remoteType), dedupeFingerprint, canonicalJobId: createHash('sha256').update(`${source}|${raw.id}|${raw.url}`).digest('hex').slice(0, 32), fetchedAt: new Date().toISOString(),
  };
}

export const normaliseTitle = (value: string) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const normaliseLocationKey = (value: string) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const validDate = (value: string) => Number.isNaN(Date.parse(value)) ? undefined : new Date(value).toISOString();
const wordingExplanation = (value: JobSponsorshipWording) => ({ EXPLICITLY_AVAILABLE: 'The listing includes wording that sponsorship is available.', POSSIBLY_AVAILABLE: 'The listing suggests sponsorship may be considered; confirm with the employer.', EXPLICITLY_UNAVAILABLE: 'The listing explicitly says sponsorship is unavailable.', RIGHT_TO_WORK_REQUIRED: 'The listing asks applicants to already have the right to work.', NOT_MENTIONED: 'The listing does not mention sponsorship.' }[value]);