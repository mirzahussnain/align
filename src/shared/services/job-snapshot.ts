import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { assessDescriptionCompleteness, classifyDescriptionAvailability } from '@/shared/services/job-description-completeness';
import { normaliseTitle } from '@/shared/services/job-normalisation';
import type { NormalisedJob } from '@/shared/types/job';

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
};

/** The single write path. Shared by the per-job and batch entry points. */
async function persistSnapshot(job: NormalisedJob, existing: ExistingSnapshot | null) {
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
    select: { id: true, providerDescription: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, salaryText: true, vacancySponsorshipSignal: true },
  });
  const snapshot = await persistSnapshot(job, existing);
  return getSnapshotDetails(snapshot.id);
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
      select: { id: true, canonicalJobId: true, providerDescription: true, salaryMin: true, salaryMax: true, salaryCurrency: true, salaryPeriod: true, salaryText: true, vacancySponsorshipSignal: true },
    })).map((row) => [row.canonicalJobId, row]),
  );

  const ids = new Map<string, string>();
  await Promise.all(jobs.map(async (job) => {
    const snapshot = await persistSnapshot(job, existing.get(job.dedupeFingerprint) ?? null);
    if (snapshot) ids.set(job.canonicalJobId, snapshot.id);
  }));
  return ids;
}

export async function getSnapshotDetails(jobSnapshotId: string) {
  return prisma.jobSnapshot.findUnique({
    where: { id: jobSnapshotId },
    include: { providerReferences: { orderBy: { firstSeenAt: 'asc' } } },
  });
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
  const snapshot = await getSnapshotDetails(input.jobSnapshotId);
  if (!snapshot) return null;
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

export async function createMatchRequest(input: { userId: string; profileId: string; jobSnapshotId: string; partialDescriptionAccepted: boolean }) {
  const snapshot = await getSnapshotDetails(input.jobSnapshotId);
  if (!snapshot) return null;
  const selected = resolveSelectedDescription(snapshot);
  if (!selected) throw new Error('Add a job description before preparing a match.');
  if (selected.partial && !input.partialDescriptionAccepted) throw new Error('Confirm that you understand this is a partial description.');
  const expiresAt = new Date(Date.now() + MATCH_REQUEST_TTL_MS);
  const existing = await prisma.jobMatchRequest.findFirst({
    where: { userId: input.userId, profileId: input.profileId, jobSnapshotId: input.jobSnapshotId, selectedDescriptionHash: selected.hash, status: 'PREPARED', expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;
  return prisma.jobMatchRequest.create({ data: { userId: input.userId, profileId: input.profileId, jobSnapshotId: input.jobSnapshotId, selectedDescriptionSource: selected.source, selectedDescriptionHash: selected.hash, partialDescriptionAccepted: input.partialDescriptionAccepted, expiresAt } });
}

export async function resolveMatchRequest(userId: string, id: string) {
  const request = await prisma.jobMatchRequest.findFirst({
    where: { id, userId },
    include: { jobSnapshot: { include: { providerReferences: true } } },
  });
  if (!request || request.status !== 'PREPARED' || (request.expiresAt && request.expiresAt <= new Date())) return null;
  const selected = resolveSelectedDescription(request.jobSnapshot);
  if (!selected || selected.source !== request.selectedDescriptionSource || selected.hash !== request.selectedDescriptionHash) return null;
  return { request, selected };
}

export async function consumeMatchRequest(userId: string, id: string) {
  const resolved = await resolveMatchRequest(userId, id);
  if (!resolved) return null;
  await prisma.jobMatchRequest.update({ where: { id }, data: { status: 'CONSUMED', consumedAt: new Date() } });
  return resolved;
}

export { descriptionHash };