import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import AccountSettings from '@/features/settings/components/AccountSettings';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';

export default async function AccountSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      createdAt: true,
      accounts: { select: { providerId: true } },
    },
  });
  if (!user) redirect('/login');

  return (
    <AccountSettings
      user={{
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        providers: [...new Set(user.accounts.map((account) => account.providerId))],
      }}
    />
  );
}
