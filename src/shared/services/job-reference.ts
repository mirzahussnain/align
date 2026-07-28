import { randomUUID } from 'node:crypto';
import type { NormalisedJob } from '@/shared/types/job';

/** Short-lived, server-owned references keep provider payloads out of URLs. */
type JobReference = { job: NormalisedJob; userId: string | null; expiresAt: number };
const TTL_MS = 30 * 60_000;
const references = new Map<string, JobReference>();

function sweep() {
  const now = Date.now();
  for (const [key, value] of references) if (value.expiresAt <= now) references.delete(key);
}

export function createJobReference(job: NormalisedJob, userId: string | null) {
  sweep();
  const reference = randomUUID();
  references.set(reference, { job, userId, expiresAt: Date.now() + TTL_MS });
  return reference;
}

export function resolveJobReference(reference: string | undefined, userId: string | null) {
  sweep();
  const value = reference ? references.get(reference) : null;
  if (!value || (value.userId && value.userId !== userId)) return null;
  return value.job;
}
