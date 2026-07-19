import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthForm from '@/features/auth/components/AuthForm';

export const metadata: Metadata = {
  title: 'Sign in — Align',
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
