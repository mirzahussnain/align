import type { RewrittenCVData } from '@/shared/templates/types';
import { normalizeText } from './cv-evidence';
import type {
  LedgerNativeRewriteInput,
  RewriteSourceRef,
  StructuredCvRewriteOutput,
} from '@/shared/types/cv-rewrite';

export interface RewriteProvenanceValidationResult {
  ok: boolean;
  reasons: string[];
}

export interface SummaryCompactionDecision {
  originalLength: number;
  finalLength: number;
  removedDuplicateSentences: number;
  duplicateSentencesRemoved: string[];
  budget: number;
  budgetExceeded: boolean;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

// `null` is accepted as equivalent to absent: providers routinely emit `null`
// for a not-applicable optional field (an open-ended role's endDate, a missing
// location) rather than omitting the key. A null asserts nothing, and every
// consumer coerces it away, so tolerating it here is not a safety relaxation.
function optionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function refs(value: unknown): value is RewriteSourceRef[] {
  return Array.isArray(value) && value.length > 0 && value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const ref = candidate as Record<string, unknown>;
    if (ref.source === 'source_cv') {
      return text(ref.section) && optionalString(ref.entryId) && optionalString(ref.evidenceText);
    }
    if (ref.source === 'ledger_evidence') {
      return text(ref.requirementId) &&
        (ref.evidenceIndex === undefined ||
          (Number.isInteger(ref.evidenceIndex) && Number(ref.evidenceIndex) >= 0));
    }
    if (ref.source === 'approved_profile') {
      const evidenceRef = ref.evidenceRef as Record<string, unknown> | undefined;
      return text(ref.requirementId) && Boolean(evidenceRef) &&
        text(evidenceRef?.type) && text(evidenceRef?.id);
    }
    return ref.source === 'application_context' &&
      text(ref.requirementId) && text(ref.contextId);
  });
}

function bulletIssue(value: unknown, path: string): string | null {
  if (!value || typeof value !== 'object') return `${path} is not an object.`;
  const bullet = value as Record<string, unknown>;
  if (!text(bullet.text)) return `${path}.text is missing or empty.`;
  if (!optionalString(bullet.label)) return `${path}.label must be a string when present.`;
  if (!refs(bullet.sourceRefs)) return `${path}.sourceRefs is missing or contains an invalid reference.`;
  return null;
}

/**
 * Strict runtime shape check for the untrusted provider response. Returns the
 * first field that violates the contract (naming its exact path), or null when
 * the shape is valid. Kept granular so a rejection is diagnosable rather than an
 * opaque "does not match the contract".
 */
export function structuredRewriteShapeIssue(value: unknown): string | null {
  if (!value || typeof value !== 'object') return 'Response is not a JSON object.';
  const output = value as Record<string, unknown>;

  const identity = output.identity as Record<string, unknown> | undefined;
  if (!identity) return 'identity is missing.';
  if (!refs(identity.sourceRefs)) return 'identity.sourceRefs is missing or contains an invalid reference.';
  if (![identity.name, identity.professionalTitle, identity.location].every(optionalString)) return 'identity name/professionalTitle/location must be strings when present.';
  if (identity.contact !== undefined) {
    if (!identity.contact || typeof identity.contact !== 'object') return 'identity.contact must be an object when present.';
    const contact = identity.contact as Record<string, unknown>;
    if (!['email', 'phone', 'website', 'linkedin', 'github', 'visaStatus'].every((key) => optionalString(contact[key]))) return 'identity.contact fields must be strings when present.';
  }

  if (output.summary !== undefined) {
    const summary = output.summary as Record<string, unknown>;
    if (!text(summary?.text)) return 'summary.text is missing or empty.';
    if (!refs(summary.sourceRefs)) return 'summary.sourceRefs is missing or contains an invalid reference.';
  }

  for (const key of ['experience', 'projects', 'education', 'skills', 'certifications'] as const) {
    if (!Array.isArray(output[key])) return `${key} must be an array.`;
  }

  const experience = output.experience as unknown[];
  for (let i = 0; i < experience.length; i++) {
    const entry = experience[i] as Record<string, unknown> | null;
    if (!entry) return `experience[${i}] is not an object.`;
    if (!text(entry.jobTitle)) return `experience[${i}].jobTitle is missing or empty.`;
    if (!text(entry.company)) return `experience[${i}].company is missing or empty.`;
    if (!['location', 'type', 'startDate', 'endDate'].every((key) => optionalString(entry[key]))) return `experience[${i}] location/type/startDate/endDate must be strings when present.`;
    if (!refs(entry.sourceRefs)) return `experience[${i}].sourceRefs is missing or contains an invalid reference.`;
    if (!Array.isArray(entry.achievements)) return `experience[${i}].achievements must be an array.`;
    for (let j = 0; j < entry.achievements.length; j++) {
      const issue = bulletIssue(entry.achievements[j], `experience[${i}].achievements[${j}]`);
      if (issue) return issue;
    }
  }

  const projects = output.projects as unknown[];
  for (let i = 0; i < projects.length; i++) {
    const entry = projects[i] as Record<string, unknown> | null;
    if (!entry) return `projects[${i}] is not an object.`;
    if (!text(entry.name)) return `projects[${i}].name is missing or empty.`;
    if (!['skills', 'startDate', 'endDate'].every((key) => optionalString(entry[key]))) return `projects[${i}] skills/startDate/endDate must be strings when present.`;
    if (!refs(entry.sourceRefs)) return `projects[${i}].sourceRefs is missing or contains an invalid reference.`;
    if (!Array.isArray(entry.achievements)) return `projects[${i}].achievements must be an array.`;
    for (let j = 0; j < entry.achievements.length; j++) {
      const issue = bulletIssue(entry.achievements[j], `projects[${i}].achievements[${j}]`);
      if (issue) return issue;
    }
  }

  const education = output.education as unknown[];
  for (let i = 0; i < education.length; i++) {
    const entry = education[i] as Record<string, unknown> | null;
    if (!entry) return `education[${i}] is not an object.`;
    if (!text(entry.degree)) return `education[${i}].degree is missing or empty.`;
    if (!text(entry.university)) return `education[${i}].university is missing or empty.`;
    if (!['startDate', 'endDate', 'grade', 'description'].every((key) => optionalString(entry[key]))) return `education[${i}] startDate/endDate/grade/description must be strings when present.`;
    if (!refs(entry.sourceRefs)) return `education[${i}].sourceRefs is missing or contains an invalid reference.`;
  }

  const skills = output.skills as unknown[];
  for (let i = 0; i < skills.length; i++) {
    const entry = skills[i] as Record<string, unknown> | null;
    if (!entry) return `skills[${i}] is not an object.`;
    if (!text(entry.category)) return `skills[${i}].category is missing or empty.`;
    if (!text(entry.text)) return `skills[${i}].text is missing or empty (skills must be a comma-separated string under "text", not a "skills" array).`;
    if (!refs(entry.sourceRefs)) return `skills[${i}].sourceRefs is missing or contains an invalid reference.`;
    // Optional per-skill provenance (contract v2). Additive: when present every
    // item must name a skill and carry its own valid-shaped sourceRefs.
    if (entry.items !== undefined) {
      if (!Array.isArray(entry.items)) return `skills[${i}].items must be an array when present.`;
      for (let j = 0; j < entry.items.length; j++) {
        const item = entry.items[j] as Record<string, unknown> | null;
        if (!item || typeof item !== 'object') return `skills[${i}].items[${j}] is not an object.`;
        if (!text(item.skill)) return `skills[${i}].items[${j}].skill is missing or empty.`;
        if (!refs(item.sourceRefs)) return `skills[${i}].items[${j}].sourceRefs is missing or contains an invalid reference.`;
      }
    }
  }

  const certifications = output.certifications as unknown[];
  for (let i = 0; i < certifications.length; i++) {
    const entry = certifications[i] as Record<string, unknown> | null;
    if (!entry) return `certifications[${i}] is not an object.`;
    if (!text(entry.name)) return `certifications[${i}].name is missing or empty.`;
    if (!optionalString(entry.issuer)) return `certifications[${i}].issuer must be a string when present.`;
    if (!optionalString(entry.year)) return `certifications[${i}].year must be a string when present.`;
    if (!refs(entry.sourceRefs)) return `certifications[${i}].sourceRefs is missing or contains an invalid reference.`;
  }

  const notes = output.generationNotes as Record<string, unknown> | undefined;
  if (notes !== undefined) {
    if (!Array.isArray(notes.unsupportedRequirementsNotAdded) || !notes.unsupportedRequirementsNotAdded.every((item) => typeof item === 'string')) {
      return 'generationNotes.unsupportedRequirementsNotAdded must be an array of strings.';
    }
    if (notes.omittedLowPriorityContent !== undefined && (!Array.isArray(notes.omittedLowPriorityContent) || !notes.omittedLowPriorityContent.every((item) => typeof item === 'string'))) {
      return 'generationNotes.omittedLowPriorityContent must be an array of strings when present.';
    }
  }

  return null;
}

/** Strict runtime shape gate for the untrusted provider response. */
export function isStructuredCvRewriteOutput(value: unknown): value is StructuredCvRewriteOutput {
  return structuredRewriteShapeIssue(value) === null;
}
function evidenceRefKey(ref: { type: string; id: string }) { return `${ref.type}:${ref.id}`; }

/** Stable, discriminant-aware identity for a source ref (used to dedupe ref unions). */
export function sourceRefKey(ref: RewriteSourceRef): string {
  switch (ref.source) {
    case 'source_cv':
      return `source_cv|${ref.section}|${ref.entryId ?? ''}|${normalizeText(ref.evidenceText ?? '')}`;
    case 'ledger_evidence':
      return `ledger_evidence|${ref.requirementId}|${ref.evidenceIndex ?? ''}`;
    case 'approved_profile':
      return `approved_profile|${ref.requirementId}|${evidenceRefKey(ref.evidenceRef)}`;
    case 'application_context':
      return `application_context|${ref.requirementId}|${ref.contextId}`;
  }
}

/** De-duplicate a list of source refs by their stable identity, preserving order. */
export function dedupeRefs(refs: RewriteSourceRef[]): RewriteSourceRef[] {
  const seen = new Set<string>();
  const unique: RewriteSourceRef[] = [];
  for (const ref of refs) {
    const key = sourceRefKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(ref);
  }
  return unique;
}

export function validateRef(ref: RewriteSourceRef, input: LedgerNativeRewriteInput): string | null {
  const requirements = new Map(input.rewriteContext.requirements.map((requirement) => [requirement.id, requirement]));
  switch (ref.source) {
    case 'source_cv':
      if (ref.section !== 'source_cv') return 'Source CV reference has an unknown section.';
      // Compare on the normalized form (lowercase, punctuation/whitespace-folded)
      // rather than a byte-exact substring. A provider that faithfully cites the
      // CV routinely reformats quotes, casing, and spacing; that reformatting is
      // not fabrication. normalizeText preserves word order and content, so text
      // that is genuinely absent from the CV is still rejected.
      if (ref.evidenceText && !normalizeText(input.cvText).includes(normalizeText(ref.evidenceText))) return 'Source CV reference does not point to supplied evidence.';
      return null;
    case 'ledger_evidence': {
      const requirement = requirements.get(ref.requirementId);
      if (!requirement) return 'Source reference has an unknown requirement id.';
      const evidence = [...requirement.cvEvidence, ...requirement.approvedProfileEvidence];
      return ref.evidenceIndex === undefined || (Number.isInteger(ref.evidenceIndex) && ref.evidenceIndex >= 0 && ref.evidenceIndex < evidence.length)
        ? null : 'Ledger evidence index is invalid.';
    }
    case 'approved_profile': {
      if (!requirements.has(ref.requirementId)) return 'Approved evidence has an unknown requirement id.';
      const permitted = input.approvedProfileEvidence.some((item) =>
        item.requirementId === ref.requirementId && evidenceRefKey(item.evidenceRef) === evidenceRefKey(ref.evidenceRef)
      );
      return permitted ? null : 'Approved profile evidence is unavailable or not approved for this requirement.';
    }
    case 'application_context': {
      const applicationEvidence = input.applicationEvidence ?? [];
      const permitted = applicationEvidence.some((item) => item.id === ref.contextId && item.requirementId === ref.requirementId);
      return permitted ? null : 'Application-only evidence is stale, unapproved, or belongs to another requirement.';
    }
  }
}

function allBlocks(output: StructuredCvRewriteOutput): Array<{ label: string; refs: RewriteSourceRef[] }> {
  const blocks: Array<{ label: string; refs: RewriteSourceRef[] }> = [{ label: 'identity', refs: output.identity.sourceRefs }];
  if (output.summary) blocks.push({ label: 'summary', refs: output.summary.sourceRefs });
  for (const [section, entries] of Object.entries({ experience: output.experience, projects: output.projects, education: output.education, skills: output.skills, certifications: output.certifications })) {
    entries.forEach((entry, index) => {
      blocks.push({ label: `${section}[${index}]`, refs: entry.sourceRefs });
      if ('achievements' in entry) entry.achievements.forEach((bullet, bulletIndex) => blocks.push({ label: `${section}[${index}].achievements[${bulletIndex}]`, refs: bullet.sourceRefs }));
      // Per-skill provenance (contract v2): each item is validated in its own right.
      if ('items' in entry && Array.isArray(entry.items)) entry.items.forEach((item, itemIndex) => blocks.push({ label: `${section}[${index}].items[${itemIndex}]`, refs: item.sourceRefs }));
    });
  }
  return blocks;
}

/** Validates the model's references against the server-resolved generation input. */
export function validateStructuredRewriteProvenance(
  output: unknown,
  input: LedgerNativeRewriteInput
): RewriteProvenanceValidationResult {
  const shapeIssue = structuredRewriteShapeIssue(output);
  if (shapeIssue) return { ok: false, reasons: [`Structured rewrite response does not match the required contract: ${shapeIssue}`] };
  const typed = output as StructuredCvRewriteOutput;
  const reasons: string[] = [];
  for (const block of allBlocks(typed)) {
    if (!block.refs.length) reasons.push(`${block.label} has no source reference.`);
    for (const ref of block.refs) {
      const reason = validateRef(ref, input);
      if (reason) reasons.push(`${block.label}: ${reason}`);
    }
  }
  for (const id of typed.generationNotes?.unsupportedRequirementsNotAdded ?? []) {
    const requirement = input.rewriteContext.requirements.find((item) => item.id === id);
    if (!requirement) reasons.push('Unsupported requirement note contains an unknown requirement id.');
    else if (!['not_met', 'contradicted', 'unclear'].includes(requirement.status)) reasons.push('Supported requirement was incorrectly reported as not added.');
  }
  return { ok: reasons.length === 0, reasons };
}

function cleanSentenceSummary(summary: string, maxChars: number): { text: string; decision: SummaryCompactionDecision } {
  const original = summary.trim();
  const sentences = original.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [original];
  const seen = new Set<string>();
  const duplicateSentencesRemoved: string[] = [];
  const unique = sentences.filter((sentence) => {
    const key = normalizeText(sentence);
    if (!key) return false;
    if (seen.has(key)) {
      duplicateSentencesRemoved.push(sentence.replace(/\s+/g, ' ').trim());
      return false;
    }
    seen.add(key);
    return true;
  });
  const compacted = unique.join(' ').replace(/\s+/g, ' ').trim();
  return {
    text: compacted,
    decision: {
      originalLength: original.length,
      finalLength: compacted.length,
      removedDuplicateSentences: duplicateSentencesRemoved.length,
      duplicateSentencesRemoved,
      budget: maxChars,
      budgetExceeded: compacted.length > maxChars,
    },
  };
}

/** Deterministic adapter: raw provenanced output -> persisted display data; raw output never reaches renderers. */
export function structuredRewriteToRewrittenData(
  output: StructuredCvRewriteOutput,
  summaryMaxChars: number
): { data: RewrittenCVData; summary: SummaryCompactionDecision; claimSourceRefs: Record<string, RewriteSourceRef[]> } {
  const compacted = cleanSentenceSummary(output.summary?.text ?? '', summaryMaxChars);
  const claimSourceRefs: Record<string, RewriteSourceRef[]> = { identity: output.identity.sourceRefs };
  const data: RewrittenCVData = {
    fullName: output.identity.name ?? '',
    tagline: output.identity.professionalTitle ?? '',
    contact: {
      email: output.identity.contact?.email ?? '', phone: output.identity.contact?.phone ?? '', location: output.identity.location ?? '',
      website: output.identity.contact?.website ?? undefined, linkedin: output.identity.contact?.linkedin ?? undefined, github: output.identity.contact?.github ?? undefined, visaStatus: output.identity.contact?.visaStatus ?? undefined,
    },
    professionalSummary: compacted.text,
    experience: output.experience.map((entry, index) => {
      claimSourceRefs[`experience.${index}`] = entry.sourceRefs;
      return { jobTitle: entry.jobTitle, company: entry.company, location: entry.location ?? '', type: entry.type ?? '', startDate: entry.startDate ?? '', endDate: entry.endDate ?? '', achievements: entry.achievements.map((bullet, bulletIndex) => {
        claimSourceRefs[`experience.${index}.achievements.${bulletIndex}`] = bullet.sourceRefs;
        return { label: bullet.label ?? '', body: bullet.text };
      }) };
    }),
    projects: output.projects.map((entry, index) => {
      claimSourceRefs[`projects.${index}`] = entry.sourceRefs;
      return { name: entry.name, skills: entry.skills ?? '', startDate: entry.startDate ?? '', endDate: entry.endDate ?? '', achievements: entry.achievements.map((bullet, bulletIndex) => {
        claimSourceRefs[`projects.${index}.achievements.${bulletIndex}`] = bullet.sourceRefs;
        return { label: bullet.label ?? '', body: bullet.text };
      }) };
    }),
    education: output.education.map((entry, index) => { claimSourceRefs[`education.${index}`] = entry.sourceRefs; return { degree: entry.degree, university: entry.university, startDate: entry.startDate ?? '', endDate: entry.endDate ?? '', grade: entry.grade ?? '', description: entry.description ?? '' }; }),
    coreSkills: output.skills.map((entry, index) => {
      // Provenance for a skills group is the union of its group-level refs and
      // every per-skill ref, so a partially-salvaged group keeps the full,
      // deduplicated evidence trail for the skills it retained.
      claimSourceRefs[`skills.${index}`] = dedupeRefs([
        ...entry.sourceRefs,
        ...(entry.items ?? []).flatMap((item) => item.sourceRefs),
      ]);
      return { category: entry.category, skills: entry.text };
    }),
    certifications: output.certifications.map((entry, index) => { claimSourceRefs[`certifications.${index}`] = entry.sourceRefs; return { name: entry.name, issuer: entry.issuer ?? '', year: entry.year ?? '' }; }),
  };
  if (output.summary) claimSourceRefs.summary = output.summary.sourceRefs;
  return { data, summary: compacted.decision, claimSourceRefs };
}