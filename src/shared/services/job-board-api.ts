/* eslint-disable @typescript-eslint/no-explicit-any -- This boundary accepts several Prisma relation payloads and emits typed public views. */
import { createHash } from "node:crypto";
import { prisma } from "@/shared/lib/prisma";
import { assessDescriptionCompleteness } from "@/shared/services/job-description-completeness";
import {
  ATS_FRESHNESS,
  DISCOVERY_ATS_PROVIDERS,
} from "@/shared/services/job-discovery";

export const SPONSOR_REGISTER_DISCLAIMER =
  "Sponsor-register evidence indicates that an organisation name may appear on the UK register. It does not confirm sponsorship for a particular vacancy or candidate.";
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
  if (status === "EXACT") return { status: "MATCHED" };
  if (status === "LIKELY" || status === "AMBIGUOUS")
    return { status: "AMBIGUOUS" };
  if (status === "NONE") return { status: "NONE" };
  return { status: "NOT_CHECKED" };
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
    sponsorEvidenceSummary: sponsorSummary(
      snapshot.companyRecord?.sponsorMatchStatus ??
        toJson<any>(snapshot.employerSponsorEvidence)?.status,
    ),
    saved,
  };
}
export async function getJobDetailsView(jobSnapshotId: string, userId: string) {
  const snapshot = await prisma.jobSnapshot.findUnique({
    where: { id: jobSnapshotId },
    include: {
      providerReferences: true,
      companyRecord: true,
      employerSource: true,
      savedJobs: { where: { userId }, select: { id: true } },
    },
  });
  if (!snapshot) return null;
  const selected = description(snapshot);
  const intelligence = currentIntelligence(snapshot);
  const reference = preferredReference(snapshot);
  // Register provenance is recorded twice: authoritatively on the canonical
  // company, and on the snapshot's own evidence blob for employers that never
  // resolved to a company. Prefer the company, fall back to the blob, and emit
  // nothing when neither holds a value.
  const employerEvidence = toJson<{
    checkedAt?: string;
    registerVersion?: string;
  }>(snapshot.employerSponsorEvidence);
  const sponsorCheckedAt =
    iso(snapshot.companyRecord?.sponsorCheckedAt) ?? employerEvidence?.checkedAt;
  const sponsorRegisterVersion =
    snapshot.companyRecord?.sponsorRegisterVersion ??
    employerEvidence?.registerVersion;
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
      summary: sponsorSummary(
        snapshot.companyRecord?.sponsorMatchStatus ??
          toJson<any>(snapshot.employerSponsorEvidence)?.status,
      ),
      disclaimer: SPONSOR_REGISTER_DISCLAIMER,
      ...(snapshot.companyRecord?.sponsorOrganisationName
        ? {
            matchedOrganisationName:
              snapshot.companyRecord.sponsorOrganisationName,
          }
        : {}),
      ...(sponsorCheckedAt ? { checkedAt: sponsorCheckedAt } : {}),
      ...(sponsorRegisterVersion
        ? { registerVersion: sponsorRegisterVersion }
        : {}),
    },
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
  const company = await prisma.companyRecord.findUnique({
    where: { id: companyRecordId },
    select: {
      id: true,
      displayName: true,
      websiteUrl: true,
      careersUrl: true,
      industry: true,
      country: true,
      sponsorMatchStatus: true,
      sponsorOrganisationName: true,
      jobSources: { select: companySourceSelect },
      _count: { select: { jobSnapshots: { where: usable } } },
    },
  });
  if (!company) return null;
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
      summary: sponsorSummary(company.sponsorMatchStatus),
      disclaimer: SPONSOR_REGISTER_DISCLAIMER,
      ...(company.sponsorOrganisationName
        ? { matchedOrganisationName: company.sponsorOrganisationName }
        : {}),
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
