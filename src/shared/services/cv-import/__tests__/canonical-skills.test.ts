import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
import { CvImportEntityType } from '@/generated/prisma/client';
import { createCanonicalRecord } from '../canonical';

function transaction(existing: { id: string; skillGroupId: string | null }) {
  const upsert = vi.fn().mockResolvedValue(existing);
  const updateMany = vi.fn().mockResolvedValue({ count: existing.skillGroupId ? 0 : 1 });
  const tx = {
    skillGroup: {
      findFirst: vi.fn().mockResolvedValue({ id: 'group-imported' }),
      create: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    skill: {
      count: vi.fn().mockResolvedValue(1),
      upsert,
      updateMany,
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, upsert, updateMany };
}

describe('canonical skill persistence', () => {
  it('upserts by profile and normalized name so stale imports remain idempotent', async () => {
    const fake = transaction({ id: 'skill-existing', skillGroupId: 'group-canonical' });
    const result = await createCanonicalRecord({
      tx: fake.tx,
      userId: 'user-1',
      profileId: 'profile-1',
      entityType: CvImportEntityType.SKILL,
      payload: { name: ' TypeScript ', category: 'Additional Skills' },
    });

    expect(result).toEqual({ entityType: 'skill', entityId: 'skill-existing' });
    expect(fake.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_normalizedName: { profileId: 'profile-1', normalizedName: 'typescript' } },
      update: {},
    }));
    expect(fake.updateMany).not.toHaveBeenCalled();
  });

  it('adds a resolved category only when the existing canonical skill is ungrouped', async () => {
    const fake = transaction({ id: 'skill-project-created', skillGroupId: null });
    await createCanonicalRecord({
      tx: fake.tx,
      userId: 'user-1',
      profileId: 'profile-1',
      entityType: CvImportEntityType.SKILL,
      payload: { name: 'TypeScript', category: 'Languages' },
    });

    expect(fake.updateMany).toHaveBeenCalledWith({
      where: { id: 'skill-project-created', skillGroupId: null },
      data: { skillGroupId: 'group-imported' },
    });
  });

  it('upserts project technologies by canonical identity', async () => {
    const skillUpsert = vi.fn().mockResolvedValue({ id: 'skill-typescript' });
    const tx = {
      skill: {
        count: vi.fn().mockResolvedValue(0),
        upsert: skillUpsert,
      },
      projectEntry: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockResolvedValue({ id: 'project-1' }),
      },
    } as unknown as Prisma.TransactionClient;

    await createCanonicalRecord({
      tx,
      userId: 'user-1',
      profileId: 'profile-1',
      entityType: CvImportEntityType.PROJECT,
      payload: {
        name: 'Compiler',
        technologies: [' TypeScript ', 'typescript'],
        achievements: [],
      },
    });

    expect(skillUpsert).toHaveBeenCalledTimes(1);
    expect(skillUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { profileId_normalizedName: { profileId: 'profile-1', normalizedName: 'typescript' } },
      update: {},
    }));
  });
});
