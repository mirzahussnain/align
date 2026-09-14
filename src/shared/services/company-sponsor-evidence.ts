/**
 * Employer sponsor-register evidence: persistence, staleness and enrichment.
 *
 * This is the ONE place that decides whether a CompanyRecord's stored register
 * evidence is usable, and the one place allowed to write it. Everything else
 * (job details, company details, search cards, the backfill command) reads what
 * this module persisted.
 *
 * THREE RULES THAT MUST NOT BE RELAXED.
 *
 * 1. A failed check is never a NONE. If the register cannot be loaded, or the
 *    employer name cannot be checked, the company keeps NOT_CHECKED and carries
 *    a `checkState` explaining why. Publishing "no sponsor-register match" on
 *    the strength of a network timeout is a false factual claim about a real
 *    organisation.
 * 2. Evidence is bound to the register version that produced it. When the Home
 *    Office publishes a new CSV, every older row becomes STALE and is presented
 *    as such until it is re-checked — never silently re-presented as current.
 * 3. Register evidence is about an organisation NAME. It is not a statement
 *    about a vacancy, and it never touches vacancy sponsorship wording.
 */
import type { Prisma } from '@/generated/prisma/client';
import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import { prisma } from '@/shared/lib/prisma';
import { logJobBoardEvent } from '@/shared/services/job-board-observability';
import { matchSponsorCompaniesCached, type SponsorMatch } from '@/shared/services/sponsor-match-cache';
import { getSponsorRegisterVersion } from '@/shared/services/sponsor-registry';
import {
  SPONSOR_REGISTER_DISCLAIMER,
  type CompanySponsorEvidenceProvenance,
  type SponsorConfidenceBand,
  type SponsorEvidenceStatus,
  type SponsorEvidenceViewModel,
} from '@/shared/types/sponsor-evidence';

/** The company columns any sponsor read needs. Nothing else is loaded. */
export const SPONSOR_EVIDENCE_SELECT = {
  id: true,
  displayName: true,
  sponsorMatchStatus: true,
  sponsorOrganisationName: true,
  sponsorRegisterVersion: true,
  sponsorCheckedAt: true,
  sponsorEvidence: true,
} as const;

export type CompanySponsorEvidenceRow = {
  id?: string;
  sponsorMatchStatus?: string | null;
  sponsorOrganisationName?: string | null;
  sponsorRegisterVersion?: string | null;
  sponsorCheckedAt?: Date | string | null;
  sponsorEvidence?: unknown;
};

/**
 * Database enum → public status.
 *
 * EXACT and LIKELY (high-confidence dominant fuzzy match) are surfaced as MATCHED.
 * AMBIGUOUS is reserved for cases where multiple distinct candidate organisations fit.
 */
export function sponsorStatusToEvidenceStatus(
  status: string | null | undefined,
): SponsorEvidenceStatus {
  if (status === 'EXACT' || status === 'LIKELY') return 'MATCHED';
  if (status === 'AMBIGUOUS') return 'AMBIGUOUS';
  if (status === 'NONE') return 'NONE';
  return 'NOT_CHECKED';
}

function confidenceBand(status: string | null | undefined): SponsorConfidenceBand | undefined {
  if (status === 'EXACT') return 'EXACT';
  if (status === 'LIKELY') return 'STRONG';
  if (status === 'AMBIGUOUS') return 'AMBIGUOUS';
  return undefined;
}

const provenanceOf = (value: unknown): CompanySponsorEvidenceProvenance =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as CompanySponsorEvidenceProvenance)
    : {};

/**
 * Evidence that predates the current register generation.
 *
 * A row checked against no version at all is treated as stale too: without a
 * version token there is no way to claim it describes the current register.
 */
export function isSponsorEvidenceStale(
  company: CompanySponsorEvidenceRow,
  currentRegisterVersion: string | undefined,
): boolean {
  if (company.sponsorMatchStatus === 'NOT_CHECKED' || !company.sponsorMatchStatus) return true;
  if (!company.sponsorRegisterVersion) return true;
  if (!currentRegisterVersion) return false; // Unknowable right now; do not claim staleness.
  return company.sponsorRegisterVersion !== currentRegisterVersion;
}

/**
 * The API/UI projection. Stale evidence keeps its status but is flagged, so the
 * UI can show the last known outcome AND that it needs re-checking rather than
 * presenting an old register's answer as today's.
 */
export function toSponsorEvidenceViewModel(
  company: CompanySponsorEvidenceRow | null | undefined,
  options: { currentRegisterVersion?: string; fallbackCheckState?: SponsorEvidenceViewModel['checkState'] } = {},
): SponsorEvidenceViewModel {
  if (!company) {
    return {
      status: 'NOT_CHECKED',
      checkState: options.fallbackCheckState ?? 'COMPANY_UNRESOLVED',
      disclaimer: SPONSOR_REGISTER_DISCLAIMER,
    };
  }
  const provenance = provenanceOf(company.sponsorEvidence);
  const status = sponsorStatusToEvidenceStatus(company.sponsorMatchStatus);
  const checkedAt =
    company.sponsorCheckedAt instanceof Date
      ? company.sponsorCheckedAt.toISOString()
      : typeof company.sponsorCheckedAt === 'string'
        ? company.sponsorCheckedAt
        : undefined;
  const stale = isSponsorEvidenceStale(company, options.currentRegisterVersion);
  return {
    status,
    ...(company.sponsorOrganisationName ? { matchedOrganisationName: company.sponsorOrganisationName } : {}),
    ...(company.sponsorRegisterVersion ? { registerVersion: company.sponsorRegisterVersion } : {}),
    ...(checkedAt ? { checkedAt } : {}),
    ...(status === 'NOT_CHECKED'
      ? { checkState: provenance.checkState ?? options.fallbackCheckState ?? 'NEVER_CHECKED' }
      : {}),
    ...(stale && status !== 'NOT_CHECKED' ? { stale: true } : {}),
    ...(confidenceBand(company.sponsorMatchStatus) ? { confidenceBand: confidenceBand(company.sponsorMatchStatus)! } : {}),
    ...(provenance.reasons?.length ? { reasons: provenance.reasons } : {}),
    disclaimer: SPONSOR_REGISTER_DISCLAIMER,
  };
}

export type SponsorEnrichmentOutcome =
  | 'ALREADY_CURRENT'
  | 'CHECKED'
  | 'REFRESHED_STALE'
  | 'CHECK_UNAVAILABLE'
  | 'EMPLOYER_UNIDENTIFIABLE'
  | 'COMPANY_NOT_FOUND';

export type SponsorEnrichmentResult = {
  outcome: SponsorEnrichmentOutcome;
  status: SponsorEvidenceStatus;
  companyRecordId?: string;
  registerVersion?: string;
};

function matchToPersistedStatus(match: SponsorMatch | undefined): 'EXACT' | 'LIKELY' | 'AMBIGUOUS' | 'NONE' | undefined {
  if (!match) return undefined;
  return match.status;
}

/**
 * Ensure one company carries current sponsor-register evidence.
 *
 * Idempotent, and cheap on the common path: a company already checked against
 * the current register version returns ALREADY_CURRENT without touching the
 * matcher or the database. `force` re-checks regardless.
 */
export async function ensureCompanySponsorEvidence(
  companyRecordId: string,
  options: { force?: boolean; client?: typeof prisma } = {},
): Promise<SponsorEnrichmentResult> {
  const client = options.client ?? prisma;
  const company = await client.companyRecord.findUnique({
    where: { id: companyRecordId },
    select: SPONSOR_EVIDENCE_SELECT,
  });
  if (!company) return { outcome: 'COMPANY_NOT_FOUND', status: 'NOT_CHECKED' };

  let registerVersion: string;
  try {
    registerVersion = await getSponsorRegisterVersion();
  } catch {
    // The register is unreachable. Leave whatever is stored alone — including a
    // NOT_CHECKED — and report that the CHECK failed, not that there is no match.
    logJobBoardEvent('sponsor_check_unavailable', { reason: 'REGISTER_VERSION_UNAVAILABLE' });
    return {
      outcome: 'CHECK_UNAVAILABLE',
      status: sponsorStatusToEvidenceStatus(company.sponsorMatchStatus),
      companyRecordId,
    };
  }

  const wasStale = isSponsorEvidenceStale(company, registerVersion);
  if (!options.force && !wasStale) {
    return {
      outcome: 'ALREADY_CURRENT',
      status: sponsorStatusToEvidenceStatus(company.sponsorMatchStatus),
      companyRecordId,
      registerVersion,
    };
  }

  let match: SponsorMatch | undefined;
  try {
    match = (await matchSponsorCompaniesCached(getCacheStore(), [company.displayName])).get(company.displayName);
  } catch {
    logJobBoardEvent('sponsor_check_unavailable', { registerVersion, reason: 'MATCHER_FAILED' });
    return {
      outcome: 'CHECK_UNAVAILABLE',
      status: sponsorStatusToEvidenceStatus(company.sponsorMatchStatus),
      companyRecordId,
      registerVersion,
    };
  }

  const persisted = matchToPersistedStatus(match);
  if (!persisted) {
    // The name was never checkable (empty, control characters, a URL). Record
    // WHY so the UI can say "employer name cannot be checked" rather than
    // implying a check is merely outstanding, but do not claim NONE.
    await client.companyRecord.update({
      where: { id: company.id },
      data: {
        sponsorMatchStatus: 'NOT_CHECKED',
        sponsorEvidence: {
          checkState: 'EMPLOYER_UNIDENTIFIABLE',
          reasons: ['The company display name has no usable organisation identity, so it was not sent to the sponsor-register matcher.'],
        } satisfies CompanySponsorEvidenceProvenance as Prisma.InputJsonValue,
      },
    });
    return { outcome: 'EMPLOYER_UNIDENTIFIABLE', status: 'NOT_CHECKED', companyRecordId, registerVersion };
  }

  const provenance: CompanySponsorEvidenceProvenance = {
    normalisedEmployerName: company.displayName.trim().toLocaleLowerCase('en-GB'),
    matchMethod: persisted === 'EXACT' ? 'EXACT_ORGANISATION_NAME' : persisted === 'NONE' ? 'NO_SUFFICIENT_MATCH' : 'INDEXED_TOKEN_SIMILARITY',
    ...(confidenceBand(persisted) ? { confidenceBand: confidenceBand(persisted)! } : {}),
    candidateCount: match?.candidateOrganisationNames?.length ?? (persisted === 'NONE' ? 0 : 1),
    ...(match?.candidateOrganisationNames?.length
      ? { candidateOrganisationNames: match.candidateOrganisationNames.slice(0, 5) }
      : {}),
    ...(match?.reasons?.length ? { reasons: match.reasons } : {}),
  };

  const checkedAt = new Date();
  await client.companyRecord.update({
    where: { id: company.id },
    data: {
      sponsorMatchStatus: persisted,
      sponsorOrganisationName: match?.organisationName ?? null,
      sponsorRegisterVersion: registerVersion,
      sponsorCheckedAt: checkedAt,
      sponsorEvidence: provenance as Prisma.InputJsonValue,
      sponsorHistory: {
        upsert: {
          where: {
            companyRecordId_registerVersion: {
              companyRecordId: company.id,
              registerVersion,
            },
          },
          create: {
            registerVersion,
            matchStatus: persisted,
            organisationName: match?.organisationName ?? null,
            checkedAt,
            evidence: provenance as Prisma.InputJsonValue,
          },
          update: {
            matchStatus: persisted,
            organisationName: match?.organisationName ?? null,
            checkedAt,
            evidence: provenance as Prisma.InputJsonValue,
          },
        },
      },
    },
  });
  logJobBoardEvent('sponsor_company_enriched', {
    registerVersion,
    reason: persisted,
    count: 1,
  });
  return {
    outcome: wasStale && company.sponsorMatchStatus !== 'NOT_CHECKED' ? 'REFRESHED_STALE' : 'CHECKED',
    status: sponsorStatusToEvidenceStatus(persisted),
    companyRecordId,
    registerVersion,
  };
}

/**
 * Bounded fan-out for a small set of companies (a details page, an ingestion
 * batch). Deliberately NOT for the whole table — the backfill command paginates.
 */
export async function ensureCompanySponsorEvidenceForMany(
  companyRecordIds: readonly string[],
  options: { force?: boolean; client?: typeof prisma; concurrency?: number } = {},
): Promise<Map<string, SponsorEnrichmentResult>> {
  const results = new Map<string, SponsorEnrichmentResult>();
  const unique = [...new Set(companyRecordIds)].filter(Boolean);
  if (!unique.length) return results;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, 16));
  for (let index = 0; index < unique.length; index += concurrency) {
    const batch = unique.slice(index, index + concurrency);
    const settled = await Promise.all(
      batch.map(async (id) => [id, await ensureCompanySponsorEvidence(id, options)] as const),
    );
    for (const [id, result] of settled) results.set(id, result);
  }
  return results;
}
