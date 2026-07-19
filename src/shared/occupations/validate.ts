// Structural validation for occupation profiles. Run over the whole registry
// in tests so an inconsistent rule pack can never ship.

import type { OccupationProfile } from './types';

/** Returns a list of human-readable problems; empty means valid. */
export function validateOccupationProfile(profile: OccupationProfile): string[] {
  const problems: string[] = [];
  const problem = (msg: string) => problems.push(`${profile.id}: ${msg}`);

  if (!profile.version || !/^\d+\.\d+\.\d+$/.test(profile.version)) {
    problem(`version "${profile.version}" is not a semver string`);
  }
  if (!profile.persona.trim()) problem('persona is empty');
  if (!profile.summaryGuidance.trim()) problem('summaryGuidance is empty');
  if (!profile.impactGuidance.trim()) problem('impactGuidance is empty');

  // Section rules: unique sections, constraints reference declared sections.
  const sections = profile.sections.rules.map(r => r.section);
  const dupSections = sections.filter((s, i) => sections.indexOf(s) !== i);
  if (dupSections.length) problem(`duplicate section rules: ${dupSections.join(', ')}`);

  const constraintKeys = new Set<string>();
  for (const c of profile.sections.orderConstraints) {
    if (c.before === c.after) problem(`order constraint "${c.before}" references itself`);
    const key = `${c.before}->${c.after}`;
    if (constraintKeys.has(key)) problem(`duplicate order constraint ${key}`);
    constraintKeys.add(key);
    for (const s of [c.before, c.after]) {
      if (!sections.includes(s)) problem(`order constraint references undeclared section "${s}"`);
    }
    const irrelevant = profile.sections.rules.find(r => r.presence === 'irrelevant');
    if (irrelevant && (c.before === irrelevant.section || c.after === irrelevant.section)) {
      problem(`order constraint ${key} references irrelevant section "${irrelevant.section}"`);
    }
  }

  // Cycle check over unconditional constraints (appliesWhen-gated pairs can
  // legitimately point both ways for different classifications).
  const unconditional = profile.sections.orderConstraints.filter(c => !c.appliesWhen);
  const edges = new Map<string, string[]>();
  for (const c of unconditional) {
    edges.set(c.before, [...(edges.get(c.before) ?? []), c.after]);
  }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const hasCycle = (node: string): boolean => {
    if (done.has(node)) return false;
    if (visiting.has(node)) return true;
    visiting.add(node);
    const cyclic = (edges.get(node) ?? []).some(hasCycle);
    visiting.delete(node);
    done.add(node);
    return cyclic;
  };
  if ([...edges.keys()].some(hasCycle)) problem('order constraints contain a cycle');

  // Credentials: unique ids, valid patterns, mandatory rules only where credentials matter.
  const credIds = profile.credentials.map(c => c.id);
  const dupCreds = credIds.filter((c, i) => credIds.indexOf(c) !== i);
  if (dupCreds.length) problem(`duplicate credential ids: ${dupCreds.join(', ')}`);
  for (const cred of profile.credentials) {
    if (!cred.patterns.length) problem(`credential "${cred.id}" has no patterns`);
    if (!cred.missingMessage.trim()) problem(`credential "${cred.id}" has no missingMessage`);
  }
  if (profile.credentialRelevance === 'critical' && !profile.credentials.some(c => c.class === 'mandatory')) {
    problem('credentialRelevance is critical but no mandatory credential rule exists');
  }
  if (profile.credentialRelevance === 'not_material' && profile.credentials.some(c => c.class === 'mandatory')) {
    problem('credentialRelevance is not_material but a mandatory credential rule exists');
  }

  if (!profile.impactPatterns.length) problem('impactPatterns is empty');
  if (!profile.evidencePriorities.length) problem('evidencePriorities is empty');

  // Prohibited expectations are the anti-contamination mechanism: required for
  // every profile except the tech one whose expectations were the contaminant.
  const prohibited = profile.prohibitedExpectations;
  if (!prohibited.length) problem('prohibitedExpectations is empty');
  const dupProhibited = prohibited.filter((p, i) => prohibited.indexOf(p) !== i);
  if (dupProhibited.length) problem('prohibitedExpectations contains duplicates');

  // Artifact coherence.
  if (profile.secondaryArtifacts.includes(profile.primaryArtifact)) {
    problem('primaryArtifact repeated in secondaryArtifacts');
  }
  if (profile.applicationWorkflow === 'hybrid' && !profile.secondaryArtifacts.length) {
    problem('hybrid workflow must name secondaryArtifacts');
  }

  // Detection: only the generic fallback may be undetectable.
  if (profile.id !== 'generic' && !profile.detection.titlePatterns.length) {
    problem('detection.titlePatterns is empty');
  }

  return problems;
}
