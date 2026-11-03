import { tokenCoverage } from './requirements';
import type {
  CandidateEvidenceItem,
  GenerationRequirement,
  RequirementReconciliationSnapshot,
  UnifiedCandidateEvidence,
} from './types';

function strongestMatch(requirement: GenerationRequirement, evidence: CandidateEvidenceItem[]) {
  const explicit = evidence.filter((item) => item.requirementIds.includes(requirement.id));
  if (explicit.length) return { items: explicit, coverage: 1, explicit: true };
  const scored = evidence
    .map((item) => ({ item, coverage: tokenCoverage(requirement.text, item.canonicalText) }))
    .filter((match) => match.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage);
  const best = scored[0]?.coverage ?? 0;
  return { items: scored.filter((match) => match.coverage === best).map((match) => match.item), coverage: best, explicit: false };
}

export function reconcileRequirements(
  requirements: GenerationRequirement[],
  evidence: UnifiedCandidateEvidence,
  confirmedMissing = new Set<string>(),
  confirmedSupported = new Set<string>()
): RequirementReconciliationSnapshot {
  const allEvidence = Object.values(evidence.evidenceById);
  const conflictedIds = new Set(evidence.conflicts.flatMap((conflict) => conflict.evidenceIds));
  return {
    schemaVersion: 1,
    items: requirements.map((requirement) => {
      if (!requirement.evidenceRequired) {
        return { requirementId: requirement.id, status: 'NOT_APPLICABLE' as const, evidenceIds: [], confidence: 1, reason: 'This requirement does not require candidate evidence.' };
      }
      if (confirmedSupported.has(requirement.id)) {
        return { requirementId: requirement.id, status: 'CONFIRMED' as const, evidenceIds: [], confidence: 1, reason: 'The candidate confirmed they can meet this eligibility or availability requirement.' };
      }
      if (confirmedMissing.has(requirement.id)) {
        return { requirementId: requirement.id, status: 'CONFIRMED_MISSING' as const, evidenceIds: [], confidence: 1, reason: 'The candidate confirmed this evidence is not available for this generation.' };
      }
      const match = strongestMatch(requirement, allEvidence);
      const evidenceIds = match.items.map((item) => item.id);
      if (evidenceIds.some((id) => conflictedIds.has(id))) {
        return { requirementId: requirement.id, status: 'CONFLICTED' as const, evidenceIds, confidence: Math.max(0.5, match.coverage), reason: 'Potentially relevant authoritative evidence conflicts and requires review.' };
      }
      const contextual = match.items.some((item) => item.kind !== 'SKILL' || Boolean((item.canonicalData as { activity?: unknown; outcome?: unknown } | undefined)?.activity || (item.canonicalData as { outcome?: unknown } | undefined)?.outcome));
      if (match.explicit || (match.coverage >= 0.6 && contextual)) {
        return { requirementId: requirement.id, status: 'SUPPORTED' as const, evidenceIds, confidence: match.explicit ? 1 : match.coverage, reason: 'Authoritative contextual evidence supports this requirement.' };
      }
      if (match.coverage >= 0.25) {
        return { requirementId: requirement.id, status: 'PARTIAL' as const, evidenceIds, confidence: match.coverage, reason: contextual ? 'Related evidence exists but does not fully establish the requirement.' : 'A related skill exists without enough contextual evidence of use.' };
      }
      return { requirementId: requirement.id, status: 'MISSING' as const, evidenceIds: [], confidence: 0, reason: 'No authoritative evidence found.' };
    }),
  };
}

export function unresolvedRequirements(snapshot: RequirementReconciliationSnapshot) {
  return snapshot.items.filter((item) => item.status === 'MISSING' || item.status === 'PARTIAL' || item.status === 'CONFLICTED');
}
