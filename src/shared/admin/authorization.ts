import 'server-only';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/shared/lib/auth';
import { configuredAdminEmails } from './admin-runtime';

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

interface RequireAdminOptions {
  destination: string;
  requestHeaders?: Headers;
}

export function isAdminEmail(
  email: string,
  environment: NodeJS.ProcessEnv = process.env
): boolean {
  return configuredAdminEmails(environment).has(email.trim().toLowerCase());
}

/**
 * The one server-side admin policy boundary. A persisted USER | ADMIN role can
 * replace the allowlist lookup here later without changing admin pages or data.
 */
export async function requireAdminPage({
  destination,
  requestHeaders,
}: RequireAdminOptions): Promise<Session> {
  const session = await auth.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });

  if (!session) {
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  }

  if (!session.user.emailVerified || !isAdminEmail(session.user.email)) {
    redirect('/dashboard');
  }

  return session;
}

/** Re-check authorization at every server data boundary, never only in layout UI. */
export async function requireAdminDataAccess(
  destination = '/admin'
): Promise<Session> {
  return requireAdminPage({ destination });
}
