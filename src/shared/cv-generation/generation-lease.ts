import 'server-only';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/shared/lib/prisma';

export const GENERATION_LEASE_MS = 2 * 60 * 1_000;

interface GenerationRow {
  id: string;
  userId: string;
  operationId: string;
  status: string;
  generationLeaseToken: string | null;
  generationLeaseExpiresAt: Date | null;
  generationAttemptCount: number;
  validatedAiCheckpoint: unknown;
}

interface GenerationDb {
  cvGeneration: {
    findFirst(args: unknown): Promise<GenerationRow | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface GenerationLeaseOptions {
  newToken?: () => string;
}

export function createGenerationLeaseRepository(
  db: GenerationDb,
  options: GenerationLeaseOptions = {},
) {
  const newToken = options.newToken ?? randomUUID;

  async function claimGeneration(input: {
    userId: string;
    generationId: string;
    now: Date;
  }) {
    const row = await db.cvGeneration.findFirst({
      where: { id: input.generationId, userId: input.userId },
    });
    if (!row) return { status: 'not_found' as const };
    if (row.status === 'COMPLETED') {
      return { status: 'completed' as const, operationId: row.operationId };
    }
    if (
      row.status === 'GENERATING' &&
      row.generationLeaseExpiresAt &&
      row.generationLeaseExpiresAt.getTime() > input.now.getTime()
    ) {
      return { status: 'in_progress' as const, operationId: row.operationId };
    }
    if (
      row.status !== 'PLAN_APPROVED' &&
      row.status !== 'GENERATING' &&
      row.status !== 'GENERATION_FAILED'
    ) {
      return { status: 'not_claimable' as const, operationId: row.operationId };
    }

    const token = newToken();
    const leaseExpiresAt = new Date(input.now.getTime() + GENERATION_LEASE_MS);
    const claimed = await db.cvGeneration.updateMany({
      where: {
        id: row.id,
        userId: input.userId,
        status: row.status,
        generationLeaseToken: row.generationLeaseToken,
        generationLeaseExpiresAt: row.generationLeaseExpiresAt,
      },
      data: {
        status: 'GENERATING',
        failureCode: null,
        generationLeaseToken: token,
        generationLeaseExpiresAt: leaseExpiresAt,
        generationAttemptCount: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return { status: 'in_progress' as const, operationId: row.operationId };
    }
    return {
      status: 'claimed' as const,
      token,
      operationId: row.operationId,
      checkpoint: row.validatedAiCheckpoint,
      leaseExpiresAt,
    };
  }

  async function checkpointAiResult(input: {
    userId: string;
    generationId: string;
    token: string;
    checkpoint: unknown;
  }) {
    const result = await db.cvGeneration.updateMany({
      where: {
        id: input.generationId,
        userId: input.userId,
        status: 'GENERATING',
        generationLeaseToken: input.token,
      },
      data: { validatedAiCheckpoint: input.checkpoint },
    });
    return result.count === 1;
  }

  async function renewGenerationLease(input: {
    userId: string;
    generationId: string;
    token: string;
    now: Date;
  }) {
    const result = await db.cvGeneration.updateMany({
      where: {
        id: input.generationId,
        userId: input.userId,
        status: 'GENERATING',
        generationLeaseToken: input.token,
        generationLeaseExpiresAt: { gt: input.now },
      },
      data: {
        generationLeaseExpiresAt: new Date(input.now.getTime() + GENERATION_LEASE_MS),
      },
    });
    return result.count === 1;
  }

  async function canPublishGeneration(input: {
    userId: string;
    generationId: string;
    token: string;
    now: Date;
  }) {
    const row = await db.cvGeneration.findFirst({
      where: {
        id: input.generationId,
        userId: input.userId,
        status: 'GENERATING',
        generationLeaseToken: input.token,
        generationLeaseExpiresAt: { gt: input.now },
      },
    });
    return Boolean(
      row &&
        row.status === 'GENERATING' &&
        row.generationLeaseToken === input.token &&
        row.generationLeaseExpiresAt &&
        row.generationLeaseExpiresAt.getTime() > input.now.getTime(),
    );
  }

  return {
    claimGeneration,
    checkpointAiResult,
    renewGenerationLease,
    canPublishGeneration,
  };
}

const repository = createGenerationLeaseRepository(prisma as unknown as GenerationDb);
export const claimGeneration = repository.claimGeneration;
export const checkpointAiResult = repository.checkpointAiResult;
export const renewGenerationLease = repository.renewGenerationLease;
export const canPublishGeneration = repository.canPublishGeneration;
