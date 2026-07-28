import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { prisma } from '@/shared/lib/prisma';
export default async function JobBoardLayout({ children }: { children: React.ReactNode }) { const session = await auth.api.getSession({ headers: await headers() }); if (!session) redirect('/login'); const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { onboardedAt: true } }); if (!user?.onboardedAt) redirect('/onboarding'); return children; }
