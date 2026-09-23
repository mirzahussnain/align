import type { Metadata } from 'next';
import AdminShell from '@/features/admin/components/AdminShell';
import { requireAdminPage } from '@/shared/admin/authorization';

export const metadata: Metadata = {
  title: 'Admin — Align',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminPage({ destination: '/admin' });

  return (
    <AdminShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </AdminShell>
  );
}
