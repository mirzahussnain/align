/**
 * Claim-aware provenance classification and deterministic salvage.
 *
 * The all-or-nothing gate in {@link validateStructuredRewriteProvenance} answers
 * one question — "is EVERY reference valid?" — and discards the whole draft (and
 * the provider call that produced it) the moment one is not. That is correct for
 * truthfulness but wasteful for a draft whose only defect is a repairable,
 * optional, provenance-level problem (the classic case: a skills group whose
 * single `source_cv` excerpt does not contiguously match the CV even though every
 * listed skill is genuinely present).
 *
 * This module adds the missing middle. It:
 *   1. classifies each generated claim's references, partitioning defects into
 *      `repairable` and `terminal`;
 *   2. deterministically salvages the repairable ones WITHOUT weakening any
 *      truthfulness rule — it removes only unsupported OPTIONAL claims, prunes
 *      invalid references only when valid ones remain, and re-derives per-skill
 *      provenance for retained skills by checking each skill against the SAME
 *      supplied-evidence standard the validator uses;
 *   3. re-runs the full provenance validator over the repaired draft and rejects
 *      unless it now passes cleanly.
 *
 * It never remaps an invalid id by label similarity and never infers evidence
 * from wording — a skill survives only if it independently, literally appears in
 * supplied evidence. A terminal defect (an unsupported employer, role, degree,
 * certification, or identity field) always rejects the whole draft.
 */
import { CV_GENERATION_REPAIR_POLICY } from '@/shared/lib/config';
import { normalizeText } from './cv-evidence';
import {
  dedupeRefs,
  sourceRefKey,
  validateRef,
  validateStructuredRewriteProvenance,
  structuredRewriteShapeIssue,
} from './cv-rewrite-structured';
import type {
  LedgerNativeRewriteInput,
  ProvenancedSkillGroup,
  ProvenancedSkillItem,
  RewriteSourceRef,
  StructuredCvRewriteOutput,
} from '@/shared/types/cv-rewrite';

export type ClaimType =
  | 'summary'
  | 'skill'
  | 'experience_bullet'
  | 'project_bullet'
  | 'education'
  | 'certification'
  | 'metric'
  | 'technology'
  | 'other';

export type ProvenanceDefectReason =
  | 'unknown_reference'
  | 'wrong_reference_type'
  | 'missing_reference'
  | 'unsupported_claim'
  | 'unsupported_metric'
  | 'stale_evidence'
  | 'cross_profile_reference'
  | 'approval_required'
  | 'conflicting_evidence'
  | 'malformed_claim';

export type RepairStrategy =
  | 'remove_invalid_reference'
  | 'preserve_valid_references'
  | 'remove_optional_claim'
  | 'rewrite_claim'
  | 'regenerate_field'
  | 'reject_draft';

export interface ProvenanceDefect {
  path: string;
  claimId?: string;
  severity: 'repairable' | 'terminal';
  reason: ProvenanceDefectReason;
  /** Reference identities the model returned for this claim (safe: ids/keys only). */
  returnedRefs: string[];
  /** The subset that validated. */
  validRefs: string[];
  repairStrategy: RepairStrategy;
}

export interface DraftValidationResult {
  valid: boolean;
  defects: ProvenanceDefect[];
  validClaimIds: string[];
  invalidClaimIds: string[];
  /** True when there are defects and every one of them is repairable. */
  repairable: boolean;
  /** Total claim slots examined (denominator for the defect ratio). */
  totalClaims: number;
}

export interface SalvageReport {
  removedClaims: string[];
  repairedReferences: string[];
  mergedClaims: string[];
  remainingDefects: number;
}

export interface GenerationRepairPolicy {
  deterministicRepairEnabled: boolean;
  maxCorrectionCalls: number;
  maxRepairableClaims: number;
  maxRepairableClaimRatio: number;
}

export const DEFAULT_GENERATION_REPAIR_POLICY: GenerationRepairPolicy = {
  ...CV_GENERATION_REPAIR_POLICY,
};

export type SalvageOutcome =
  | { status: 'unchanged'; result: DraftValidationResult }
  | { status: 'repaired'; output: StructuredCvRewriteOutput; report: SalvageReport }
  | { status: 'rejected'; reason: 'truthfulness_failure' | 'unrepairable_output'; result: DraftValidationResult };

// ── Claim enumeration ────────────────────────────────────────────────────────

interface ClaimSlot {
  path: string;
  claimType: ClaimType;
  /** A required claim cannot be dropped; an unsupported one is terminal. */
  required: boolean;
  refs: RewriteSourceRef[];
}

/**
 * Enumerate every provenanced claim slot in a shape-valid draft, tagged with its
 * type and whether it is required. Removability is what separates a repairable
 * defect (drop an optional skill/bullet) from a terminal one (an unsupported
 * employer, degree, certification, or identity field rejects the whole draft).
 */
function enumerateClaims(output: StructuredCvRewriteOutput): ClaimSlot[] {
  const slots: ClaimSlot[] = [
    { path: 'identity', claimType: 'other', required: true, refs: output.identity.sourceRefs },
  ];
  if (output.summary) slots.push({ path: 'summary', claimType: 'summary', required: false, refs: output.summary.sourceRefs });

  output.experience.forEach((entry, i) => {
    slots.push({ path: `experience[${i}]`, claimType: 'other', required: true, refs: entry.sourceRefs });
    entry.achievements.forEach((bullet, j) =>
      slots.push({ path: `experience[${i}].achievements[${j}]`, claimType: 'experience_bullet', required: false, refs: bullet.sourceRefs })
    );
  });
  output.projects.forEach((entry, i) => {
    slots.push({ path: `projects[${i}]`, claimType: 'other', required: false, refs: entry.sourceRefs });
    entry.achievements.forEach((bullet, j) =>
      slots.push({ path: `projects[${i}].achievements[${j}]`, claimType: 'project_bullet', required: false, refs: bullet.sourceRefs })
    );
  });
  output.education.forEach((entry, i) =>
    slots.push({ path: `education[${i}]`, claimType: 'education', required: true, refs: entry.sourceRefs })
  );
  output.skills.forEach((entry, i) => {
    slots.push({ path: `skills[${i}]`, claimType: 'skill', required: false, refs: entry.sourceRefs });
    (entry.items ?? []).forEach((item, j) =>
      slots.push({ path: `skills[${i}].items[${j}]`, claimType: 'skill', required: false, refs: item.sourceRefs })
    );
  });
  output.certifications.forEach((entry, i) =>
    slots.push({ path: `certifications[${i}]`, claimType: 'certification', required: true, refs: entry.sourceRefs })
  );
  return slots;
}

/** Map the validator's per-ref reason string to a typed, non-sensitive defect reason. */
function reasonCodeFor(message: string): ProvenanceDefectReason {
  if (message.includes('not approved')) return 'approval_required';
  if (message.includes('stale') || message.includes('another requirement')) return 'stale_evidence';
  if (message.includes('unknown section')) return 'wrong_reference_type';
  return 'unknown_reference';
}

function partitionRefs(refs: RewriteSourceRef[], input: LedgerNativeRewriteInput) {
  const valid: RewriteSourceRef[] = [];
  const invalid: { ref: RewriteSourceRef; reason: ProvenanceDefectReason }[] = [];
  for (const ref of refs) {
    const message = validateRef(ref, input);
    if (message) invalid.push({ ref, reason: reasonCodeFor(message) });
    else valid.push(ref);
  }
  return { valid, invalid };
}

/**
 * Classify a shape-valid draft's references without mutating it. A claim is a
 * defect when it carries no references or any invalid one; the defect is
 * repairable when valid references remain (prune the rest) or the claim is
 * optional (drop it), and terminal otherwise.
 */
export function classifyRewriteProvenance(
  output: StructuredCvRewriteOutput,
  input: LedgerNativeRewriteInput
): DraftValidationResult {
  const slots = enumerateClaims(output);
  const defects: ProvenanceDefect[] = [];
  const validClaimIds: string[] = [];
  const invalidClaimIds: string[] = [];

  for (const slot of slots) {
    const { valid, invalid } = partitionRefs(slot.refs, input);
    if (slot.refs.length === 0) {
      defects.push({
        path: slot.path,
        claimId: slot.path,
        severity: slot.required ? 'terminal' : 'repairable',
        reason: 'missing_reference',
        returnedRefs: [],
        validRefs: [],
        repairStrategy: slot.required ? 'reject_draft' : 'remove_optional_claim',
      });
      invalidClaimIds.push(slot.path);
      continue;
    }
    if (invalid.length === 0) {
      validClaimIds.push(slot.path);
      continue;
    }
    invalidClaimIds.push(slot.path);
    const repairable = valid.length > 0 || !slot.required;
    defects.push({
      path: slot.path,
      claimId: slot.path,
      severity: repairable ? 'repairable' : 'terminal',
      reason: invalid[0].reason,
      returnedRefs: slot.refs.map(sourceRefKey),
      validRefs: valid.map(sourceRefKey),
      repairStrategy: !repairable
        ? 'reject_draft'
        : valid.length > 0
          ? 'preserve_valid_references'
          : 'remove_optional_claim',
    });
  }

  const repairable = defects.length > 0 && defects.every((defect) => defect.severity === 'repairable');
  return {
    valid: defects.length === 0,
    defects,
    validClaimIds,
    invalidClaimIds,
    repairable,
    totalClaims: slots.length,
  };
}

// ── Deterministic skill re-grounding ─────────────────────────────────────────

/**
 * Find a valid source reference for a single skill token by checking it against
 * the SAME supplied-evidence standard the validator enforces. Returns null when
 * the skill appears in NO supplied evidence — in which case the skill is dropped,
 * never invented a reference for. Order mirrors evidence trust: the source CV
 * first, then ledger evidence, approved profile evidence, application context.
 */
function deriveSkillRef(skill: string, input: LedgerNativeRewriteInput): RewriteSourceRef | null {
  const token = normalizeText(skill);
  if (!token) return null;

  if (normalizeText(input.cvText).includes(token)) {
    return { source: 'source_cv', section: 'source_cv', evidenceText: skill };
  }

  for (const requirement of input.rewriteContext.requirements) {
    const evidence = [...requirement.cvEvidence, ...requirement.approvedProfileEvidence];
    const index = evidence.findIndex((entry) => normalizeText(entry).includes(token));
    if (index >= 0) {
      return { source: 'ledger_evidence', requirementId: requirement.id, evidenceIndex: index };
    }
  }

  for (const item of input.approvedProfileEvidence) {
    if (normalizeText(item.resolvedEvidenceText).includes(token)) {
      return { source: 'approved_profile', requirementId: item.requirementId, evidenceRef: item.evidenceRef };
    }
  }

  for (const item of input.applicationEvidence ?? []) {
    if (normalizeText(`${item.context.label} ${item.context.text}`).includes(token)) {
      return { source: 'application_context', requirementId: item.requirementId, contextId: item.id };
    }
  }

  return null;
}

/** Split a grouped skills string into individual, trimmed skill tokens. */
function splitSkills(text: string): string[] {
  return text
    .split(/[,;]|\s•\s|\s\|\s/)
    .map((part) => part.trim())
    .filter(Boolean);
}

interface SkillSalvage {
  group: ProvenancedSkillGroup | null;
  removed: string[];
  repaired: boolean;
}

/**
 * Salvage one skills group. When the group carries per-skill `items`, each is
 * validated in its own right and only supported skills are retained. Otherwise
 * the group is re-grounded token by token: every listed skill is independently
 * checked against supplied evidence, the supported ones are kept with freshly
 * derived provenance, and the unsupported ones are dropped. A group with no
 * surviving skill is removed entirely.
 */
function salvageSkillGroup(
  group: ProvenancedSkillGroup,
  path: string,
  input: LedgerNativeRewriteInput
): SkillSalvage {
  const removed: string[] = [];

  // Prefer explicit per-skill provenance when the model supplied it.
  if (group.items && group.items.length > 0) {
    const keptItems: ProvenancedSkillItem[] = [];
    for (const item of group.items) {
      const { valid } = partitionRefs(item.sourceRefs, input);
      if (valid.length > 0) {
        keptItems.push({ skill: item.skill, sourceRefs: dedupeRefs(valid) });
      } else {
        const derived = deriveSkillRef(item.skill, input);
        if (derived) keptItems.push({ skill: item.skill, sourceRefs: [derived] });
        else removed.push(`${path}:${item.skill}`);
      }
    }
    if (keptItems.length === 0) return { group: null, removed, repaired: true };
    const refs = dedupeRefs(keptItems.flatMap((item) => item.sourceRefs));
    return {
      group: { category: group.category, text: keptItems.map((item) => item.skill).join(', '), items: keptItems, sourceRefs: refs },
      removed,
      repaired: removed.length > 0 || keptItems.length !== group.items.length,
    };
  }

  // No per-skill provenance: re-derive it from the comma-joined text.
  const keptItems: ProvenancedSkillItem[] = [];
  for (const skill of splitSkills(group.text)) {
    const derived = deriveSkillRef(skill, input);
    if (derived) keptItems.push({ skill, sourceRefs: [derived] });
    else removed.push(`${path}:${skill}`);
  }
  if (keptItems.length === 0) return { group: null, removed, repaired: true };
  const refs = dedupeRefs(keptItems.flatMap((item) => item.sourceRefs));
  return {
    group: { category: group.category, text: keptItems.map((item) => item.skill).join(', '), items: keptItems, sourceRefs: refs },
    removed,
    repaired: true,
  };
}

// ── Deterministic salvage of a whole draft ───────────────────────────────────

/** Prune a claim's references to the valid subset (used for optional/required claims alike). */
function pruneRefs(refs: RewriteSourceRef[], input: LedgerNativeRewriteInput): RewriteSourceRef[] {
  return refs.filter((ref) => validateRef(ref, input) === null);
}

/**
 * Deterministically salvage a draft whose only provenance problems are
 * repairable. Never called for a shape-invalid or terminally-defective draft
 * (those reject). Returns the repaired draft plus a paths-only salvage report,
 * or a rejection when repair is not safe or the defect load is too high to trust.
 */
export function salvageStructuredDraft(
  output: StructuredCvRewriteOutput,
  input: LedgerNativeRewriteInput,
  policy: GenerationRepairPolicy = DEFAULT_GENERATION_REPAIR_POLICY
): SalvageOutcome {
  // A shape-invalid response is a contract violation, not a salvageable draft.
  // It is NOT safe to enumerate claims over it (fields may be missing), so it is
  // rejected without classification.
  if (structuredRewriteShapeIssue(output) !== null) {
    return {
      status: 'rejected',
      reason: 'unrepairable_output',
      result: { valid: false, defects: [], validClaimIds: [], invalidClaimIds: [], repairable: false, totalClaims: 0 },
    };
  }

  const result = classifyRewriteProvenance(output, input);
  if (result.valid) return { status: 'unchanged', result };

  if (!policy.deterministicRepairEnabled) return { status: 'rejected', reason: 'unrepairable_output', result };

  // Any terminal defect — an unsupported identity/history/credential field, or a
  // model that invented ids on a required claim — means the whole output is
  // untrustworthy. Reject rather than repair.
  if (result.defects.some((defect) => defect.severity === 'terminal')) {
    return { status: 'rejected', reason: 'unrepairable_output', result };
  }

  // Cost/trust guard: a high defect count or ratio indicates generally untrustworthy
  // output that is not worth repairing (and would cost nearly as much to redo).
  const defectCount = result.invalidClaimIds.length;
  const ratio = result.totalClaims > 0 ? defectCount / result.totalClaims : 0;
  if (defectCount > policy.maxRepairableClaims || ratio > policy.maxRepairableClaimRatio) {
    return { status: 'rejected', reason: 'unrepairable_output', result };
  }

  const removedClaims: string[] = [];
  const repairedReferences: string[] = [];
  const mergedClaims: string[] = [];

  const defectByPath = new Map(result.defects.map((defect) => [defect.path, defect]));

  // Skills: re-ground groups token by token (or item by item), dropping only
  // skills that appear in NO supplied evidence.
  const skills: ProvenancedSkillGroup[] = [];
  output.skills.forEach((group, i) => {
    const path = `skills[${i}]`;
    const groupDefect = defectByPath.has(path);
    const itemDefect = (group.items ?? []).some((_item, j) => defectByPath.has(`${path}.items[${j}]`));
    if (!groupDefect && !itemDefect) {
      skills.push(group);
      return;
    }
    const salvage = salvageSkillGroup(group, path, input);
    removedClaims.push(...salvage.removed);
    if (salvage.group) {
      if (salvage.repaired) repairedReferences.push(path);
      skills.push(salvage.group);
    } else {
      removedClaims.push(path);
    }
  });

  const repaired: StructuredCvRewriteOutput = {
    ...output,
    summary: (() => {
      const defect = defectByPath.get('summary');
      if (!output.summary || !defect) return output.summary;
      // Optional block with no valid ref → drop it; with valid refs → prune.
      if (defect.repairStrategy === 'remove_optional_claim') {
        removedClaims.push('summary');
        return undefined;
      }
      repairedReferences.push('summary');
      return { ...output.summary, sourceRefs: pruneRefs(output.summary.sourceRefs, input) };
    })(),
    experience: output.experience.map((entry, i) => ({
      ...entry,
      achievements: entry.achievements.flatMap((bullet, j) => {
        const path = `experience[${i}].achievements[${j}]`;
        const defect = defectByPath.get(path);
        if (!defect) return [bullet];
        if (defect.repairStrategy === 'remove_optional_claim') {
          removedClaims.push(path);
          return [];
        }
        repairedReferences.push(path);
        return [{ ...bullet, sourceRefs: pruneRefs(bullet.sourceRefs, input) }];
      }),
    })),
    projects: output.projects.flatMap((entry, i) => {
      const path = `projects[${i}]`;
      const defect = defectByPath.get(path);
      if (defect?.repairStrategy === 'remove_optional_claim') {
        removedClaims.push(path);
        return [];
      }
      const projectRefs = defect ? pruneRefs(entry.sourceRefs, input) : entry.sourceRefs;
      if (defect) repairedReferences.push(path);
      return [{
        ...entry,
        sourceRefs: projectRefs,
        achievements: entry.achievements.flatMap((bullet, j) => {
          const bulletPath = `projects[${i}].achievements[${j}]`;
          const bulletDefect = defectByPath.get(bulletPath);
          if (!bulletDefect) return [bullet];
          if (bulletDefect.repairStrategy === 'remove_optional_claim') {
            removedClaims.push(bulletPath);
            return [];
          }
          repairedReferences.push(bulletPath);
          return [{ ...bullet, sourceRefs: pruneRefs(bullet.sourceRefs, input) }];
        }),
      }];
    }),
    skills,
  };

  // Re-run the FULL validator over the repaired draft. Salvage only ever removes
  // unsupported optional content or prunes invalid refs, so a clean pass here is
  // the proof that no unsupported claim survived the repair.
  const revalidation = validateStructuredRewriteProvenance(repaired, input);
  if (!revalidation.ok) {
    return { status: 'rejected', reason: 'unrepairable_output', result };
  }

  return {
    status: 'repaired',
    output: repaired,
    report: { removedClaims, repairedReferences, mergedClaims, remainingDefects: 0 },
  };
}
