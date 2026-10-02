const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'to', 'of', 'for', 'with', 'using', 'use', 'professional', 'experience',
  'experienced', 'knowledge', 'ability', 'required', 'desirable', 'must', 'should', 'in', 'on', 'or', 'your',
]);

const singular = (token: string) => {
  if (token === 'apis') return 'api';
  if (token === 'databases') return 'database';
  if (token === 'integrations') return 'integration';
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
};

export function semanticTokens(value: string): Set<string> {
  const tokens = value.toLocaleLowerCase('en-GB').replace(/[/_-]+/g, ' ').match(/[a-z0-9+#.]+/g) ?? [];
  return new Set(tokens.map(singular).filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

export function tokenCoverage(requirement: string, evidence: string): number {
  const required = semanticTokens(requirement);
  const available = semanticTokens(evidence);
  if (!required.size) return 0;
  let overlap = 0;
  for (const token of required) if (available.has(token)) overlap += 1;
  return overlap / required.size;
}

export function semanticFamily(value: string): string | null {
  const tokens = semanticTokens(value);
  if (['api', 'rest', 'integration'].some((token) => tokens.has(token))) return 'api-development-integration';
  if (['database', 'sql', 'postgresql', 'mysql', 'mongodb'].some((token) => tokens.has(token))) return 'database-development';
  if (['cloud', 'aws', 'azure', 'gcp', 'deployment'].some((token) => tokens.has(token))) return 'cloud-deployment';
  if (tokens.has('c#') || tokens.has('.net') || tokens.has('dotnet')) return 'csharp-dotnet';
  return null;
}
