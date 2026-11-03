import { extractImpactMetrics, normalizeText } from '@/shared/services/cv-evidence';
import { CvRewritePatchSetSchema } from './rewrite-contract';
import type { ApprovedCvPlan, CandidateEvidenceItem, UnifiedCandidateEvidence } from './types';
import { isPatchableEvidence } from './patchable-evidence';

export type RewriteRejectionReason =
  | 'unapproved_evidence'
  | 'non_patchable_evidence'
  | 'duplicate_patch'
  | 'evidence_mismatch'
  | 'unsupported_metric'
  | 'unsupported_duration'
  | 'unsupported_technology'
  | 'unsupported_employment_type'
  | 'ungrounded_summary_claim';

export interface RejectedRewritePatch {
  evidenceId: string;
  sourceEntityId?: string;
  sourceEntityType?: string;
  path?: string;
  fieldType?: string;
  reason: RewriteRejectionReason;
}

export interface RewriteValidationResult {
  ok: boolean;
  contractValid: boolean;
  reasons: string[];
  patches: Map<string, string>;
  rejected: RejectedRewritePatch[];
}

const DURATION_PATTERN = /\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty)\+?[- ]?(?:years?|months?|weeks?)\b/gi;
const EMPLOYMENT_TYPE_PATTERN = /\b(?:full[- ]time|part[- ]time|fixed[- ]term|contract(?:or)?|freelance|permanent|temporary|internship|apprenticeship|volunteer)\b/gi;
const TECHNOLOGY_PATTERN = /(?<![a-z0-9])(?:aws|azure|gcp|google cloud|kubernetes|docker|react|angular|vue(?:\.js)?|node(?:\.js)?|typescript|javascript|python|java|kotlin|swift|rust|golang|go|c\+\+|c#|\.net|postgres(?:ql)?|mysql|mongodb|redis|kafka|graphql|terraform|ansible|jenkins|gitlab|github actions|snowflake|databricks|pytorch|tensorflow)(?![a-z0-9])/gi;

const SAFE_REPHRASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'the', 'to', 'using', 'with',
  'built', 'created', 'cut', 'delivered', 'developed', 'improved', 'reduced', 'dependable', 'reliable',
]);

function containsWholePhrase(source: string, value: string): boolean {
  const escaped = value.toLocaleLowerCase('en-GB').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(source);
}

function unsupportedMatches(source: string, rewritten: string, pattern: RegExp): string[] {
  return [...rewritten.matchAll(pattern)]
    .map((match) => match[0])
    .filter((value) => !containsWholePhrase(source, value));
}

function normalizedMetric(metric: string): string {
  return metric.toLocaleLowerCase('en-GB').replace(/[\s,]/g, '');
}

function unsupportedWords(source: string, rewritten: string): string[] {
  const sourceWords = new Set(normalizeText(source).split(/\s+/).filter(Boolean));
  const supported = (word: string) => sourceWords.has(word)
    || sourceWords.has(word.replace(/(?:ing|ed|s)$/, ''))
    || [...sourceWords].some((candidate) => candidate.replace(/(?:ing|ed|s)$/, '') === word.replace(/(?:ing|ed|s)$/, ''));
  return normalizeText(rewritten).split(/\s+/)
    .filter((word) => word.length >= 3 && !SAFE_REPHRASE_WORDS.has(word) && !supported(word) && !/^\d/.test(word));
}

function unsupportedProtectedFacts(source: string, rewritten: string): string[] {
  const normalizedSource = source.toLocaleLowerCase('en-GB');
  const protectedTokens = rewritten.match(/(?:https?:\/\/|www\.)\S+|\b\S+@\S+\.\S+\b|\b(?:19|20)\d{2}\b|\b[A-Z][A-Za-z0-9.+#-]{2,}\b/g) ?? [];
  return protectedTokens.filter((token, index) => {
    if (index === 0 && rewritten.startsWith(token)) return false;
    return !normalizedSource.includes(token.toLocaleLowerCase('en-GB'));
  });
}

function diagnostic(item: CandidateEvidenceItem | undefined, evidenceId: string, reason: RewriteRejectionReason): RejectedRewritePatch {
  const sourceRef = item?.sourceRefs[0];
  return {
    evidenceId,
    sourceEntityId: item?.sourceEntityId ?? sourceRef?.entityId,
    sourceEntityType: sourceRef?.entityType,
    path: item?.field ?? sourceRef?.fieldPath,
    fieldType: item?.kind,
    reason,
  };
}

function patchIssues(item: CandidateEvidenceItem | undefined, text: string): RewriteRejectionReason[] {
  if (!item) return ['unapproved_evidence'];
  const source = item.canonicalText;
  const issues: RewriteRejectionReason[] = [];
  const sourceMetrics = new Set(extractImpactMetrics(source).map(normalizedMetric));
  if (extractImpactMetrics(text).some((metric) => !sourceMetrics.has(normalizedMetric(metric)))) issues.push('unsupported_metric');
  if (unsupportedMatches(source, text, DURATION_PATTERN).length) issues.push('unsupported_duration');
  if (unsupportedMatches(source, text, EMPLOYMENT_TYPE_PATTERN).length) issues.push('unsupported_employment_type');
  if (unsupportedMatches(source, text, TECHNOLOGY_PATTERN).length) issues.push('unsupported_technology');
  if (unsupportedProtectedFacts(source, text).length) issues.push('evidence_mismatch');
  if (unsupportedWords(source, text).length) issues.push('evidence_mismatch');
  return [...new Set(issues)];
}

function reasonMessage(evidenceId: string, reason: RewriteRejectionReason): string {
  switch (reason) {
    case 'unapproved_evidence': return `Patch targets unapproved evidence: ${evidenceId}.`;
    case 'non_patchable_evidence': return `Patch targets structural evidence that cannot consume a rewrite: ${evidenceId}.`;
    case 'duplicate_patch': return `Duplicate patch for evidence: ${evidenceId}.`;
    case 'evidence_mismatch': return `Patch introduces unsupported named or dated facts for evidence: ${evidenceId}.`;
    case 'unsupported_metric': return `Patch introduces an unsupported metric for evidence: ${evidenceId}.`;
    case 'unsupported_duration': return `Patch introduces an unsupported duration for evidence: ${evidenceId}.`;
    case 'unsupported_technology': return `Patch introduces an unsupported technology for evidence: ${evidenceId}.`;
    case 'unsupported_employment_type': return `Patch introduces an unsupported employment type for evidence: ${evidenceId}.`;
    case 'ungrounded_summary_claim': return `Summary patch contains an unsupported claim for evidence: ${evidenceId}.`;
  }
}

export function validateRewritePatches(raw: unknown, evidence: UnifiedCandidateEvidence, plan: ApprovedCvPlan): RewriteValidationResult {
  const parsed = CvRewritePatchSetSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, contractValid: false, reasons: ['Patch response does not match the strict contract.'], patches: new Map(), rejected: [] };
  }
  const allowed = new Set([...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]);
  const counts = new Map<string, number>();
  for (const patch of parsed.data.patches) counts.set(patch.evidenceId, (counts.get(patch.evidenceId) ?? 0) + 1);
  const reasons: string[] = [];
  const patches = new Map<string, string>();
  const rejected: RejectedRewritePatch[] = [];
  for (const patch of parsed.data.patches) {
    const item = evidence.evidenceById[patch.evidenceId];
    const issues: RewriteRejectionReason[] = [];
    if (!allowed.has(patch.evidenceId) || !item) issues.push('unapproved_evidence');
    if (item && !isPatchableEvidence(item)) issues.push('non_patchable_evidence');
    if ((counts.get(patch.evidenceId) ?? 0) > 1) issues.push('duplicate_patch');
    const citationMismatch = patch.sourceEvidenceIds.length !== 1 || patch.sourceEvidenceIds[0] !== patch.evidenceId || patch.sourceEvidenceIds.some((id) => !allowed.has(id));
    if (citationMismatch) {
      issues.push('evidence_mismatch');
    }
    issues.push(...patchIssues(item, patch.text));
    const uniqueIssues = [...new Set(issues)];
    if (uniqueIssues.length) {
      const normalizedReason = item?.field === 'summary' ? 'ungrounded_summary_claim' : uniqueIssues[0];
      rejected.push(diagnostic(item, patch.evidenceId, normalizedReason));
      reasons.push(...uniqueIssues.map((reason) => reasonMessage(patch.evidenceId, reason)));
      if (citationMismatch) reasons.push(`Patch does not cite only its own source evidence: ${patch.evidenceId}.`);
      continue;
    }
    patches.set(patch.evidenceId, patch.text.trim());
  }
  return { ok: rejected.length === 0, contractValid: true, reasons, patches, rejected };
}
