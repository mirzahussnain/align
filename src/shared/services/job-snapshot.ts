import { createHash } from 'node:crypto';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
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
};

/** Durable Job Board boundary. Routes never write JobSnapshot rows directly. */
export async function getOrCreateSnapshotFromNormalisedJob(job: NormalisedJob) {
  const now = new Date();
  const canonicalJobId = job.dedupeFingerprint;
  const existing = await prisma.jobSnapshot.findUnique({ where: { canonicalJobId } });
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
    country: job.country ?? null,
    workStyle: job.remoteType,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.currency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    salaryText: job.salaryText ?? null,
    contractType: job.contractType ?? null,
    employmentType: job.employmentType ?? null,
    providerDescription: job.description ?? null,
    descriptionAvailability: job.descriptionAvailability,
    vacancySponsorshipSignal: json(job.sponsorSignal),
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
      const concurrent = await prisma.jobSnapshot.findUnique({ where: { canonicalJobId } });
      if (!concurrent) throw error;
      snapshot = await prisma.jobSnapshot.update({ where: { id: concurrent.id }, data });
    }
  }

  await Promise.all(job.providerReferences.map((reference) => prisma.jobProviderReference.upsert({
    where: { provider_providerJobId: { provider: reference.provider, providerJobId: reference.sourceJobId } },
    create: { jobSnapshotId: snapshot.id, provider: reference.provider, providerJobId: reference.sourceJobId, providerUrl: reference.sourceUrl, applicationUrl: reference.applicationUrl ?? null, firstSeenAt: now, lastSeenAt: now },
    update: { jobSnapshotId: snapshot.id, providerUrl: reference.sourceUrl, applicationUrl: reference.applicationUrl ?? null, lastSeenAt: now },
  })));
  return getSnapshotDetails(snapshot.id);
}

export async function getSnapshotDetails(jobSnapshotId: string) {
  return prisma.jobSnapshot.findUnique({
    where: { id: jobSnapshotId },
    include: { providerReferences: { orderBy: { firstSeenAt: 'asc' } } },
  });
}

export function resolveSelectedDescription(snapshot: NonNullable<Awaited<ReturnType<typeof getSnapshotDetails>>>): SelectedDescription | null {
  if (snapshot.userSuppliedDescription) return { text: snapshot.userSuppliedDescription, source: 'USER_PASTED', hash: descriptionHash(snapshot.userSuppliedDescription), partial: false };
  if (!snapshot.providerDescription) return null;
  const source = snapshot.descriptionAvailability === 'FULL' ? 'PROVIDER_FULL' : 'PROVIDER_PARTIAL';
  return { text: snapshot.providerDescription, source, hash: descriptionHash(snapshot.providerDescription), partial: source === 'PROVIDER_PARTIAL' };
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