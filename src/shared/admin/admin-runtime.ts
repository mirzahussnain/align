import 'server-only';

export function configuredAdminEmails(
  environment: NodeJS.ProcessEnv = process.env
): ReadonlySet<string> {
  return new Set(
    (environment.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}
