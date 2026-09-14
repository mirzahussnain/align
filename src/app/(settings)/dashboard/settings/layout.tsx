import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import SettingsShell from '@/features/settings/components/SettingsShell';
import { auth } from '@/shared/lib/auth';

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return <SettingsShell user={session.user}>{children}</SettingsShell>;
}
