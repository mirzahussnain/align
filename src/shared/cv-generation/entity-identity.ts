import type { EvidenceSourceRef, HitlEvidenceEntityKind } from './types';

export type NormalizableEntityKind = HitlEvidenceEntityKind;

export interface EntityIdentityRepresentation {
  representationId: string;
  kind: NormalizableEntityKind;
  canonicalEntityId?: string;
  sourceEntityId?: string;
  label?: string;
  details: Record<string, unknown>;
  evidenceIds: string[];
  sourceRefs: EvidenceSourceRef[];
}

export interface EntityIdentityAlias {
  type: 'CANONICAL' | 'SOURCE' | 'FINGERPRINT';
  value: string;
}

export interface ResolvedEntityGroup {
  kind: NormalizableEntityKind;
  representations: EntityIdentityRepresentation[];
  aliases: EntityIdentityAlias[];
}

export function normalizeIdentityText(input: unknown): string {
  return String(input ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');
}

const value = (details: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const candidate = normalizeIdentityText(details[key]);
    if (candidate) return candidate;
  }
  return '';
};

function normalizeUrl(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLocaleLowerCase('en-GB');
    url.hostname = url.hostname.toLocaleLowerCase('en-GB');
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizeIdentityText(raw).replace(/\/+$/, '');
  }
}

function identityParts(kind: NormalizableEntityKind, representation: EntityIdentityRepresentation): string[] {
  const details = representation.details;
  switch (kind) {
    case 'EXPERIENCE': return [value(details, 'jobTitle', 'title'), value(details, 'company', 'employer'), value(details, 'startDate')];
    case 'PROJECT': {
      const url = normalizeUrl(details.repositoryUrl) || normalizeUrl(details.liveUrl) || normalizeUrl(details.projectUrl);
      return [url || value(details, 'name', 'projectName') || normalizeIdentityText(representation.label)];
    }
    case 'EDUCATION': return [value(details, 'degree', 'qualification'), value(details, 'university', 'institution')];
    case 'CERTIFICATION': return [value(details, 'name', 'officialName'), value(details, 'issuer', 'issuingBody')];
    case 'TRAINING': return [value(details, 'course'), value(details, 'provider')];
    case 'VOLUNTEERING': return [value(details, 'role'), value(details, 'organisation', 'organization')];
    case 'OPEN_SOURCE': {
      const url = normalizeUrl(details.repositoryUrl) || normalizeUrl(details.projectUrl);
      return [url || value(details, 'projectName', 'name') || normalizeIdentityText(representation.label)];
    }
    case 'OTHER': return [value(details, 'title') || normalizeIdentityText(representation.label), value(details, 'context')];
  }
}

export function primaryEntityIdentityFingerprint(kind: NormalizableEntityKind, representation: EntityIdentityRepresentation): string {
  return identityParts(kind, representation).filter(Boolean).join('|');
}

export function entityIdentityAliases(kind: NormalizableEntityKind, representation: EntityIdentityRepresentation): EntityIdentityAlias[] {
  const aliases: EntityIdentityAlias[] = [];
  if (representation.canonicalEntityId) aliases.push({ type: 'CANONICAL', value: `${kind}:${normalizeIdentityText(representation.canonicalEntityId)}` });
  if (representation.sourceEntityId) aliases.push({ type: 'SOURCE', value: `${kind}:${normalizeIdentityText(representation.sourceEntityId)}` });
  for (const ref of representation.sourceRefs) {
    if (ref.entityId) aliases.push({ type: 'SOURCE', value: `${kind}:${normalizeIdentityText(ref.entityId)}` });
  }
  const fingerprint = primaryEntityIdentityFingerprint(kind, representation);
  if (fingerprint) aliases.push({ type: 'FINGERPRINT', value: `${kind}:${fingerprint}` });
  return [...new Map(aliases.map((alias) => [`${alias.type}:${alias.value}`, alias])).values()];
}

function compatible(left: EntityIdentityRepresentation, right: EntityIdentityRepresentation): boolean {
  if (left.kind !== right.kind) return false;
  const leftParts = identityParts(left.kind, left);
  const rightParts = identityParts(right.kind, right);
  if (left.kind === 'EXPERIENCE') {
    if (!leftParts[0] || !rightParts[0] || !leftParts[2] || !rightParts[2]) return false;
    return leftParts.every((part, index) => !part || !rightParts[index] || part === rightParts[index]);
  }
  return leftParts.filter(Boolean).join('|') === rightParts.filter(Boolean).join('|');
}

function componentsCompatible(left: EntityIdentityRepresentation[], right: EntityIdentityRepresentation[]): boolean {
  return left.every((a) => right.every((b) => {
    if (a.kind !== b.kind) return false;
    const aParts = identityParts(a.kind, a);
    const bParts = identityParts(b.kind, b);
    return aParts.every((part, index) => !part || !bParts[index] || part === bParts[index]);
  }));
}

export function groupEntityRepresentations(representations: EntityIdentityRepresentation[]): ResolvedEntityGroup[] {
  const ordered = [...representations].sort((a, b) => a.representationId.localeCompare(b.representationId));
  const parent = ordered.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const members = (root: number) => ordered.filter((_, index) => find(index) === root);
  const union = (left: number, right: number, force = false) => {
    const a = find(left);
    const b = find(right);
    if (a === b || (!force && !componentsCompatible(members(a), members(b)))) return;
    parent[b] = a;
  };

  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      if (ordered[left].kind !== ordered[right].kind) continue;
      const leftAliases = entityIdentityAliases(ordered[left].kind, ordered[left]);
      const rightKeys = new Set(entityIdentityAliases(ordered[right].kind, ordered[right]).map((alias) => `${alias.type}:${alias.value}`));
      const shared = leftAliases.find((alias) => rightKeys.has(`${alias.type}:${alias.value}`));
      if (shared?.type === 'CANONICAL' || shared?.type === 'SOURCE') union(left, right, true);
      else if (shared?.type === 'FINGERPRINT' || compatible(ordered[left], ordered[right])) union(left, right);
    }
  }

  const grouped = new Map<number, EntityIdentityRepresentation[]>();
  ordered.forEach((representation, index) => {
    const root = find(index);
    grouped.set(root, [...(grouped.get(root) ?? []), representation]);
  });
  return [...grouped.values()].map((group): ResolvedEntityGroup => ({
    kind: group[0].kind,
    representations: group,
    aliases: [...new Map(group.flatMap((item) => entityIdentityAliases(item.kind, item)).map((alias) => [`${alias.type}:${alias.value}`, alias])).values()],
  })).sort((a, b) => stablePresentationEntityId(a).localeCompare(stablePresentationEntityId(b)));
}

export function stablePresentationEntityId(group: ResolvedEntityGroup): string {
  const canonicalIds = group.representations.map(({ canonicalEntityId }) => canonicalEntityId).filter((id): id is string => Boolean(id)).sort();
  if (canonicalIds[0]) return canonicalIds[0];
  const fingerprints = group.representations.map((item) => primaryEntityIdentityFingerprint(group.kind, item)).filter(Boolean).sort();
  if (fingerprints[0]) return `${group.kind.toLocaleLowerCase('en-GB')}:${fingerprints[0]}`;
  const refs = group.aliases.filter(({ type }) => type === 'SOURCE').map(({ value }) => value).sort();
  return refs[0] ?? `${group.kind.toLocaleLowerCase('en-GB')}:unknown`;
}
