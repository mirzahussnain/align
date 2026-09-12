import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { resolveCompaniesForEmployers } from '@/shared/services/company-resolution';
import { assessDescriptionCompleteness, classifyDescriptionAvailability } from '@/shared/services/job-description-completeness';
import { logJobBoardEvent } from '@/shared/services/job-board-observability';
import { normaliseCompanyName, normaliseLocation, normaliseTitle } from '@/shared/services/job-normalisation';
import type { NormalisedJob } from '@/shared/types/job';
import type { CompanyResolutionResult } from '@/shared/types/sponsor-evidence';
import { ANALYSIS_LIMITS } from '@/shared/config/analysis-domain';

const MATCH_REQUEST_TTL_MS = 30 * 60_000;
const descriptionHash = (value: string) => createHash('sha256').update(value).digest('hex');
const asDate = (value: string | undefined) => value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
const json = <T>(value: T) => JSON.parse(JSON.stringify(value));

export type SelectedDescription = {
  text: string;
  source: 'PROVIDER_FULL' | 'PROVIDER_PARTIAL' | 'USER_PASTED';
  hash: string;
  partial: boolean;
  availability: 'FULL' | 'PARTIAL' | 'EXTERNAL_ONLY';
};

/**
 * The snapshot fields a persist pass needs to read before it writes.
 *
 * Deliberately narrow. The persist path previously loaded the whole row —
 * including `providerDescription`, which is a full job advert — to decide four
 * retain-or-replace questions.
 */
type ExistingSnapshot = {
  id: string;
  providerDescription: string | null;
  salaryMin: unknown;
  salaryMax: unknown;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryText: string | null;
  vacancySponsorshipSignal: unknown;
  companyRecordId: string | null;
  companyLinkStatus: string;
};

const EXISTING_SNAPSHOT_SELECT = {
  id: true, providerDescription: true, salaryMin: true, salaryMax: true,
  salaryCurrency: true, salaryPeriod: true, salaryText: true,
  vacancySponsorshipSignal: true, companyRecordId: true, companyLinkStatus: true,
} as const;

/**
 * Whether this snapshot still needs a company-identity attempt.
 *
 * Employer-direct ATS vacancies arrive with a company through EmployerJobSource
 * and are already done. Everything else — the aggregator half of the board — has
 * only employer TEXT, and before this it was persisted with `companyRecordId`
 * permanently null. That is the root of "Sponsor-register evidence not checked":
 * the register matcher is keyed on CompanyRecord, and these vacancies never had
 * one, so there was nothing for it to check.
 *
 * A previous AMBIGUOUS or NO_MATCH outcome is not retried on every refresh: the
 * employer text has not changed, so neither would the answer. The backfill
 * command re-runs those deliberately, when the company directory has grown.
 */
function needsCompanyLink(job: NormalisedJob, existing: ExistingSnapshot | null): boolean {
  if (job.companyRecordId || job.employerSourceId) return false;
  if (existing?.companyRecordId) return false;
  return !existing || existing.companyLinkStatus === 'NOT_ATTEMPTED';
}

/** Resolution outcome → the columns that record it. Never invents a link. */
function companyLinkFields(resolution: CompanyResolutionResult | undefined) {
  if (!resolution) return {};
  return {
    companyLinkStatus: resolution.outcome,
    companyLinkedAt: new Date(),
    companyLinkEvidence: json({
      method: resolution.method,
      candidateCount: resolution.candidateCount,
      reasons: resolution.reasons,
      ...(resolution.matchedDisplayName ? { matchedDisplayName: resolution.matchedDisplayName } : {}),
    }),
    // ONLY a confident match writes the foreign key. AMBIGUOUS_COMPANY and
    // NO_COMPANY_MATCH record why and leave the vacancy unlinked, because a
    // wrong link would attach one employer's sponsor evidence to another's advert.
    ...(resolution.outcome === 'MATCHED_COMPANY' && resolution.companyRecordId
      ? { companyRecordId: resolution.companyRecordId }
      : {}),
  };
}

/** The single write path. Shared by the per-job and batch entry points. */
async function persistSnapshot(
  job: NormalisedJob,
  existing: ExistingSnapshot | null,
  resolution?: CompanyResolutionResult,
) {
  const now = new Date();
  const canonicalJobId = job.dedupeFingerprint;
  const retainedDescription =
    existing?.providerDescription && existing.providerDescription.length > (job.description?.length ?? 0)
      ? existing.providerDescription
      : (job.description ?? null);
  const data = {
    title: job.title,
    normalisedTitle: normaliseTitle(job.title),
    employerName: job.company,
    normalisedEmployerName: job.companyNormalised ?? job.company.toLowerCase(),
    ...(job.companyRecordId ? { companyRecordId: job.companyRecordId } : {}),
    ...(job.employerSourceId ? { employerSourceId: job.employerSourceId } : {}),
    ...companyLinkFields(resolution),
    locationText: job.locationText || null,
    city: job.city ?? null,
    region: job.region ?? null,
    // The PROVIDER's country, never the classifier's derived `countryCode`.
    //
    // Writing the derived value here was a genuine, measured data-corruption
    // bug. `assessUkLocation` treats a stored country of GB/UK as EXPLICIT
    // country evidence, so persisting its own output into that field closed a
    // feedback loop: one buggy classification stamped `country = 'GB'` onto a
    // New York vacancy, and every later run then read that back as proof the
    // vacancy was British — permanently, and immune to fixing the classifier.
    // A derived judgement must never be laundered into the evidence it was
    // derived from. `jobs:audit-locations --apply` is the one place allowed to
    // write a normalised country, and only at HIGH confidence.
    country: job.country ?? null,
    workStyle: job.remoteType,
    // Existing canonical salary is retained unless it is absent; a provider's next refresh can be less complete.
    salaryMin: (existing?.salaryMin as never) ?? job.salaryMin ?? null,
    salaryMax: (existing?.salaryMax as never) ?? job.salaryMax ?? null,
    salaryCurrency: existing?.salaryCurrency ?? job.currency ?? null,
    salaryPeriod: existing?.salaryPeriod ?? job.salaryPeriod ?? null,
    salaryText: existing?.salaryText ?? job.salaryText ?? null,
    contractType: job.contractType ?? null,
    employmentType: job.employmentType ?? null,
    // Preserve a richer provider description and intelligence derived from it; user-pasted text is never part of this update object.
    providerDescription: retainedDescription,
    // Assessed from the text that is actually being STORED, never inherited.
    //
    // This used to read `existing?.descriptionAvailability === 'FULL' ? 'FULL' :
    // …`, which made FULL permanently sticky: one wrong classification (and the
    // old classifier produced them in bulk) could never be corrected by a later
    // refresh, and a provider that shortened a body kept its FULL badge over a
    // truncated advert. Availability is now a pure function of the retained text.
    descriptionAvailability: classifyDescriptionAvailability(job.source, retainedDescription ?? ''),
    vacancySponsorshipSignal: (existing?.vacancySponsorshipSignal as never) ?? json(job.sponsorSignal),
    dedupeFingerprint: job.dedupeFingerprint,
    postedAt: asDate(job.postedAt),
    expiresAt: asDate(job.expiresAt),
    lastSeenAt: now,
    fetchedAt: asDate(job.fetchedAt) ?? now,
  };
  let snapshot;
  if (existing) {
    snapshot = await prisma.jobSnapshot.update({ where: { id: existing.id }, data });
  } else {
    try {
      snapshot = await prisma.jobSnapshot.create({ data: { canonicalJobId, ...data, firstSeenAt: now } });
    } catch (error) {
      // Concurrent board batches can discover the same vacancy simultaneously.
      // The unique canonical key remains authoritative; reload then update it.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const concurrent = await prisma.jobSnapshot.findUnique({ where: { canonicalJobId }, select: { id: true } });
      if (!concurrent) throw error;
      snapshot = await prisma.jobSnapshot.update({ where: { id: concurrent.id }, data });
    }
  }

  await Promise.all(job.providerReferences.map((reference) => prisma.jobProviderReference.upsert({
    where: { provider_providerJobId: { provider: reference.provider, providerJobId: reference.sourceJobId } },
    create: { jobSnapshotId: snapshot.id, provider: reference.provider, providerJobId: reference.sourceJobId, providerUrl: reference.sourceUrl, applicationUrl: reference.applicationUrl ?? null, firstSeenAt: now, lastSeenAt: now },
    update: { jobSnapshotId: snapshot.id, providerUrl: reference.sourceUrl, applicationUrl: reference.applicationUrl ?? null, lastSeenAt: now },
  })));
  return snapshot;
}

/** Durable Job Board boundary. Routes never write JobSnapshot rows directly. */
export async function getOrCreateSnapshotFromNormalisedJob(job: NormalisedJob) {
  const existing = await prisma.jobSnapshot.findUnique({
    where: { canonicalJobId: job.dedupeFingerprint },
    select: EXISTING_SNAPSHOT_SELECT,
  });
  const resolution = needsCompanyLink(job, existing)
    // No provider adapter currently returns an employer website, so name
    // identity is the only signal available at ingestion. The domain signal
    // stays implemented for the directory and backfill paths, which do have URLs.
    ? (await resolveCompaniesForEmployers([{ employerName: job.company }])).get(job.company)
    : undefined;
  const snapshot = await persistSnapshot(job, existing, resolution);
  if (resolution) logJobBoardEvent('company_link_resolved', { reason: resolution.outcome, count: 1 });
  return getSnapshotDetails(snapshot.id);
}

export interface ImportedVacancyInput {
  userId: string;
  title: string;
  employerName: string;
  locationText?: string;
  sourceUrl?: string;
  description: string;
}

/**
 * Persist a vacancy brought from outside Align.
 *
 * Imported descriptions are private user content. Their identity therefore
 * includes the owner id and the row records that owner explicitly; they never
 * enter provider discovery or share a snapshot with another account.
 */
export async function createImportedJobSnapshot(input: ImportedVacancyInput) {
  const description = input.description.trim();
  const title = input.title.trim();
  const employerName = input.employerName.trim();
  const sourceUrl = input.sourceUrl?.trim() || undefined;
  const fingerprint = `import:${createHash('sha256')
    .update(`${input.userId}|${sourceUrl ?? descriptionHash(description)}`)
    .digest('hex')
    .slice(0, 32)}`;
  const assessed = assessDescriptionCompleteness({
    description,
    userSupplied: true,
  });
  const selectedHash = descriptionHash(description);
  const location = normaliseLocation(input.locationText?.trim() ?? '');
  const now = new Date();

  return prisma.jobSnapshot.upsert({
    where: { canonicalJobId: fingerprint },
    create: {
      canonicalJobId: fingerprint,
      dedupeFingerprint: fingerprint,
      title,
      normalisedTitle: normaliseTitle(title),
      employerName,
      normalisedEmployerName: normaliseCompanyName(employerName),
      importedByUserId: input.userId,
      importedUrl: sourceUrl,
      locationText: location.locationText || null,
      city: location.city ?? null,
      region: location.region ?? null,
      country: location.country ?? null,
      workStyle: location.remoteType,
      providerDescription: null,
      userSuppliedDescription: description,
      descriptionAvailability: assessed.availability,
      selectedDescriptionSource: 'USER_PASTED',
      selectedDescriptionHash: selectedHash,
      fetchedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
    },
    update: {
      title,
      normalisedTitle: normaliseTitle(title),
      employerName,
      normalisedEmployerName: normaliseCompanyName(employerName),
      importedUrl: sourceUrl,
      locationText: location.locationText || null,
      city: location.city ?? null,
      region: location.region ?? null,
      country: location.country ?? null,
      workStyle: location.remoteType,
      userSuppliedDescription: description,
      descriptionAvailability: assessed.availability,
      selectedDescriptionSource: 'USER_PASTED',
      selectedDescriptionHash: selectedHash,
      descriptionAssessment: Prisma.JsonNull,
      employerSponsorEvidence: Prisma.JsonNull,
      vacancySponsorshipSignal: Prisma.JsonNull,
      requirementEvidence: Prisma.JsonNull,
      intelligenceAssessedAt: null,
      lastSeenAt: now,
      fetchedAt: now,
    },
    include: { providerReferences: true },
  });
}

/**
 * Durable snapshot IDs for a whole search page, in one batch.
 *
 * The search path only needs each job's snapshot id — that is what selection,
 * details, save state and React identity are all keyed on. Calling
 * `getOrCreateSnapshotFromNormalisedJob` per card spent four round trips per
 * job (a findUnique, a create-or-update, the reference upserts, then a
 * findUnique-with-includes to re-read what had just been written) purely to
 * throw the payload away and keep the id. For a fifteen-result page that is
 * sixty-plus queries on the critical path of every single search.
 *
 * This does the existence check ONCE for the page and returns the ids from the
 * writes themselves. Behaviour is otherwise identical, including the concurrent-
 * discovery P2002 recovery, which is why that path is shared rather than copied.
 */
export async function materialiseSnapshotIds(jobs: readonly NormalisedJob[]): Promise<Map<string, string>> {
  if (!jobs.length) return new Map();
  const fingerprints = [...new Set(jobs.map((job) => job.dedupeFingerprint))];
  const existing = new Map(
    (await prisma.jobSnapshot.findMany({
      where: { canonicalJobId: { in: fingerprints } },
      select: { canonicalJobId: true, ...EXISTING_SNAPSHOT_SELECT },
    })).map((row) => [row.canonicalJobId, row]),
  );

  /**
   * Company identity for the whole page, in ONE deduplicated pass.
   *
   * This is a cheap indexed lookup per distinct employer name, not sponsor
   * matching — search cards read persisted register evidence only and are never
   * blocked on the matcher. Linking here is what makes the evidence exist to be
   * read later, for the aggregator vacancies that dominate the board.
   */
  const unlinked = jobs.filter((job) => needsCompanyLink(job, existing.get(job.dedupeFingerprint) ?? null));
  const resolutions = unlinked.length
    ? await resolveCompaniesForEmployers(unlinked.map((job) => ({ employerName: job.company })))
    : new Map<string, CompanyResolutionResult>();
  if (resolutions.size) {
    logJobBoardEvent('company_link_resolved', {
      count: [...resolutions.values()].filter((item) => item.outcome === 'MATCHED_COMPANY').length,
      reason: 'INGESTION_BATCH',
    });
  }

  const ids = new Map<string, string>();
  await Promise.all(jobs.map(async (job) => {
    const previous = existing.get(job.dedupeFingerprint) ?? null;
    const snapshot = await persistSnapshot(
      job,
      previous,
      needsCompanyLink(job, previous) ? resolutions.get(job.company) : undefined,
    );
    if (snapshot) ids.set(job.canonicalJobId, snapshot.id);
  }));
  return ids;
}

export async function getSnapshotDetails(jobSnapshotId: string, userId?: string) {
  const snapshot = await prisma.jobSnapshot.findUnique({
    where: { id: jobSnapshotId },
    include: { providerReferences: { orderBy: { firstSeenAt: 'asc' } } },
  });
  if (snapshot?.importedByUserId && snapshot.importedByUserId !== userId) return null;
  return snapshot;
}

export function resolveSelectedDescription(snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshotDetails>>>): SelectedDescription | null {
  // Pasted text is assessed too. Pasting is not a promise of completeness — a
  // user can paste the same truncated teaser the provider gave us — and treating
  // it as automatically FULL is how a partial analysis gets presented as a
  // reliable match. The provider CEILING is bypassed (the user is the source),
  // the truncation evidence is not.
  if (snapshot.userSuppliedDescription) {
    const assessed = assessDescriptionCompleteness({ description: snapshot.userSuppliedDescription, userSupplied: true });
    return { text: snapshot.userSuppliedDescription, source: 'USER_PASTED', hash: descriptionHash(snapshot.userSuppliedDescription), partial: assessed.availability !== 'FULL', availability: assessed.availability };
  }
  if (!snapshot.providerDescription) return null;
  const availability = snapshot.descriptionAvailability === 'FULL' ? 'FULL' as const : snapshot.descriptionAvailability === 'PARTIAL' ? 'PARTIAL' as const : 'EXTERNAL_ONLY' as const;
  const source = availability === 'FULL' ? 'PROVIDER_FULL' : 'PROVIDER_PARTIAL';
  return { text: snapshot.providerDescription, source, hash: descriptionHash(snapshot.providerDescription), partial: source === 'PROVIDER_PARTIAL', availability };
}

export async function attachUserDescription(input: { userId: string; jobSnapshotId: string; description: string }) {
  const description = input.description.trim();
  if (!description) throw new Error('A job description is required.');
  const snapshot = await getSnapshotDetails(input.jobSnapshotId, input.userId);
  if (!snapshot) return null;
  if (!snapshot.importedByUserId) {
    throw new Error('A fuller description for a shared vacancy must be attached to a private match request.');
  }
  const selected = { text: description, source: 'USER_PASTED' as const, hash: descriptionHash(description) };
  return prisma.jobSnapshot.update({
    where: { id: snapshot.id },
    data: { userSuppliedDescription: selected.text, selectedDescriptionSource: selected.source, selectedDescriptionHash: selected.hash, descriptionAssessment: Prisma.JsonNull, vacancySponsorshipSignal: Prisma.JsonNull, requirementEvidence: Prisma.JsonNull, intelligenceAssessedAt: null },
    include: { providerReferences: true },
  });
}

export async function saveSnapshotForUser(input: { userId: string; jobSnapshotId: string; profileId?: string }) {
  return prisma.savedJob.upsert({
    where: { userId_jobSnapshotId: { userId: input.userId, jobSnapshotId: input.jobSnapshotId } },
    create: { userId: input.userId, jobSnapshotId: input.jobSnapshotId, profileId: input.profileId },
    update: { profileId: input.profileId ?? undefined },
    include: { jobSnapshot: { include: { providerReferences: true } } },
  });
}

export async function removeSavedJob(userId: string, id: string) {
  return prisma.savedJob.deleteMany({ where: { id, userId } });
}

export async function createMatchRequest(input: { userId: string; profileId: string; jobSnapshotId: string; partialDescriptionAccepted: boolean; descriptionOverride?: string }) {
  const snapshot = await getSnapshotDetails(input.jobSnapshotId, input.userId);
  if (!snapshot) return null;
  const override = input.descriptionOverride?.trim();
  if (override && override.length > ANALYSIS_LIMITS.maxJobDescriptionCharacters) {
    throw new Error('The job description is too long.');
  }
  const selected = override
    ? (() => {
        const assessed = assessDescriptionCompleteness({ description: override, userSupplied: true });
        return { text: override, source: 'USER_PASTED' as const, hash: descriptionHash(override), partial: assessed.availability !== 'FULL', availability: assessed.availability };
      })()
    : resolveSelectedDescription(snapshot);
  if (!selected) throw new Error('Add a job description before preparing a match.');
  if (selected.partial && !input.partialDescriptionAccepted) throw new Error('Confirm that you understand this is a partial description.');
  const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_MS);
  const existing = await prisma.jobMatchRequest.findFirst({
    where: { userId: input.userId, profileId: input.profileId, jobSnapshotId: input.jobSnapshotId, selectedDescriptionHash: selected.hash, status: 'PREPARED', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.jobMatchRequest.create({ data: { userId: input.userId, profileId: input.profileId, jobSnapshotId: input.jobSnapshotId, selectedDescriptionSource: selected.source, selectedDescriptionHash: selected.hash, descriptionText: selected.text, partialDescriptionAccepted: input.partialDescriptionAccepted, expiresAt } });
}

export async function resolveMatchRequest(userId: string, id: string) {
  const request = await prisma.jobMatchRequest.findFirst({
    where: { id, userId },
    include: { jobSnapshot: { include: { providerReferences: true } } },
  });
  if (!request || request.status !== 'PREPARED' || (request.expiresAt && request.expiresAt <= new Date())) return null;
  const selected = {
    text: request.descriptionText,
    source: request.selectedDescriptionSource,
    hash: request.selectedDescriptionHash,
    partial: request.selectedDescriptionSource === 'PROVIDER_PARTIAL',
    availability: request.selectedDescriptionSource === 'PROVIDER_PARTIAL' ? 'PARTIAL' as const : 'FULL' as const,
  };
  return { request, selected };
}

export async function consumeMatchRequest(userId: string, id: string) {
  const resolved = await resolveMatchRequest(userId, id);
  if (!resolved) return null;
  await prisma.jobMatchRequest.update({ where: { id }, data: { status: 'CONSUMED', consumedAt: new Date() } });
  return resolved;
}

export { descriptionHash };
