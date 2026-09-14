import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side guard in addition to the edge proxy: the dashboard must never
  // render for an unauthenticated request.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // New users (email signup or first Google sign-in) land here with no profile
  // yet — funnel them through onboarding until they've been through it once.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardedAt: true },
  });
  if (!user?.onboardedAt) redirect('/onboarding');

  return <>{children}</>;
}
