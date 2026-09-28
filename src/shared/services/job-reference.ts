import { prisma } from '@/shared/lib/prisma';
import type { CacheStore } from '@/shared/lib/cache/cache-store';
import { resolveBufferedJob } from '@/shared/services/job-search-session';
import type { NormalisedJob } from '@/shared/types/job';
import { APIError } from '@/shared/utils/api-error';

export type JobReferenceResolution =
  | { kind: 'persisted'; jobSnapshotId: string }
  | { kind: 'ephemeral'; job: NormalisedJob };

export type JobReferenceInput = {
  canonicalJobId: string;
  jobSnapshotId?: string;
  sessionId?: string;
  userId: string | null;
};

const expired = () => new APIError(
  'This search result has expired. Run a fresh search to continue.',
  410,
  undefined,
  'EPHEMERAL_JOB_EXPIRED',
  true,
);

const unstable = () => new APIError(
  'This listing does not expose a stable provider identity, so it cannot be saved or matched.',
  409,
  undefined,
  'JOB_IDENTITY_UNSTABLE',
  false,
);

async function findVisibleSnapshot(
  input: { id?: string; canonicalJobId?: string; userId: string | null },
): Promise<{ id: string } | null> {
  const identity = input.id
    ? { id: input.id }
    : { canonicalJobId: input.canonicalJobId! };
  return prisma.jobSnapshot.findFirst({
    where: input.userId
      ? { ...identity, OR: [{ importedByUserId: null }, { importedByUserId: input.userId }] }
      : { ...identity, importedByUserId: null },
    select: { id: true },
  });
}

/** Read-only resolution for details and other non-durable consumers. */
export async function resolveJobReference(
  store: CacheStore,
  input: JobReferenceInput,
): Promise<JobReferenceResolution> {
  if (input.jobSnapshotId) {
    const explicit = await findVisibleSnapshot({ id: input.jobSnapshotId, userId: input.userId });
    if (explicit) return { kind: 'persisted', jobSnapshotId: explicit.id };
  }

  if (input.sessionId) {
    const buffered = await resolveBufferedJob<NormalisedJob>(store, {
      sessionId: input.sessionId,
      canonicalJobId: input.canonicalJobId,
      userId: input.userId,
    });
    if (buffered.outcome === 'REJECTED') throw expired();
    if (buffered.outcome === 'FOUND') return { kind: 'ephemeral', job: buffered.job };
  }

  const existing = await findVisibleSnapshot({
    canonicalJobId: input.canonicalJobId,
    userId: input.userId,
  });
  if (existing) return { kind: 'persisted', jobSnapshotId: existing.id };
  throw expired();
}

/** Resolution for Save/Match/description workflows, which require durable identity. */
export async function resolveDurableJobReference(
  store: CacheStore,
  input: JobReferenceInput,
): Promise<JobReferenceResolution> {
  const resolution = await resolveJobReference(store, input);
  if (resolution.kind === 'persisted') return resolution;
  if (resolution.job.providerReferences.some((reference) => reference.identityStability === 'STABLE')) {
    return resolution;
  }
  const equivalent = await findVisibleSnapshot({
    canonicalJobId: resolution.job.dedupeFingerprint,
    userId: input.userId,
  });
  if (equivalent) return { kind: 'persisted', jobSnapshotId: equivalent.id };
  throw unstable();
}
