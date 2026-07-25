/** Canonical comparison key for Skills without destroying meaningful punctuation. */
export function normaliseSkillName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-GB');
}

export function cleanSkillDisplayName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}
