import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/prisma', () => ({ prisma: { user: { findUnique } } }));

import {
  assertEmailVerifiedForCapability,
  EmailVerificationRequiredError,
} from '../email-verification-guard';

describe('email verification capability guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not query identity for deterministic capabilities', async () => {
    await expect(assertEmailVerifiedForCapability('u1', 'ats_analysis')).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects protected work with a stable product error', async () => {
    findUnique.mockResolvedValue({ emailVerified: false });

    await expect(
      assertEmailVerifiedForCapability('u1', 'job_match_analysis')
    ).rejects.toMatchObject({
      code: 'EMAIL_VERIFICATION_REQUIRED',
      statusCode: 403,
    });
  });

  it('rejects a missing user through the same safe error', async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      assertEmailVerifiedForCapability('missing', 'cv_regeneration')
    ).rejects.toBeInstanceOf(EmailVerificationRequiredError);
  });
});
