import type { CvEvidenceBinding, CvPresentationIdentity, CvPresentationLink } from './build-spec-types';
import { normalizeIdentityText } from './entity-identity';
import { selectAuthoritativeField, type StructuralFieldCandidate } from './presentation-authority';
import type { NormalizationInput } from './presentation-normalization';
import type { ProfessionalLink } from './types';

export interface ProjectLinkResult {
  links: CvPresentationLink[];
  projectLinks: Map<string, CvPresentationLink[]>;
  bindings: CvEvidenceBinding[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeProfessionalUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.protocol = url.protocol.toLocaleLowerCase('en-GB');
    url.hostname = url.hostname.toLocaleLowerCase('en-GB');
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function contactValue(url: string, type: 'EMAIL' | 'PHONE'): string {
  const withoutScheme = url.replace(type === 'EMAIL' ? /^mailto:/i : /^tel:/i, '').trim();
  return type === 'EMAIL' ? normalizeIdentityText(withoutScheme) : withoutScheme.replace(/[^+\d]/g, '');
}

function fieldCandidates(input: NormalizationInput, key: string): StructuralFieldCandidate<string>[] {
  const candidates: StructuralFieldCandidate<string>[] = [];
  for (const evidenceId of [...input.selectedEvidenceIds].sort()) {
    const item = input.evidence.evidenceById[evidenceId];
    if (!item) continue;
    const data = record(item.canonicalData);
    const value = data?.[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    candidates.push({
      value: value.trim(), representationId: evidenceId, sourceType: item.provenance,
      snapshotId: item.sourceRefs[0]?.snapshotId, canonicalEntityId: item.sourceEntityId,
      supportKeys: [evidenceId],
    });
  }
  return candidates;
}

export function normalizePresentationIdentity(input: NormalizationInput): { identity: CvPresentationIdentity; bindings: CvEvidenceBinding[] } {
  const bindings: CvEvidenceBinding[] = [];
  const choose = (key: 'fullName' | 'headline' | 'email' | 'phone' | 'location', fallback: string | undefined, fallbackIds: string[]) => {
    const candidates = fieldCandidates(input, key);
    if (candidates.length === 0 && fallback?.trim()) {
      for (const evidenceId of fallbackIds.filter((id) => input.selectedEvidenceIds.has(id))) {
        const item = input.evidence.evidenceById[evidenceId];
        if (!item) continue;
        candidates.push({ value: fallback.trim(), representationId: evidenceId, sourceType: item.provenance, snapshotId: item.sourceRefs[0]?.snapshotId, canonicalEntityId: item.sourceEntityId, supportKeys: [evidenceId] });
      }
    }
    const selected = selectAuthoritativeField(candidates, input.authorityContext);
    if (!selected) return undefined;
    const normalize = key === 'phone' ? (value: string) => value.replace(/[^+\d]/g, '') : normalizeIdentityText;
    const evidenceIds = candidates.filter((candidate) => normalize(candidate.value) === normalize(selected)).flatMap(({ supportKeys }) => supportKeys);
    if (key === 'email' || key === 'phone') {
      for (const link of input.evidence.professionalLinks) {
        if ((link.type === 'EMAIL' || link.type === 'PHONE') && link.type === key.toLocaleUpperCase('en-GB') && input.selectedEvidenceIds.has(link.evidenceId) && contactValue(link.url, link.type) === normalize(selected)) evidenceIds.push(link.evidenceId);
      }
    }
    bindings.push({ nodeId: `identity:${key}`, evidenceIds: [...new Set(evidenceIds)].sort() });
    return selected;
  };
  const identityIds = input.evidence.identity.evidenceIds ?? [];
  const contactIds = input.evidence.contact.evidenceIds ?? [];
  return {
    identity: {
      fullName: choose('fullName', input.evidence.identity.fullName, identityIds) ?? '',
      headline: choose('headline', input.evidence.identity.headline, identityIds),
      email: choose('email', input.evidence.contact.email, contactIds),
      phone: choose('phone', input.evidence.contact.phone, contactIds),
      location: choose('location', input.evidence.contact.location, contactIds),
    },
    bindings,
  };
}

export function normalizeProjectLinks(
  links: ProfessionalLink[],
  entityAliasIndex: Map<string, string>,
  selectedIds: Set<string>
): ProjectLinkResult {
  const grouped = new Map<string, ProfessionalLink[]>();
  for (const link of links) {
    if (!selectedIds.has(link.evidenceId) || link.type === 'EMAIL' || link.type === 'PHONE') continue;
    const normalizedUrl = normalizeProfessionalUrl(link.url);
    if (!normalizedUrl) continue;
    const family = link.type === 'PORTFOLIO' || link.type === 'PERSONAL_WEBSITE' ? 'WEBSITE' : link.type;
    const projectId = link.projectId ? entityAliasIndex.get(link.projectId) ?? link.projectId : '';
    const key = `${projectId}|${family}|${normalizedUrl}`;
    grouped.set(key, [...(grouped.get(key) ?? []), link]);
  }
  const result: ProjectLinkResult = { links: [], projectLinks: new Map(), bindings: [] };
  for (const duplicates of [...grouped.values()]) {
    const representative = [...duplicates].sort((left, right) => left.id.localeCompare(right.id))[0];
    const normalizedUrl = normalizeProfessionalUrl(representative.url)!;
    const link: CvPresentationLink = { id: representative.id, label: representative.label, url: normalizedUrl, type: representative.type };
    const projectId = representative.projectId ? entityAliasIndex.get(representative.projectId) ?? representative.projectId : undefined;
    if (projectId) result.projectLinks.set(projectId, [...(result.projectLinks.get(projectId) ?? []), link]);
    else result.links.push(link);
    result.bindings.push({ nodeId: `link:${representative.id}`, evidenceIds: duplicates.map(({ evidenceId }) => evidenceId).sort() });
  }
  const compare = (left: CvPresentationLink, right: CvPresentationLink) => left.type.localeCompare(right.type) || left.url.localeCompare(right.url) || left.id.localeCompare(right.id);
  result.links.sort(compare);
  for (const projectLinks of result.projectLinks.values()) projectLinks.sort(compare);
  result.bindings.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  return result;
}
