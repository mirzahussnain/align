import { prisma } from '@/shared/lib/prisma';
import { requiresVerifiedEmail } from '@/shared/policies';
import type { ProductCapability } from '@/shared/entitlements/registry';
import { APIError } from '@/shared/utils/api-error';

export class EmailVerificationRequiredError extends APIError {
  constructor() {
    super(
      'Verify your email before using this feature.',
      403,
      undefined,
      'EMAIL_VERIFICATION_REQUIRED'
    );
    this.name = 'EmailVerificationRequiredError';
  }
}

export async function assertEmailVerifiedForCapability(
  userId: string,
  capability: ProductCapability
): Promise<void> {
  if (!requiresVerifiedEmail(capability)) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (!user?.emailVerified) throw new EmailVerificationRequiredError();
}
