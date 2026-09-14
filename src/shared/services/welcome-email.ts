import 'server-only';

import { sendLifecycleEmail } from '@/shared/email/resend';
import { welcomeEmail } from '@/shared/email/templates/lifecycle';
import { prisma } from '@/shared/lib/prisma';

export interface WelcomeEmailUser {
  id: string;
  email: string;
  name: string;
}

function workspaceUrl(): string {
  const origin = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return new URL('/dashboard', origin).toString();
}

export async function sendWelcomeEmailOnce(
  user: WelcomeEmailUser
): Promise<'sent' | 'already_sent'> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      user.id,
      'welcome-email'
    );

    const state = await tx.user.findUnique({
      where: { id: user.id },
      select: { welcomeEmailSentAt: true },
    });
    if (state?.welcomeEmailSentAt) return 'already_sent';

    await sendLifecycleEmail({
      to: user.email,
      template: welcomeEmail({ name: user.name, url: workspaceUrl() }),
      idempotencyKey: `welcome/${user.id}`,
    });
    await tx.user.update({
      where: { id: user.id },
      data: { welcomeEmailSentAt: new Date() },
    });
    return 'sent';
  });
}
