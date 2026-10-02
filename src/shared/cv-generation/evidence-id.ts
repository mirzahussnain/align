import { createHash } from 'node:crypto';

export function stableEvidenceId(...parts: Array<string | number | null | undefined>): string {
  const digest = createHash('sha256').update(parts.map((part) => String(part ?? '')).join('\u001f')).digest('hex').slice(0, 24);
  return `ev_${digest}`;
}
