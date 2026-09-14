import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma } = vi.hoisted(() => ({
  prisma: {
    jobSnapshot: {
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    jobMatchRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/shared/lib/prisma', () => ({ prisma }));

import {
  attachUserDescription,
  createImportedJobSnapshot,
  createMatchRequest,
  resolveMatchRequest,
} from '@/shared/services/job-snapshot';

const sharedSnapshot = {
  id: 'shared-1',
  importedByUserId: null,
  providerDescription: 'Provider teaser',
  userSuppliedDescription: null,
  descriptionAvailability: 'PARTIAL',
  providerReferences: [],
};

describe('JobSnapshot privacy boundaries', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores a shared-vacancy description override only on the private match request', async () => {
    prisma.jobSnapshot.findUnique.mockResolvedValue(sharedSnapshot);
    prisma.jobMatchRequest.findFirst.mockResolvedValue(null);
    prisma.jobMatchRequest.create.mockResolvedValue({ id: 'request-1' });

    await createMatchRequest({
      userId: 'user-a',
      profileId: 'profile-a',
      jobSnapshotId: 'shared-1',
      partialDescriptionAccepted: true,
      descriptionOverride: 'User A private job description',
    });

    expect(prisma.jobMatchRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-a',
        descriptionText: 'User A private job description',
        selectedDescriptionSource: 'USER_PASTED',
      }),
    });
    expect(prisma.jobSnapshot.update).not.toHaveBeenCalled();
  });

  it('never resolves User A match-request text for User B', async () => {
    prisma.jobMatchRequest.findFirst.mockResolvedValue(null);

    await expect(resolveMatchRequest('user-b', 'request-a')).resolves.toBeNull();
    expect(prisma.jobMatchRequest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-a', userId: 'user-b' }),
    }));
  });

  it('keeps imported vacancies private and owner-scoped', async () => {
    prisma.jobSnapshot.upsert.mockResolvedValue({ id: 'import-1' });

    await createImportedJobSnapshot({
      userId: 'user-a',
      title: 'Private role',
      employerName: 'Private employer',
      description: 'A description supplied by User A.',
    });

    expect(prisma.jobSnapshot.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ importedByUserId: 'user-a' }),
    }));

    prisma.jobSnapshot.findUnique.mockResolvedValue({ ...sharedSnapshot, importedByUserId: 'user-a' });
    await expect(attachUserDescription({
      userId: 'user-b',
      jobSnapshotId: 'import-1',
      description: 'User B text',
    })).resolves.toBeNull();
    expect(prisma.jobSnapshot.update).not.toHaveBeenCalled();
  });
});
