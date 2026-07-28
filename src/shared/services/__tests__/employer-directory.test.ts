import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedEmployerDirectory } from '@/shared/services/employer-directory';
import type { EmployerDirectorySeed } from '@/shared/types/employer-source';

const entry: EmployerDirectorySeed = {
  displayName: 'Acme Holdings Ltd', normalisedName: 'acme holdings', country: 'GB', industry: 'Engineering',
  sources: [{ provider: 'GREENHOUSE', providerIdentifier: 'acme', sourceOrigin: 'CURATED_SEED' }],
};

function client() {
  return {
    companyRecord: { upsert: vi.fn().mockResolvedValue({ id: 'company-1' }) },
    employerJobSource: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({ id: 'source-1' }) },
  };
}

describe('employer directory seed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is idempotent and creates pending, disabled candidates only', async () => {
    const db = client();
    await seedEmployerDirectory([entry], db as never);
    await seedEmployerDirectory([entry], db as never);
    expect(db.companyRecord.upsert).toHaveBeenCalledTimes(2);
    expect(db.employerJobSource.upsert).toHaveBeenCalledTimes(2);
    expect(db.employerJobSource.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ verificationStatus: 'PENDING', enabled: false, sourceOrigin: 'CURATED_SEED' }),
      update: {},
    }));
  });

  it('does not merge an ambiguous source into a different company', async () => {
    const db = client();
    db.employerJobSource.findUnique.mockResolvedValue({ id: 'source-1', companyRecordId: 'other-company' });
    await expect(seedEmployerDirectory([entry], db as never)).rejects.toThrow('already belongs to another company');
    expect(db.employerJobSource.upsert).not.toHaveBeenCalled();
  });

  it('keeps sponsor evidence out of source candidates', async () => {
    const db = client();
    await seedEmployerDirectory([entry], db as never);
    const create = db.employerJobSource.upsert.mock.calls[0][0].create;
    expect(create).not.toHaveProperty('sponsorMatchStatus');
    expect(create).not.toHaveProperty('sponsorEvidence');
  });
});