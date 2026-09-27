import { createHash } from 'node:crypto';
import {
  classifyDescriptionAvailability,
  readableDescriptionText,
} from '@/shared/services/job-description-completeness';
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
  const salaryText = clean(text).replace(/(?:\u00c2|\u00c3\u0082)?\u00a3/g, '\u00a3').replace(/\s*[-\u2013\u2014]\s*/g, '\u2013') || undefined;
  const lower = salaryText?.toLowerCase() ?? '';
  const salaryPeriod: JobSalaryPeriod = /\b(hour|hourly|p\/?h)\b/.test(lower) ? 'HOUR' : /\b(day|daily|p\/?d)\b/.test(lower) ? 'DAY' : /\bweek(ly)?\b/.test(lower) ? 'WEEK' : /\bmonth(ly)?\b/.test(lower) ? 'MONTH' : /\b(year|annum|annual|p\.?a\.)\b/.test(lower) || min || max ? 'YEAR' : 'UNKNOWN';
  const values = [...(salaryText?.matchAll(/\u00a3\s*(\d+(?:,\d{3})*(?:\.\d+)?)(k)?/gi) ?? [])].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
  const parsedMin = min ?? (values.length ? Math.min(...values) : undefined);
  const parsedMax = max ?? (values.length > 1 ? Math.max(...values) : undefined);
  return { salaryText, salaryMin: parsedMin ?? undefined, salaryMax: parsedMax ?? undefined, salaryPeriod: salaryPeriod === 'UNKNOWN' ? undefined : salaryPeriod, currency: salaryText?.includes('\u00a3') || min || max ? 'GBP' as const : undefined };
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

/**
 * How complete a provider's description is.
 *
 * The rules live in `assessDescriptionCompleteness`, which combines the
 * provider's DECLARED contract with per-record truncation evidence (ellipsis
 * variants, read-more markers, mid-sentence cut-off, teaser length) and is
 * shared with the Phase 6 read-time assessment, so a card badge, a Description
 * tab and a match-preparation gate cannot disagree about the same text.
 *
 * The expression that used to live here tested nothing but a literal trailing
 * `...` and demoted only SNIPPET/UNKNOWN contracts, so Adzuna and Reed records
 * were persisted FULL despite both providers declaring PARTIAL semantics.
 */
export { classifyDescriptionAvailability } from '@/shared/services/job-description-completeness';

export function blankSponsorSignal(): SponsorSignal {
  return { registerMatchStatus: 'NONE', jobWording: 'NOT_MENTIONED', explanation: 'The employer was not matched to the sponsor register. This is not a sponsorship decision for this vacancy.' };
}

export function normaliseProviderJob(raw: ProviderJob): NormalisedJob {
  const source = raw.source.toUpperCase() as JobProvider;
  // Providers return HTML. `clean` collapsed it to one line, which destroyed both
  // the paragraph structure the details view renders and the line-level evidence
  // the completeness classifier needs, so the readable-text conversion is done
  // here once and the readable form is what is stored and assessed.
  const description = readableDescriptionText(raw.description).text;
  const location = normaliseLocation(raw.location);
  const salary = parseSalary(raw.salary, raw.salaryMin, raw.salaryMax);
  const extractedWording = wording(description);
  const companyNormalised = normaliseCompanyName(raw.company);
  const dedupeFingerprint = createHash('sha256').update(`${normaliseTitle(raw.title)}|${companyNormalised}|${normaliseLocationKey(raw.location)}`).digest('hex').slice(0, 24);
  const providerPrefix = `${raw.source}-`;
  const sourceJobId = raw.id.startsWith(providerPrefix)
    ? raw.id.slice(providerPrefix.length)
    : raw.id.replace(/^[a-z]+-/, '');
  return {
    source, sourceJobId, providerReferences: [{ provider: source, sourceJobId, sourceUrl: raw.hostedUrl ?? raw.url, ...(raw.applicationUrl ? { applicationUrl: raw.applicationUrl } : {}) }],
    canonicalUrl: raw.url, title: clean(raw.title), company: clean(raw.company), companyNormalised: companyNormalised || undefined,
    ...location, description: description || undefined,
    descriptionAvailability: classifyDescriptionAvailability(source, description),
    ...salary, employmentType: raw.contractType ?? undefined, contractType: raw.contractType ?? undefined,
    postedAt: validDate(raw.postedDate), expiresAt: raw.closingDate ? validDate(raw.closingDate) : undefined, remoteType: raw.isRemote && location.remoteType === 'UNKNOWN' ? 'REMOTE' : location.remoteType,
    sponsorSignal: { ...blankSponsorSignal(), ...extractedWording, explanation: wordingExplanation(extractedWording.jobWording) },
    ...(raw.employerSourceId ? { employerSourceId: raw.employerSourceId } : {}), ...(raw.companyRecordId ? { companyRecordId: raw.companyRecordId } : {}),
    ...(raw.departments?.length ? { departments: raw.departments } : {}), ...(raw.offices?.length ? { offices: raw.offices } : {}),
    eligibilityHints: extractEligibilityHints(description, location.remoteType), dedupeFingerprint, canonicalJobId: createHash('sha256').update(`${source}|${raw.employerSourceId ?? ''}|${sourceJobId}`).digest('hex').slice(0, 32), fetchedAt: new Date().toISOString(),
  };
}

export const normaliseTitle = (value: string) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const normaliseLocationKey = (value: string) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const validDate = (value: string) => Number.isNaN(Date.parse(value)) ? undefined : new Date(value).toISOString();
const wordingExplanation = (value: JobSponsorshipWording) => ({ EXPLICITLY_AVAILABLE: 'The listing includes wording that sponsorship is available.', POSSIBLY_AVAILABLE: 'The listing suggests sponsorship may be considered; confirm with the employer.', EXPLICITLY_UNAVAILABLE: 'The listing explicitly says sponsorship is unavailable.', RIGHT_TO_WORK_REQUIRED: 'The listing asks applicants to already have the right to work.', NOT_MENTIONED: 'The listing does not mention sponsorship.' }[value]);
