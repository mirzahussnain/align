import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthForm from '@/features/auth/components/AuthForm';

export const metadata: Metadata = {
  title: 'Create account — Align',
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
