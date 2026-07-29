/* eslint-disable @typescript-eslint/no-explicit-any -- This boundary accepts several Prisma relation payloads and emits typed public views. */
import { createHash } from "node:crypto";
import { prisma } from "@/shared/lib/prisma";
import {
  ensureCompanySponsorEvidence,
  isSponsorEvidenceStale,
  sponsorStatusToEvidenceStatus,
  toSponsorEvidenceViewModel,
} from "@/shared/services/company-sponsor-evidence";
import { assessDescriptionCompleteness } from "@/shared/services/job-description-completeness";
import { logJobBoardEvent } from "@/shared/services/job-board-observability";
import {
  ATS_FRESHNESS,
  DISCOVERY_ATS_PROVIDERS,
} from "@/shared/services/job-discovery";
import { comparePracticalCompatibility } from "@/shared/services/practical-compatibility";
import { buildConfirmedCandidateFacts } from "@/shared/services/practical-compatibility-store";
import { getSponsorRegisterVersion } from "@/shared/services/sponsor-registry";
import type { VacancyRequirementEvidence } from "@/shared/types/job-intelligence";
import type { PracticalCompatibilityViewModel } from "@/shared/types/practical-compatibility";
import {
  SPONSOR_REGISTER_DISCLAIMER,
  type SponsorEvidenceViewModel,
} from "@/shared/types/sponsor-evidence";

export { SPONSOR_REGISTER_DISCLAIMER };
const ATS = new Set<string>(DISCOVERY_ATS_PROVIDERS);
const toJson = <T>(value: unknown): T | undefined =>
  value && typeof value === "object" ? (value as T) : undefined;
const iso = (value: Date | null | undefined) => value?.toISOString();
const number = (value: { toNumber(): number } | number | null | undefined) =>
  value == null
    ? undefined
    : typeof value === "number"
      ? value
      : value.toNumber();
export const safeUrl = (value: string | null | undefined) => {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol)
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
export const snapshotFreshness = (
  snapshot: { lastSeenAt: Date },
  now = new Date(),
) =>
  now.getTime() - snapshot.lastSeenAt.getTime() <= ATS_FRESHNESS.freshMs
    ? ("FRESH" as const)
    : ("STALE" as const);
export const isUsableSnapshot = (
  snapshot: {
    lastSeenAt: Date;
    status: string;
    employerSource?: {
      enabled: boolean;
      verificationStatus: string;
      provider: string;
    } | null;
  },
  now = new Date(),
) =>
  snapshot.status === "ACTIVE" &&
  !!snapshot.employerSource &&
  ATS.has(snapshot.employerSource.provider) &&
  snapshot.employerSource.enabled &&
  snapshot.employerSource.verificationStatus === "VERIFIED" &&
  now.getTime() - snapshot.lastSeenAt.getTime() <= ATS_FRESHNESS.usableStaleMs;

export type SponsorEvidenceSummary = {
  status: "MATCHED" | "AMBIGUOUS" | "NONE" | "NOT_CHECKED";
};
export function sponsorSummary(
  status: string | null | undefined,
): SponsorEvidenceSummary {
  return { status: sponsorStatusToEvidenceStatus(status) };
}

/**
 * Which sponsor status a snapshot should show.
 *
 * WHAT WAS WRONG. This was `company?.sponsorMatchStatus ?? snapshotBlob?.status`.
 * `sponsorMatchStatus` is a non-null enum column that DEFAULTS to NOT_CHECKED,
 * so `??` never fell through: the instant a vacancy was linked to a company, an
 * un-enriched company's NOT_CHECKED masked whatever evidence the snapshot's own
 * blob had already recorded. Every ATS vacancy on the board therefore read
 * "Sponsor-register evidence not checked" even where a check had been done.
 *
 * The canonical company remains authoritative when it has actually been checked;
 * the snapshot blob is the fallback for employers that never resolved to one.
 */
function effectiveSponsorStatus(snapshot: any): string | null | undefined {
  const company = snapshot.companyRecord?.sponsorMatchStatus;
  if (company && company !== "NOT_CHECKED") return company;
  const blob = toJson<any>(snapshot.employerSponsorEvidence)?.status;
  if (blob && blob !== "NOT_CHECKED") return blob;
  return company ?? blob;
}
function sourceHealth(source: any, now = new Date()) {
  if (!source.enabled || source.verificationStatus === "DISABLED")
    return "DISABLED";
  if (
    source.lastErrorAt &&
    (!source.lastSuccessfulSyncAt ||
      source.lastErrorAt > source.lastSuccessfulSyncAt)
  )
    return "TEMPORARILY_UNAVAILABLE";
  if (!source.lastSuccessfulSyncAt || source.lastVerifiedJobCount === 0)
    return "EMPTY";
  if (
    now.getTime() - source.lastSuccessfulSyncAt.getTime() >
    ATS_FRESHNESS.usableStaleMs
  )
    return "STALE";
  return "HEALTHY";
}
function preferredReference(snapshot: any) {
  const refs = snapshot.providerReferences ?? [];
  return (
    refs.find(
      (ref: any) => ATS.has(ref.provider) && safeUrl(ref.applicationUrl),
    ) ??
    refs.find((ref: any) => ATS.has(ref.provider)) ??
    refs[0]
  );
}
/**
 * The description contract the UI consumes. Every field here is SERVER-computed:
 * React must never re-derive completeness from text length, and previously did
 * not have to — but `completeness` used to short-circuit to FULL for any pasted
 * text and for any snapshot whose persisted availability said FULL, which the
 * old ingestion classifier handed out almost universally.
 *
 * The provider text and the pasted text are kept as separate fields so a caller
 * can show provenance without the two ever being conflated; `active*` names
 * which one is in force.
 */
function description(snapshot: any) {
  const pasted: string | undefined = snapshot.userSuppliedDescription ?? undefined;
  const provider: string | undefined = snapshot.providerDescription ?? undefined;

  const providerAvailability: "FULL" | "PARTIAL" | "EXTERNAL_ONLY" = !provider
    ? "EXTERNAL_ONLY"
    : snapshot.descriptionAvailability === "FULL"
      ? "FULL"
      : snapshot.descriptionAvailability === "PARTIAL"
        ? "PARTIAL"
        : "EXTERNAL_ONLY";

  const assessed = assessDescriptionCompleteness(
    pasted ? { description: pasted, userSupplied: true } : { description: provider ?? null },
  );

  const text = pasted ?? provider;
  const source = pasted
    ? ("USER_PASTED" as const)
    : provider
      ? providerAvailability === "FULL"
        ? ("PROVIDER_FULL" as const)
        : ("PROVIDER_PARTIAL" as const)
      : ("NONE" as const);
  const hash = text ? createHash("sha256").update(text).digest("hex") : undefined;

  // Pasted text carries its own assessment; provider text carries the persisted
  // one, which the reassessment command keeps in step with the classifier.
  const completeness = pasted ? assessed.availability : providerAvailability;

  return {
    text,
    source,
    hash,
    completeness,
    providerAvailability,
    ...(provider ? { providerDescription: provider } : {}),
    ...(pasted ? { userPastedDescription: pasted } : {}),
    /** Whether a Description tab would open onto real content. */
    hasReadableText: Boolean(text) && assessed.hasReadableText,
    reasons: assessed.reasons,
  };
}
function currentIntelligence(snapshot: any) {
  const selected = description(snapshot);
  if (!selected.hash || selected.hash !== snapshot.selectedDescriptionHash)
    return undefined;
  return {
    descriptionAssessment: toJson(snapshot.descriptionAssessment),
    practicalRequirements: toJson(snapshot.requirementEvidence),
    vacancySponsorship: toJson(snapshot.vacancySponsorshipSignal),
    assessedAt: iso(snapshot.intelligenceAssessedAt),
  };
}
export function jobCard(snapshot: any, saved = false) {
  const ref = preferredReference(snapshot);
  const provider =
    snapshot.employerSource?.provider ?? ref?.provider ?? "UNKNOWN";
  const employerDirect =
    !!snapshot.employerSource ||
    (snapshot.providerReferences ?? []).some((item: any) =>
      ATS.has(item.provider),
    );
  const salaryMin = number(snapshot.salaryMin);
  const salaryMax = number(snapshot.salaryMax);
  const selected = description(snapshot);
  return {
    id: snapshot.id,
    /**
     * Description state on the CARD.
     *
     * The card used to carry no description field at all, so the badge was
     * rendered from `freshness` — which is snapshot age, has nothing to do with
     * description completeness, and is FRESH for essentially every discovered
     * vacancy. That is why every card read "Full Description".
     */
    descriptionAvailability: selected.completeness,
    hasReadableDescription: selected.hasReadableText,
    ...(safeUrl(preferredReference(snapshot)?.providerUrl)
      ? { fullDescriptionExternalUrl: safeUrl(preferredReference(snapshot)?.providerUrl) }
      : {}),
    title: snapshot.title,
    company: {
      ...(snapshot.companyRecordId ? { id: snapshot.companyRecordId } : {}),
      displayName: snapshot.companyRecord?.displayName ?? snapshot.employerName,
    },
    ...(snapshot.locationText ? { location: snapshot.locationText } : {}),
    ...(snapshot.workStyle ? { workplaceType: snapshot.workStyle } : {}),
    ...((snapshot.employmentType ?? snapshot.contractType)
      ? { employmentType: snapshot.employmentType ?? snapshot.contractType }
      : {}),
    ...(snapshot.salaryText || salaryMin != null || salaryMax != null
      ? {
          salary: {
            ...(snapshot.salaryText ? { text: snapshot.salaryText } : {}),
            ...(salaryMin != null ? { min: salaryMin } : {}),
            ...(salaryMax != null ? { max: salaryMax } : {}),
            ...(snapshot.salaryPeriod ? { period: snapshot.salaryPeriod } : {}),
            ...(snapshot.salaryCurrency
              ? { currency: snapshot.salaryCurrency }
              : {}),
          },
        }
      : {}),
    ...(iso(snapshot.postedAt) ? { postedAt: iso(snapshot.postedAt) } : {}),
    freshness: snapshotFreshness(snapshot),
    sourceSummary: {
      preferredProvider: provider,
      providerCount: (snapshot.providerReferences ?? []).length,
      employerDirect,
    },
    // Cards read PERSISTED evidence only. Sponsor matching is never run on the
    // interactive search path; ingestion and the backfill command populate it.
    sponsorEvidenceSummary: sponsorSummary(effectiveSponsorStatus(snapshot)),
    saved,
  };
}
/**
 * Bounded, awaited sponsor enrichment for ONE opened vacancy.
 *
 * The preferred path is that ingestion and the backfill command have already
 * persisted evidence, in which case `ensureCompanySponsorEvidence` sees a
 * current register version and returns without doing any work. This exists for
 * the remainder: a company linked since the last backfill, or evidence that a
 * newly published register has made stale.
 *
 * It is deliberately awaited inside the request. There is no detached background
 * task here — an unawaited promise in a serverless request can be killed
 * mid-write, which is how half-written evidence and phantom NOT_CHECKED rows
 * appear. A register outage costs the caller nothing: the check reports
 * CHECK_UNAVAILABLE and the stored state is left untouched.
 */
async function enrichOnDetailsOpen(
  companyRecordId: string | null,
  company: { sponsorMatchStatus?: string | null; sponsorRegisterVersion?: string | null } | null,
) {
  if (!companyRecordId) return undefined;
  let currentRegisterVersion: string | undefined;
  try {
    currentRegisterVersion = await getSponsorRegisterVersion();
  } catch {
    // Cannot establish the current generation, so cannot judge staleness. Show
    // what is stored rather than claiming anything about it.
    return undefined;
  }
  if (!isSponsorEvidenceStale(company ?? {}, currentRegisterVersion)) return currentRegisterVersion;
  const started = Date.now();
  const result = await ensureCompanySponsorEvidence(companyRecordId);
  logJobBoardEvent("sponsor_company_enriched", {
    durationMs: Date.now() - started,
    reason: result.outcome,
    cacheLayer: "job-details",
  });
  return currentRegisterVersion;
}

export async function getJobDetailsView(
  jobSnapshotId: string,
  userId: string,
  options: { profileId?: string } = {},
) {
  let snapshot = await prisma.jobSnapshot.findUnique({
    where: { id: jobSnapshotId },
    include: {
      providerReferences: true,
      companyRecord: true,
      employerSource: true,
      savedJobs: { where: { userId }, select: { id: true } },
    },
  });
  if (!snapshot) return null;

  const currentRegisterVersion = await enrichOnDetailsOpen(
    snapshot.companyRecordId,
    snapshot.companyRecord,
  );
  // Re-read only when enrichment could have written. Nothing else in the payload
  // changes, so this is at most one extra query on the uncommon path.
  if (
    snapshot.companyRecordId &&
    isSponsorEvidenceStale(snapshot.companyRecord ?? {}, currentRegisterVersion)
  ) {
    snapshot =
      (await prisma.jobSnapshot.findUnique({
        where: { id: jobSnapshotId },
        include: {
          providerReferences: true,
          companyRecord: true,
          employerSource: true,
          savedJobs: { where: { userId }, select: { id: true } },
        },
      })) ?? snapshot;
  }

  const selected = description(snapshot);
  const intelligence = currentIntelligence(snapshot);
  const reference = preferredReference(snapshot);

  /**
   * BLOCK 1 — employer sponsor-register evidence.
   *
   * About an ORGANISATION NAME and the current Home Office register. It says
   * nothing about this vacancy and nothing about this candidate, which is why it
   * is assembled independently of the vacancy wording below and carries its own
   * mandatory disclaimer.
   *
   * Provenance is recorded in two places: authoritatively on the canonical
   * company, and on the snapshot's own blob for employers that never resolved to
   * one. The company wins when it has actually been checked.
   */
  const snapshotEvidence = toJson<{
    status?: string;
    matchedOrganisationName?: string;
    checkedAt?: string;
    registerVersion?: string;
    reasons?: string[];
  }>(snapshot.employerSponsorEvidence);
  const sponsorEvidence: SponsorEvidenceViewModel =
    snapshot.companyRecord && snapshot.companyRecord.sponsorMatchStatus !== "NOT_CHECKED"
      ? toSponsorEvidenceViewModel(snapshot.companyRecord, {
          ...(currentRegisterVersion ? { currentRegisterVersion } : {}),
        })
      : snapshotEvidence?.status && snapshotEvidence.status !== "NOT_CHECKED"
        ? toSponsorEvidenceViewModel(
            {
              sponsorMatchStatus: snapshotEvidence.status,
              sponsorOrganisationName: snapshotEvidence.matchedOrganisationName ?? null,
              sponsorRegisterVersion: snapshotEvidence.registerVersion ?? null,
              sponsorCheckedAt: snapshotEvidence.checkedAt ?? null,
              sponsorEvidence: { reasons: snapshotEvidence.reasons },
            },
            { ...(currentRegisterVersion ? { currentRegisterVersion } : {}) },
          )
        : toSponsorEvidenceViewModel(snapshot.companyRecord, {
            ...(currentRegisterVersion ? { currentRegisterVersion } : {}),
            // No company means no organisation to check — a materially different
            // statement from "a check is outstanding".
            fallbackCheckState: snapshot.companyRecordId
              ? "NEVER_CHECKED"
              : "COMPANY_UNRESOLVED",
          });

  /**
   * BLOCK 3 — candidate practical compatibility.
   *
   * User-specific, so it is computed per request and NEVER shared-cached. It
   * reads confirmed structured profile fields only, and it is kept out of every
   * score: it appears here as its own set of flags.
   */
  let practicalCompatibility: PracticalCompatibilityViewModel | undefined;
  if (options.profileId) {
    const facts = await buildConfirmedCandidateFacts(userId, options.profileId);
    if (facts) {
      // Requirements come from `intelligence`, not the raw column, so a vacancy
      // whose description has since changed compares against nothing rather than
      // against requirements extracted from text that is no longer in force.
      const requirements = intelligence?.practicalRequirements;
      practicalCompatibility = comparePracticalCompatibility(
        Array.isArray(requirements) ? (requirements as VacancyRequirementEvidence[]) : [],
        facts,
        {
          city: snapshot.city,
          region: snapshot.region,
          country: snapshot.country,
          locationText: snapshot.locationText,
          workStyle: snapshot.workStyle,
          sponsorshipSignal: (intelligence?.vacancySponsorship as { signal?: string } | undefined)
            ?.signal as never,
        },
      );
      // Counts only. No field name, no field value, no visa or location data.
      logJobBoardEvent("practical_comparison_completed", {
        count: practicalCompatibility.items.length,
        confirmedCount: practicalCompatibility.summary.confirmed,
        conflictCount: practicalCompatibility.summary.conflicts,
        unknownCount: practicalCompatibility.summary.unknown,
        notApplicableCount: practicalCompatibility.summary.notApplicable,
      });
    }
  }

  return {
    job: jobCard(snapshot, snapshot.savedJobs.length > 0),
    description: {
      ...(selected.text ? { text: selected.text } : {}),
      source: selected.source,
      hash: selected.hash,
      completeness: selected.completeness,
      hasReadableText: selected.hasReadableText,
      intelligenceCurrent: Boolean(intelligence),
    },
    // Provider text and pasted text stay addressable separately, so the UI can
    // show provenance without ever presenting one as the other.
    ...(selected.providerDescription
      ? { providerDescription: selected.providerDescription }
      : {}),
    providerDescriptionAvailability: selected.providerAvailability,
    ...(selected.userPastedDescription
      ? { userPastedDescription: selected.userPastedDescription }
      : {}),
    ...(selected.source !== "NONE"
      ? { activeDescriptionSource: selected.source }
      : {}),
    ...(selected.hash ? { activeDescriptionHash: selected.hash } : {}),
    ...(intelligence ? intelligence : {}),
    sponsorEvidence: {
      ...sponsorEvidence,
      // `summary` is retained for older clients; every new field lives on the
      // view model itself so the two can never disagree.
      summary: { status: sponsorEvidence.status },
    },
    ...(practicalCompatibility ? { practicalCompatibility } : {}),
    sourceProvenance: snapshot.providerReferences.map((item) => ({
      provider: item.provider,
      providerJobId: item.providerJobId,
      ...(safeUrl(item.providerUrl)
        ? { hostedUrl: safeUrl(item.providerUrl) }
        : {}),
      ...(safeUrl(item.applicationUrl)
        ? { applicationUrl: safeUrl(item.applicationUrl) }
        : {}),
    })),
    firstSeenAt: iso(snapshot.firstSeenAt),
    lastRefreshedAt: iso(snapshot.lastSeenAt),
    ...(safeUrl(reference?.applicationUrl)
      ? { applicationUrl: safeUrl(reference.applicationUrl) }
      : {}),
    ...(safeUrl(reference?.providerUrl)
      ? { hostedUrl: safeUrl(reference.providerUrl) }
      : {}),
    availability: isUsableSnapshot(snapshot) ? "DISCOVERABLE" : "HISTORICAL",
    // A formal match needs a COMPLETE description. Partial text still permits a
    // match request, but only through the explicit reduced-confidence
    // acknowledgement `createMatchRequest` enforces — never silently, which is
    // what `!!selected.text` allowed.
    matchPreparation: {
      eligible: selected.completeness === "FULL",
      requiresPastedDescription: selected.completeness !== "FULL",
      ...(selected.completeness === "FULL"
        ? {}
        : {
            reason:
              selected.completeness === "EXTERNAL_ONLY"
                ? "DESCRIPTION_EXTERNAL_ONLY"
                : "DESCRIPTION_PARTIAL",
          }),
    },
  };
}

export type PageInput = { cursor?: string; limit?: number };
const limitOf = (value: number | undefined) =>
  Math.max(1, Math.min(value ?? 20, 50));
function decodeCursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as {
      name: string;
      id: string;
    };
    return typeof parsed.name === "string" && typeof parsed.id === "string"
      ? parsed
      : undefined;
  } catch {
    return null;
  }
}
const encodeCursor = (value: { name: string; id: string }) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export type CompanyQuery = PageInput & {
  search?: string;
  provider?: string;
  industry?: string;
  sponsorStatus?: string;
  activeJobsOnly?: boolean;
  sort?: "NAME" | "ACTIVE_JOBS" | "RECENTLY_REFRESHED";
  /** Overrides the launch default. Pass explicitly to widen the directory. */
  ukScope?: readonly CompanyUkScope[];
};

function usableSnapshotWhere(now = new Date()) {
  return {
    status: "ACTIVE" as const,
    lastSeenAt: {
      gte: new Date(now.getTime() - ATS_FRESHNESS.usableStaleMs),
    },
    employerSource: {
      is: {
        provider: { in: [...DISCOVERY_ATS_PROVIDERS] },
        enabled: true,
        verificationStatus: "VERIFIED" as const,
      },
    },
  };
}

/**
 * Usable AND not positively foreign.
 *
 * The SQL half of the same two-layer gate the discovery query applies: reject
 * the rows the database can be certain about, and let the deterministic
 * classifier settle everything else. Used for the vacancy COUNT a company card
 * shows, because "49 verified employer sources" was being read as "49 useful UK
 * employers" when most of those sources are global boards.
 */
function ukVacancyWhere(now = new Date()) {
  return {
    ...usableSnapshotWhere(now),
    // The NULL branch is required: `NOT (country IN (...))` is NULL, not TRUE,
    // for an unrecorded country, so a bare NOT-IN would exclude every row whose
    // country was never captured — most of this table.
    OR: [
      { country: null },
      { country: { notIn: [...NON_UK_COUNTRY_VALUES] } },
    ],
  };
}

/**
 * Deterministic UK relevance for an employer.
 *
 * Explicitly NOT sponsor-register evidence. A register match says an
 * organisation NAME appears on a Home Office list; it says nothing about whether
 * this employer is currently hiring in the UK, and conflating the two is how a
 * directory fills with global companies that happen to share a name.
 *
 * Nor does merely using Greenhouse, Lever or Ashby qualify: those are global
 * products, and a verified source is evidence that a BOARD exists, not that UK
 * vacancies do.
 */
export type CompanyUkScope =
  | "UK_RELEVANT"
  | "GLOBAL_WITH_UK_JOBS"
  | "NOT_CURRENTLY_UK_RELEVANT"
  | "UNKNOWN";

export function classifyCompanyUkScope(input: {
  country?: string | null;
  websiteUrl?: string | null;
  careersUrl?: string | null;
  ukVacancyCount: number;
  totalVacancyCount: number;
}): CompanyUkScope {
  const ukDomain = [input.websiteUrl, input.careersUrl].some((url) => {
    const safe = safeUrl(url);
    if (!safe) return false;
    try {
      return /\.uk$/i.test(new URL(safe).hostname);
    } catch {
      return false;
    }
  });
  const ukCountry = ["GB", "UK", "GBR", "UNITED KINGDOM"].includes(
    (input.country ?? "").trim().toUpperCase(),
  );

  // A UK country record or a .uk presence, corroborated by current UK vacancies
  // or standing on its own as curated identity.
  if ((ukCountry || ukDomain) && input.ukVacancyCount > 0) return "UK_RELEVANT";
  if (input.ukVacancyCount > 0) return "GLOBAL_WITH_UK_JOBS";
  if (ukCountry || ukDomain) return "UK_RELEVANT";
  // Vacancies exist, and none of them are UK. That is a positive finding, not
  // an absence of information.
  if (input.totalVacancyCount > 0) return "NOT_CURRENTLY_UK_RELEVANT";
  return "UNKNOWN";
}

/** Launch default for the Companies directory. */
export const COMPANY_UK_SCOPE_DEFAULT: readonly CompanyUkScope[] = [
  "UK_RELEVANT",
  "GLOBAL_WITH_UK_JOBS",
];

/**
 * Country values the database can reject outright. Mirrors the discovery query's
 * pre-filter; anything ambiguous is left to the classifier.
 */
const NON_UK_COUNTRY_VALUES = [
  "US", "USA", "United States", "CA", "Canada", "IE", "Ireland", "ES", "Spain",
  "DE", "Germany", "FR", "France", "NL", "Netherlands", "IN", "India", "AU",
  "Australia", "NZ", "New Zealand", "SG", "Singapore", "AE", "PL", "Poland",
  "PT", "Portugal", "IT", "Italy", "SE", "Sweden", "CH", "Switzerland", "JP",
  "Japan", "BR", "Brazil", "ZA", "South Africa", "MX", "Mexico", "PH", "NG",
];

const companySourceSelect = {
  id: true,
  provider: true,
  verificationStatus: true,
  enabled: true,
  lastVerifiedAt: true,
  lastSuccessfulSyncAt: true,
  lastVerifiedJobCount: true,
  lastErrorAt: true,
};

function companyListView(company: any, ukVacancyCount?: number) {
  // Prisma's `_count` cannot express the same relation twice under two
  // predicates, so the UK-scoped count is measured by a separate grouped query
  // and passed in. When it is absent (a caller that has not been updated) the
  // view falls back to the unscoped total rather than reporting zero.
  const ukJobs = ukVacancyCount ?? company._count.jobSnapshots ?? 0;
  const providers = [
    ...new Set<string>(
      company.jobSources
        .filter((source: any) => source.verificationStatus === "VERIFIED")
        .map((source: any) => source.provider as string),
    ),
  ].sort();
  const refreshed = company.jobSources
    .map((source: any) => source.lastSuccessfulSyncAt as Date | null)
    .filter(Boolean)
    .sort((a: Date, b: Date) => b.getTime() - a.getTime())[0];
  return {
    id: company.id,
    displayName: company.displayName,
    ...(company.industry ? { industry: company.industry } : {}),
    ...(safeUrl(company.websiteUrl)
      ? { websiteUrl: safeUrl(company.websiteUrl) }
      : {}),
    ...(safeUrl(company.careersUrl)
      ? { careersUrl: safeUrl(company.careersUrl) }
      : {}),
    sponsorEvidenceSummary: sponsorSummary(company.sponsorMatchStatus),
    verifiedSourceCount: company.jobSources.filter(
      (source: any) => source.verificationStatus === "VERIFIED",
    ).length,
    /**
     * UK vacancies, not all vacancies.
     *
     * This is the number the directory is actually claiming something with, and
     * showing a global total under a UK-scoped product overstated every card.
     */
    activeJobCount: ukJobs,
    totalActiveJobCount: company._count.jobSnapshots ?? 0,
    ukScope: classifyCompanyUkScope({
      country: company.country,
      websiteUrl: company.websiteUrl,
      careersUrl: company.careersUrl,
      ukVacancyCount: ukJobs,
      totalVacancyCount: company._count.jobSnapshots ?? 0,
    }),
    providers,
    ...(refreshed ? { lastRefreshedAt: iso(refreshed) } : {}),
  };
}

export async function listCompanies(query: CompanyQuery) {
  const now = new Date();
  const cursor = decodeCursor(query.cursor);
  if (cursor === null) throw new Error("INVALID_CURSOR");
  const usable = usableSnapshotWhere(now);
  const ukVacancies = ukVacancyWhere(now);
  const allowedScopes: readonly CompanyUkScope[] =
    query.ukScope ?? COMPANY_UK_SCOPE_DEFAULT;
  const sponsorStatuses: Record<string, string[]> = {
    MATCHED: ["EXACT"],
    AMBIGUOUS: ["LIKELY", "AMBIGUOUS"],
    NONE: ["NONE"],
    NOT_CHECKED: ["NOT_CHECKED"],
  };
  const where: any = {
    ...(query.search?.trim()
      ? {
          displayName: {
            contains: query.search.trim(),
            mode: "insensitive",
          },
        }
      : {}),
    ...(query.industry ? { industry: query.industry } : {}),
    ...(query.sponsorStatus
      ? {
          sponsorMatchStatus: {
            in: sponsorStatuses[query.sponsorStatus] ?? [],
          },
        }
      : {}),
    ...(query.provider
      ? {
          jobSources: {
            some: {
              provider: query.provider,
              verificationStatus: "VERIFIED",
            },
          },
        }
      : {}),
    ...(query.activeJobsOnly ? { jobSnapshots: { some: ukVacancies } } : {}),
  };
  const companies = await prisma.companyRecord.findMany({
    where,
    select: {
      id: true,
      displayName: true,
      websiteUrl: true,
      careersUrl: true,
      industry: true,
      country: true,
      sponsorMatchStatus: true,
      jobSources: { select: companySourceSelect },
      _count: { select: { jobSnapshots: { where: usable } } },
    },
  });
  const ukCounts = new Map(
    (
      await prisma.jobSnapshot.groupBy({
        by: ["companyRecordId"],
        where: {
          ...ukVacancies,
          companyRecordId: { in: companies.map((company) => company.id) },
        },
        _count: { _all: true },
      })
    ).map((row) => [row.companyRecordId, row._count._all]),
  );
  // Scope is applied here rather than in SQL because it depends on the company's
  // own identity evidence as well as its vacancy counts. NOT_CURRENTLY_UK_RELEVANT
  // and UNKNOWN employers stay in the database and remain reachable by direct
  // link; they are simply not what a UK directory lists by default.
  const mapped = companies
    .map((company) => companyListView(company, ukCounts.get(company.id) ?? 0))
    .filter((company) => allowedScopes.includes(company.ukScope));
  mapped.sort((a, b) =>
    query.sort === "ACTIVE_JOBS"
      ? b.activeJobCount - a.activeJobCount ||
        a.displayName.localeCompare(b.displayName) ||
        a.id.localeCompare(b.id)
      : query.sort === "RECENTLY_REFRESHED"
        ? (b.lastRefreshedAt ?? "").localeCompare(a.lastRefreshedAt ?? "") ||
          a.displayName.localeCompare(b.displayName) ||
          a.id.localeCompare(b.id)
        : a.displayName.localeCompare(b.displayName) ||
          a.id.localeCompare(b.id),
  );
  const cursorIndex = cursor
    ? mapped.findIndex(
        (item) => item.displayName === cursor.name && item.id === cursor.id,
      )
    : -1;
  if (cursor && cursorIndex < 0) throw new Error("INVALID_CURSOR");
  const start = cursorIndex + 1;
  const items = mapped.slice(start, start + limitOf(query.limit));
  const last = items.at(-1);
  return {
    items,
    page: {
      hasMore: start + items.length < mapped.length,
      ...(last
        ? {
            nextCursor: encodeCursor({
              name: last.displayName,
              id: last.id,
            }),
          }
        : {}),
    },
  };
}

export async function getCompanyDetailsView(
  companyRecordId: string,
  _userId?: string,
) {
  void _userId;
  const now = new Date();
  const usable = usableSnapshotWhere(now);
  const companySelect = {
    id: true,
    displayName: true,
    websiteUrl: true,
    careersUrl: true,
    industry: true,
    country: true,
    sponsorMatchStatus: true,
    sponsorOrganisationName: true,
    sponsorRegisterVersion: true,
    sponsorCheckedAt: true,
    sponsorEvidence: true,
    jobSources: { select: companySourceSelect },
    _count: { select: { jobSnapshots: { where: usable } } },
  } as const;
  let company = await prisma.companyRecord.findUnique({
    where: { id: companyRecordId },
    select: companySelect,
  });
  if (!company) return null;
  // The company page is the one place a user is looking directly AT the employer,
  // so it is the right place to make sure the register evidence is current.
  let currentRegisterVersion: string | undefined;
  try {
    currentRegisterVersion = await getSponsorRegisterVersion();
  } catch {
    currentRegisterVersion = undefined;
  }
  if (isSponsorEvidenceStale(company, currentRegisterVersion)) {
    await ensureCompanySponsorEvidence(companyRecordId);
    company =
      (await prisma.companyRecord.findUnique({
        where: { id: companyRecordId },
        select: companySelect,
      })) ?? company;
  }
  const ukVacancyCount = await prisma.jobSnapshot.count({
    where: { companyRecordId, ...ukVacancyWhere(now) },
  });
  const counts = await prisma.jobSnapshot.groupBy({
    by: ["employerSourceId"],
    where: { companyRecordId, ...usable },
    _count: { _all: true },
  });
  const countBySource = new Map(
    counts.map((row) => [row.employerSourceId, row._count._all]),
  );
  const providerDistribution = Object.fromEntries(
    [...new Set(company.jobSources.map((source) => source.provider))].map(
      (provider) => [
        provider,
        company.jobSources
          .filter((source) => source.provider === provider)
          .reduce(
            (total, source) => total + (countBySource.get(source.id) ?? 0),
            0,
          ),
      ],
    ),
  );
  return {
    company: companyListView(company, ukVacancyCount),
    sponsorEvidence: {
      ...toSponsorEvidenceViewModel(company, {
        ...(currentRegisterVersion ? { currentRegisterVersion } : {}),
      }),
      summary: sponsorSummary(company.sponsorMatchStatus),
    },
    sources: company.jobSources.map((source) => ({
      provider: source.provider,
      verificationStatus: source.verificationStatus,
      enabled: source.enabled,
      health: sourceHealth(source, now),
      ...(iso(source.lastVerifiedAt)
        ? { lastVerifiedAt: iso(source.lastVerifiedAt) }
        : {}),
      ...(iso(source.lastSuccessfulSyncAt)
        ? { lastSuccessfulRefreshAt: iso(source.lastSuccessfulSyncAt) }
        : {}),
    })),
    providerDistribution,
  };
}

export async function listCompanyVacancies(
  companyRecordId: string,
  userId?: string,
  page: PageInput = {},
) {
  const cursor = decodeCursor(page.cursor);
  if (cursor === null) throw new Error("INVALID_CURSOR");
  if (
    !(await prisma.companyRecord.findUnique({
      where: { id: companyRecordId },
      select: { id: true },
    }))
  )
    return null;
  const cursorDate = cursor?.name ? new Date(cursor.name) : undefined;
  if (cursorDate && Number.isNaN(cursorDate.getTime()))
    throw new Error("INVALID_CURSOR");
  const afterCursor = cursor
    ? cursorDate
      ? {
          OR: [
            { postedAt: { lt: cursorDate } },
            { postedAt: cursorDate, id: { gt: cursor.id } },
            { postedAt: null },
          ],
        }
      : { postedAt: null, id: { gt: cursor.id } }
    : {};
  const limit = limitOf(page.limit);
  const rows = await prisma.jobSnapshot.findMany({
    where: {
      companyRecordId,
      // A company page under a UK-scoped product lists that employer's UK
      // vacancies. A global board's Bangalore and Madrid requisitions were
      // appearing here unfiltered.
      ...ukVacancyWhere(),
      ...afterCursor,
    },
    orderBy: [{ postedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: limit + 1,
    include: {
      providerReferences: true,
      companyRecord: true,
      employerSource: true,
      ...(userId
        ? {
            savedJobs: {
              where: { userId },
              select: { id: true },
            },
          }
        : {}),
    },
  });
  const hasMore = rows.length > limit;
  const items = rows
    .slice(0, limit)
    .map((snapshot) =>
      jobCard(snapshot, (snapshot.savedJobs?.length ?? 0) > 0),
    );
  const last = items.at(-1);
  return {
    items,
    page: {
      hasMore,
      ...(hasMore && last
        ? {
            nextCursor: encodeCursor({
              name: last.postedAt ?? "",
              id: last.id,
            }),
          }
        : {}),
    },
  };
}

export async function listSavedJobs(userId: string, page: PageInput = {}) {
  const limit = limitOf(page.limit);
  let decoded: { savedAt: string; id: string } | undefined;
  if (page.cursor) {
    try {
      decoded = JSON.parse(
        Buffer.from(page.cursor, "base64url").toString(),
      ) as { savedAt: string; id: string };
      if (
        typeof decoded.savedAt !== "string" ||
        typeof decoded.id !== "string" ||
        Number.isNaN(new Date(decoded.savedAt).getTime())
      )
        throw new Error("INVALID_CURSOR");
    } catch {
      throw new Error("INVALID_CURSOR");
    }
  }
  const cursorDate = decoded ? new Date(decoded.savedAt) : undefined;
  const rows = await prisma.savedJob.findMany({
    where: {
      userId,
      ...(decoded && cursorDate
        ? {
            OR: [
              { savedAt: { lt: cursorDate } },
              { savedAt: cursorDate, id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ savedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: {
      jobSnapshot: {
        include: {
          providerReferences: true,
          companyRecord: true,
          employerSource: true,
        },
      },
    },
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    savedAt: iso(row.savedAt),
    availability: isUsableSnapshot(row.jobSnapshot)
      ? "DISCOVERABLE"
      : "HISTORICAL",
    job: jobCard(row.jobSnapshot, true),
  }));
  const last = items.at(-1);
  return {
    items,
    page: {
      hasMore,
      ...(hasMore && last
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({ savedAt: last.savedAt, id: last.id }),
            ).toString("base64url"),
          }
        : {}),
    },
  };
}
