import type { AdminProviderAttempts } from './metrics';

export function providerLabel(provider: string): string {
  return provider
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatProviderBreakdown(providers: AdminProviderAttempts[]): string {
  if (providers.length === 0) return 'No provider attempts';
  const number = new Intl.NumberFormat('en-GB');
  return providers
    .map(({ provider, attempts }) => `${providerLabel(provider)} ${number.format(attempts)}`)
    .join(' · ');
}
