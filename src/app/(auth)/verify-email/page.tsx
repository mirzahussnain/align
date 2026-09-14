import type { Metadata } from 'next';

import { VerificationResult } from '@/features/auth/components/LifecycleForms';

export const metadata: Metadata = { title: 'Verify email — Align' };

export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const params = await searchParams;
  return <VerificationResult error={typeof params.error === 'string' ? params.error : undefined} />;
}
