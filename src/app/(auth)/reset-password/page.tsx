import type { Metadata } from 'next';

import { ResetPasswordForm } from '@/features/auth/components/LifecycleForms';

export const metadata: Metadata = { title: 'Choose a new password — Align' };

export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const params = await searchParams;
  const token = typeof params.token === 'string' ? params.token : null;
  return <ResetPasswordForm token={token} invalid={Boolean(params.error)} />;
}
