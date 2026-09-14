/**
 * Employer TEXT → canonical CompanyRecord.
 *
 * Aggregator vacancies (Adzuna, Reed, Jooble) arrive with an employer display
 * string and nothing else. Employer-direct ATS vacancies already carry a
 * CompanyRecord through EmployerJobSource, so they never come here.
 *
 * This is an IDENTITY question and is deliberately separate from the sponsor
 * register. Resolving "Acme Care Ltd" to a company record says nothing about
 * whether that company sponsors; running the register matcher against a company
 * says nothing about which vacancies belong to it. Merging the two is how a
 * board ends up asserting that an unrelated employer is a licensed sponsor.
 *
 * CONSERVATISM RULES, in order of how much damage a mistake does:
 *   - A company is NEVER created here. An unknown employer stays unknown.
 *   - A single vaguely-similar name is not a match. Every accepted match needs
 *     either an exact normalised identity, a shared registrable domain, or full
 *     containment of at least two meaningful identity tokens with a unique winner.
 *   - More than one plausible company is AMBIGUOUS_COMPANY, never a coin flip.
 */
import { prisma } from '@/shared/lib/prisma';
import { normaliseEmployerName } from '@/shared/services/employer-name';
import type {
  CompanyResolutionResult,
} from '@/shared/types/sponsor-evidence';

/** Words that do not identify an organisation on their own. */
const LOW_INFORMATION_TOKENS = new Set([
  'company', 'companies', 'group', 'holding', 'holdings', 'service', 'services',
  'solution', 'solutions', 'international', 'uk', 'the', 'and', 'recruitment',
  'agency', 'careers', 'jobs', 'people', 'staffing', 'resourcing', 'partners',
]);

/**
 * Employer names a provider uses as a placeholder for "we are not telling you".
 * These must never resolve to anything: a recruitment agency's own name is not
 * the hiring employer, and matching it to a CompanyRecord would attach one
 * agency's sponsor evidence to every vacancy it lists.
 */
const UNUSABLE_EMPLOYER_NAMES = new Set([
  'unknown', 'n/a', 'na', 'not supplied', 'confidential', 'private advertiser',
  'anonymous', 'undisclosed', 'client', 'our client', 'recruitment agency',
]);

export const MAX_COMPANY_CANDIDATES = 25;

export type CompanyResolutionInput = {
  /** The provider's employer display text. */
  employerName: string;
  /** Provider-returned employer website, if the adapter supplies one. */
  websiteUrl?: string | null;
  /** Provider-returned careers URL, if the adapter supplies one. */
  careersUrl?: string | null;
};

export function meaningfulIdentityTokens(normalisedName: string): string[] {
  return [
    ...new Set(
      normalisedName
        .split(' ')
        .filter((token) => token.length >= 3 && !LOW_INFORMATION_TOKENS.has(token)),
    ),
  ];
}

/**
 * Registrable-ish host for comparison: lowercased, `www.` stripped. Deliberately
 * not a public-suffix parse — two URLs are only compared for equality of this
 * value, so an over-long host simply fails to match rather than mis-matching.
 */
export function comparableHost(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Hosts that host many unrelated employers. A shared ATS host is evidence that
 * two companies use the same vendor, not that they are the same company.
 */
const SHARED_ATS_HOSTS = [
  'greenhouse.io', 'lever.co', 'ashbyhq.com', 'smartrecruiters.com',
  'workable.com', 'bamboohr.com', 'myworkdayjobs.com', 'workday.com',
  'linkedin.com', 'indeed.com', 'reed.co.uk', 'totaljobs.com',
];

function isDistinctiveHost(host: string): boolean {
  return !SHARED_ATS_HOSTS.some((shared) => host === shared || host.endsWith(`.${shared}`));
}

export function isResolvableEmployerName(value: string): boolean {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length < 2 || compact.length > 256) return false;
  if (!/[\p{L}\p{N}]/u.test(compact)) return false;
  if (/^(?:https?:\/\/|www\.)/i.test(compact)) return false;
  return !UNUSABLE_EMPLOYER_NAMES.has(compact.toLowerCase());
}

const unresolved = (reason: string): CompanyResolutionResult => ({
  outcome: 'NO_COMPANY_MATCH',
  candidateCount: 0,
  reasons: [reason],
});

type CandidateCompany = {
  id: string;
  displayName: string;
  normalisedName: string;
  websiteUrl: string | null;
  careersUrl: string | null;
  sponsorOrganisationName: string | null;
};

const CANDIDATE_SELECT = {
  id: true,
  displayName: true,
  normalisedName: true,
  websiteUrl: true,
  careersUrl: true,
  sponsorOrganisationName: true,
} as const;

/**
 * Resolve one employer. Bounded: at most three indexed queries, and the
 * token-overlap pass reads at most {@link MAX_COMPANY_CANDIDATES} rows.
 */
export async function resolveCompanyForEmployer(
  input: CompanyResolutionInput,
  client: typeof prisma = prisma,
): Promise<CompanyResolutionResult> {
  if (!isResolvableEmployerName(input.employerName)) {
    return unresolved('The employer name is a placeholder or is malformed, so no company identity was attempted.');
  }
  const normalised = normaliseEmployerName(input.employerName);
  if (!normalised) {
    return unresolved('The employer name has no usable organisation identity after normalisation.');
  }

  // 1. Exact canonical identity. `normalisedName` is unique, so this is either
  //    a single company or nothing — there is no ambiguity to resolve.
  const exact = await client.companyRecord.findUnique({
    where: { normalisedName: normalised },
    select: CANDIDATE_SELECT,
  });
  if (exact) {
    return {
      outcome: 'MATCHED_COMPANY',
      companyRecordId: exact.id,
      matchedDisplayName: exact.displayName,
      method: 'EXACT_NORMALISED_NAME',
      candidateCount: 1,
      reasons: ['The employer name normalises exactly to one canonical company record.'],
    };
  }

  // 2. Shared registrable domain, when the provider supplied one. A company's
  //    own website is far stronger identity evidence than its display name.
  const hosts = [comparableHost(input.websiteUrl), comparableHost(input.careersUrl)]
    .filter((host): host is string => Boolean(host) && isDistinctiveHost(host!));
  if (hosts.length) {
    const byDomain = await client.companyRecord.findMany({
      where: {
        OR: hosts.flatMap((host) => [
          { websiteUrl: { contains: host, mode: 'insensitive' as const } },
          { careersUrl: { contains: host, mode: 'insensitive' as const } },
        ]),
      },
      select: CANDIDATE_SELECT,
      take: MAX_COMPANY_CANDIDATES,
    });
    // `contains` is a substring test, so confirm the host really is the host.
    const confirmed = byDomain.filter((company) =>
      hosts.includes(comparableHost(company.websiteUrl) ?? '') ||
      hosts.includes(comparableHost(company.careersUrl) ?? ''));
    if (confirmed.length === 1) {
      return {
        outcome: 'MATCHED_COMPANY',
        companyRecordId: confirmed[0].id,
        matchedDisplayName: confirmed[0].displayName,
        method: 'WEBSITE_DOMAIN',
        candidateCount: 1,
        reasons: ['The vacancy and the company record share a distinctive employer domain.'],
      };
    }
    if (confirmed.length > 1) {
      return {
        outcome: 'AMBIGUOUS_COMPANY',
        method: 'WEBSITE_DOMAIN',
        candidateCount: confirmed.length,
        reasons: ['More than one company record claims this employer domain.'],
      };
    }
  }

  // 3. Token containment against a bounded candidate slice. Requires at least
  //    two meaningful identity tokens, ALL of them present in the company's own
  //    identity, and exactly one company that satisfies it.
  const tokens = meaningfulIdentityTokens(normalised);
  if (tokens.length < 2) {
    return unresolved('The employer name has fewer than two meaningful identity tokens, which is not enough to link a company safely.');
  }
  const anchor = [...tokens].sort((left, right) => right.length - left.length)[0];
  const candidates: CandidateCompany[] = await client.companyRecord.findMany({
    where: {
      OR: [
        { normalisedName: { contains: anchor, mode: 'insensitive' } },
        { sponsorOrganisationName: { contains: anchor, mode: 'insensitive' } },
      ],
    },
    select: CANDIDATE_SELECT,
    take: MAX_COMPANY_CANDIDATES,
  });
  if (!candidates.length) {
    return unresolved('No company record shares a meaningful identity token with this employer name.');
  }

  const containing = candidates.filter((company) => {
    const identity = new Set([
      ...meaningfulIdentityTokens(company.normalisedName),
      ...meaningfulIdentityTokens(normaliseEmployerName(company.sponsorOrganisationName ?? '')),
    ]);
    return tokens.every((token) => identity.has(token));
  });
  if (containing.length === 1) {
    const company = containing[0];
    const alias = normaliseEmployerName(company.sponsorOrganisationName ?? '') === normalised;
    return {
      outcome: 'MATCHED_COMPANY',
      companyRecordId: company.id,
      matchedDisplayName: company.displayName,
      method: alias ? 'SPONSOR_LEGAL_NAME_ALIAS' : 'IDENTITY_TOKEN_CONTAINMENT',
      candidateCount: candidates.length,
      reasons: [
        alias
          ? 'The employer name matches the legal organisation name already recorded for one company.'
          : 'Every meaningful identity token of the employer name is present in exactly one company record.',
      ],
    };
  }
  if (containing.length > 1) {
    return {
      outcome: 'AMBIGUOUS_COMPANY',
      method: 'IDENTITY_TOKEN_CONTAINMENT',
      candidateCount: containing.length,
      reasons: ['More than one company record contains every meaningful identity token of this employer name.'],
    };
  }
  return {
    outcome: 'NO_COMPANY_MATCH',
    candidateCount: candidates.length,
    reasons: ['Candidate companies were found but none contains every meaningful identity token of this employer name.'],
  };
}

/**
 * Batch entry point for ingestion. Deduplicates by normalised employer name so a
 * page of fifteen vacancies from three employers costs three resolutions, not
 * fifteen. The returned map is keyed by the ORIGINAL `employerName` string.
 */
export async function resolveCompaniesForEmployers(
  inputs: readonly CompanyResolutionInput[],
  client: typeof prisma = prisma,
): Promise<Map<string, CompanyResolutionResult>> {
  const results = new Map<string, CompanyResolutionResult>();
  if (!inputs.length) return results;

  const byIdentity = new Map<string, CompanyResolutionInput[]>();
  for (const input of inputs) {
    const key = `${normaliseEmployerName(input.employerName)}|${comparableHost(input.websiteUrl) ?? ''}|${comparableHost(input.careersUrl) ?? ''}`;
    const bucket = byIdentity.get(key);
    if (bucket) bucket.push(input);
    else byIdentity.set(key, [input]);
  }

  await Promise.all(
    [...byIdentity.values()].map(async (bucket) => {
      const resolved = await resolveCompanyForEmployer(bucket[0], client);
      for (const input of bucket) results.set(input.employerName, resolved);
    }),
  );
  return results;
}
