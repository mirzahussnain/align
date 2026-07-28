import { randomUUID } from 'node:crypto';
import type { NormalisedJob } from '@/shared/types/job';

export interface JobMatchHandoff { token: string; userId: string; profileId: string; job: NormalisedJob; createdAt: number; expiresAt: number; }
const TTL_MS = 30 * 60_000;
const handoffs = new Map<string, JobMatchHandoff>();
export function createJobMatchHandoff(input: Omit<JobMatchHandoff, 'token' | 'createdAt' | 'expiresAt'>) {
  const now = Date.now(); for (const [token, handoff] of handoffs) if (handoff.expiresAt <= now) handoffs.delete(token);
  const handoff: JobMatchHandoff = { ...input, token: randomUUID(), createdAt: now, expiresAt: now + TTL_MS };
  handoffs.set(handoff.token, handoff); return handoff;
}
export function resolveJobMatchHandoff(token: string | undefined, userId: string) {
  if (!token) return null; const handoff = handoffs.get(token); if (!handoff || handoff.userId !== userId || handoff.expiresAt <= Date.now()) return null; return handoff;
}