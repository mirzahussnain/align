import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import SecuritySettings from '@/features/settings/components/SecuritySettings';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';

export default async function SecuritySettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      emailVerified: true,
      accounts: { select: { providerId: true } },
    },
  });
  if (!user) redirect('/login');

  return (
    <SecuritySettings
      emailVerified={user.emailVerified}
      providers={[...new Set(user.accounts.map((account) => account.providerId))]}
      currentSessionId={session.session.id}
    />
  );
}
