export type JobUrlRejectionReason =
  | 'MISSING_URL'
  | 'MALFORMED_URL'
  | 'NON_HTTPS_URL'
  | 'UNEXPECTED_HOST'
  | 'INVALID_HOSTED_JOB_URL'
  | 'INVALID_APPLICATION_URL'
  | 'EMPLOYER_HOST_MISMATCH';

export type JobUrlValidation =
  | { valid: true; url: string }
  | { valid: false; reason: JobUrlRejectionReason };

const normaliseHost = (host: string) => host.toLowerCase().replace(/^www\./, '');

export function validateHostedJobUrl(value: unknown, allowedHosts: readonly string[], identifier: string): JobUrlValidation {
  if (typeof value !== 'string' || !value.trim()) return { valid: false, reason: 'MISSING_URL' };
  let url: URL;
  try { url = new URL(value); } catch { return { valid: false, reason: 'MALFORMED_URL' }; }
  if (url.protocol !== 'https:') return { valid: false, reason: 'NON_HTTPS_URL' };
  if (!allowedHosts.includes(url.hostname.toLowerCase())) return { valid: false, reason: 'UNEXPECTED_HOST' };
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || parts[0].toLowerCase() !== identifier.toLowerCase()) {
    return { valid: false, reason: 'INVALID_HOSTED_JOB_URL' };
  }
  return { valid: true, url: url.toString() };
}

/** Exact host comparison, with only the harmless www. spelling treated as equivalent. */
export function matchesVerifiedEmployerHost(value: URL, evidence: readonly (string | null | undefined)[]): boolean {
  return evidence.some((candidate) => {
    if (!candidate) return false;
    try { return normaliseHost(new URL(candidate).hostname) === normaliseHost(value.hostname); } catch { return false; }
  });
}

export function validateOptionalApplicationUrl(value: unknown, options: {
  providerHosts: readonly string[];
  identifier: string;
  employerEvidence: readonly (string | null | undefined)[];
}): JobUrlValidation | { valid: true; url: undefined } {
  if (value === undefined || value === null || value === '') return { valid: true, url: undefined };
  if (typeof value !== 'string') return { valid: false, reason: 'INVALID_APPLICATION_URL' };
  let url: URL;
  try { url = new URL(value); } catch { return { valid: false, reason: 'MALFORMED_URL' }; }
  if (url.protocol !== 'https:') return { valid: false, reason: 'NON_HTTPS_URL' };
  if (options.providerHosts.includes(url.hostname.toLowerCase())) {
    return validateHostedJobUrl(value, options.providerHosts, options.identifier);
  }
  return matchesVerifiedEmployerHost(url, options.employerEvidence)
    ? { valid: true, url: url.toString() }
    : { valid: false, reason: 'EMPLOYER_HOST_MISMATCH' };
}

export function addUrlRejection(target: Record<string, number>, reason: JobUrlRejectionReason): void {
  target[reason] = (target[reason] ?? 0) + 1;
}