import { buildEvidenceCorpus, extractImpactMetrics, metricSupported } from '@/shared/services/cv-evidence';
import { CvRewritePatchSetSchema } from './rewrite-contract';
import type { ApprovedCvPlan, UnifiedCandidateEvidence } from './types';

export interface RewriteValidationResult { ok: boolean; reasons: string[]; patches: Map<string, string> }

function unsupportedProtectedFacts(source: string, rewritten: string): string[] {
  const normalizedSource = source.toLocaleLowerCase('en-GB');
  const protectedTokens = rewritten.match(/(?:https?:\/\/|www\.)\S+|\b\S+@\S+\.\S+\b|\b(?:19|20)\d{2}\b|\b[A-Z][A-Za-z0-9.+#-]{2,}\b/g) ?? [];
  return protectedTokens.filter((token, index) => {
    if (index === 0 && rewritten.startsWith(token)) return false;
    return !normalizedSource.includes(token.toLocaleLowerCase('en-GB'));
  });
}

export function validateRewritePatches(raw: unknown, evidence: UnifiedCandidateEvidence, plan: ApprovedCvPlan): RewriteValidationResult {
  const parsed = CvRewritePatchSetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reasons: ['Patch response does not match the strict contract.'], patches: new Map() };
  const allowed = new Set([...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]);
  const seen = new Set<string>();
  const reasons: string[] = [];
  const patches = new Map<string, string>();
  for (const patch of parsed.data.patches) {
    if (!allowed.has(patch.evidenceId)) reasons.push(`Patch targets unapproved evidence: ${patch.evidenceId}.`);
    if (seen.has(patch.evidenceId)) reasons.push(`Duplicate patch for evidence: ${patch.evidenceId}.`);
    seen.add(patch.evidenceId);
    if (patch.sourceEvidenceIds.length !== 1 || patch.sourceEvidenceIds[0] !== patch.evidenceId) reasons.push(`Patch does not cite only its own source evidence: ${patch.evidenceId}.`);
    if (patch.sourceEvidenceIds.some((id) => !allowed.has(id))) reasons.push(`Patch cites evidence outside the approved plan: ${patch.evidenceId}.`);
    const corpus = buildEvidenceCorpus(patch.sourceEvidenceIds.map((id) => evidence.evidenceById[id]?.canonicalText ?? ''));
    for (const metric of extractImpactMetrics(patch.text)) if (!metricSupported(corpus, metric)) reasons.push(`Patch introduces an unsupported metric for evidence: ${patch.evidenceId}.`);
    const source = evidence.evidenceById[patch.evidenceId]?.canonicalText ?? '';
    const unsupported = unsupportedProtectedFacts(source, patch.text);
    if (unsupported.length) reasons.push(`Patch introduces unsupported named or dated facts for evidence ${patch.evidenceId}: ${unsupported.join(', ')}.`);
    patches.set(patch.evidenceId, patch.text.trim());
  }
  return { ok: reasons.length === 0, reasons, patches };
}
