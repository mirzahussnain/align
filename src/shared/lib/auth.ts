import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { sendLifecycleEmail } from '@/shared/email/resend';
import {
  passwordChangedEmail,
  passwordResetEmail,
  verificationEmail,
} from '@/shared/email/templates/lifecycle';
import { sendWelcomeEmailOnce } from '@/shared/services/welcome-email';

import {
  BETTER_AUTH_RATE_LIMIT_RULES,
  createBetterAuthRateLimitStorage,
} from './better-auth-rate-limit';
import { prisma } from './prisma';

async function bestEffort(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Notification failure must not undo a completed authentication action.
  }
}

async function sendResetOnlyForCredentialAccount({
  user,
  url,
}: {
  user: { id: string; email: string; name: string };
  url: string;
  token: string;
}): Promise<void> {
  const credential = await prisma.account.findFirst({
    where: { userId: user.id, providerId: 'credential' },
    select: { id: true },
  });
  if (!credential) return;
  await sendLifecycleEmail({
    to: user.email,
    template: passwordResetEmail({ name: user.name, url }),
  });
}

export const authOptions = {
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  user: {
    additionalFields: {
      welcomeEmailSentAt: {
        type: 'date',
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendLifecycleEmail({
        to: user.email,
        template: verificationEmail({ name: user.name, url }),
      });
    },
    afterEmailVerification: async (user) => {
      await bestEffort(() => sendWelcomeEmailOnce(user));
    },
  },
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: sendResetOnlyForCredentialAccount,
    onPasswordReset: async ({ user }) => {
      await bestEffort(() =>
        sendLifecycleEmail({
          to: user.email,
          template: passwordChangedEmail({ name: user.name }),
        })
      );
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
  rateLimit: {
    enabled: true,
    customStorage: createBetterAuthRateLimitStorage(),
    customRules: BETTER_AUTH_RATE_LIMIT_RULES,
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const user = ctx.context.newSession?.user ?? ctx.context.session?.user;
      if (!user) return;
      if (ctx.path === '/callback/google') {
        await bestEffort(() => sendWelcomeEmailOnce(user));
      }
      if (ctx.path === '/change-password') {
        await bestEffort(() =>
          sendLifecycleEmail({
            to: user.email,
            template: passwordChangedEmail({ name: user.name }),
          })
        );
      }
    }),
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
