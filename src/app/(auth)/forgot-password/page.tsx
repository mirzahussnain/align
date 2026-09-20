import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/features/auth/components/LifecycleForms';

export const metadata: Metadata = { title: 'Reset password — Align' };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
