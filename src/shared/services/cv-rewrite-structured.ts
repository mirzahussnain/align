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

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
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

function validBullet(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const bullet = value as Record<string, unknown>;
  return text(bullet.text) && optionalString(bullet.label) && refs(bullet.sourceRefs);
}

/** Strict runtime shape gate for the untrusted provider response. */
export function isStructuredCvRewriteOutput(value: unknown): value is StructuredCvRewriteOutput {
  if (!value || typeof value !== 'object') return false;
  const output = value as Record<string, unknown>;
  const identity = output.identity as Record<string, unknown> | undefined;
  if (!identity || !refs(identity.sourceRefs)) return false;
  if (![identity.name, identity.professionalTitle, identity.location].every(optionalString)) return false;
  if (identity.contact !== undefined) {
    if (!identity.contact || typeof identity.contact !== 'object') return false;
    const contact = identity.contact as Record<string, unknown>;
    if (!['email', 'phone', 'website', 'linkedin', 'github', 'visaStatus'].every((key) => optionalString(contact[key]))) return false;
  }
  if (output.summary !== undefined) {
    const summary = output.summary as Record<string, unknown>;
    if (!text(summary?.text) || !refs(summary.sourceRefs)) return false;
  }
  if (!['experience', 'projects', 'education', 'skills', 'certifications'].every((key) => Array.isArray(output[key]))) return false;

  const experienceOk = (output.experience as unknown[]).every((candidate) => {
    const entry = candidate as Record<string, unknown> | null;
    return Boolean(entry) && text(entry?.jobTitle) && text(entry?.company) &&
      ['location', 'type', 'startDate', 'endDate'].every((key) => optionalString(entry?.[key])) &&
      refs(entry?.sourceRefs) && Array.isArray(entry?.achievements) && entry.achievements.every(validBullet);
  });
  const projectsOk = (output.projects as unknown[]).every((candidate) => {
    const entry = candidate as Record<string, unknown> | null;
    return Boolean(entry) && text(entry?.name) &&
      ['skills', 'startDate', 'endDate'].every((key) => optionalString(entry?.[key])) &&
      refs(entry?.sourceRefs) && Array.isArray(entry?.achievements) && entry.achievements.every(validBullet);
  });
  const educationOk = (output.education as unknown[]).every((candidate) => {
    const entry = candidate as Record<string, unknown> | null;
    return Boolean(entry) && text(entry?.degree) && text(entry?.university) &&
      ['startDate', 'endDate', 'grade', 'description'].every((key) => optionalString(entry?.[key])) && refs(entry?.sourceRefs);
  });
  const skillsOk = (output.skills as unknown[]).every((candidate) => {
    const entry = candidate as Record<string, unknown> | null;
    return Boolean(entry) && text(entry?.category) && text(entry?.text) && refs(entry?.sourceRefs);
  });
  const certificationsOk = (output.certifications as unknown[]).every((candidate) => {
    const entry = candidate as Record<string, unknown> | null;
    return Boolean(entry) && text(entry?.name) && optionalString(entry?.issuer) && optionalString(entry?.year) && refs(entry?.sourceRefs);
  });
  const notes = output.generationNotes as Record<string, unknown> | undefined;
  const notesOk = notes === undefined ||
    (Array.isArray(notes.unsupportedRequirementsNotAdded) && notes.unsupportedRequirementsNotAdded.every((item) => typeof item === 'string') &&
      (notes.omittedLowPriorityContent === undefined ||
        (Array.isArray(notes.omittedLowPriorityContent) && notes.omittedLowPriorityContent.every((item) => typeof item === 'string'))));
  return experienceOk && projectsOk && educationOk && skillsOk && certificationsOk && notesOk;
}
function evidenceRefKey(ref: { type: string; id: string }) { return `${ref.type}:${ref.id}`; }

function validateRef(ref: RewriteSourceRef, input: LedgerNativeRewriteInput): string | null {
  const requirements = new Map(input.rewriteContext.requirements.map((requirement) => [requirement.id, requirement]));
  switch (ref.source) {
    case 'source_cv':
      if (ref.section !== 'source_cv') return 'Source CV reference has an unknown section.';
      if (ref.evidenceText && !input.cvText.includes(ref.evidenceText)) return 'Source CV reference does not point to supplied evidence.';
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
    });
  }
  return blocks;
}

/** Validates the model's references against the server-resolved generation input. */
export function validateStructuredRewriteProvenance(
  output: unknown,
  input: LedgerNativeRewriteInput
): RewriteProvenanceValidationResult {
  if (!isStructuredCvRewriteOutput(output)) return { ok: false, reasons: ['Structured rewrite response does not match the required contract.'] };
  const reasons: string[] = [];
  for (const block of allBlocks(output)) {
    if (!block.refs.length) reasons.push(`${block.label} has no source reference.`);
    for (const ref of block.refs) {
      const reason = validateRef(ref, input);
      if (reason) reasons.push(`${block.label}: ${reason}`);
    }
  }
  for (const id of output.generationNotes?.unsupportedRequirementsNotAdded ?? []) {
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
      website: output.identity.contact?.website, linkedin: output.identity.contact?.linkedin, github: output.identity.contact?.github, visaStatus: output.identity.contact?.visaStatus,
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
    coreSkills: output.skills.map((entry, index) => { claimSourceRefs[`skills.${index}`] = entry.sourceRefs; return { category: entry.category, skills: entry.text }; }),
    certifications: output.certifications.map((entry, index) => { claimSourceRefs[`certifications.${index}`] = entry.sourceRefs; return { name: entry.name, issuer: entry.issuer ?? '', year: entry.year ?? '' }; }),
  };
  if (output.summary) claimSourceRefs.summary = output.summary.sourceRefs;
  return { data, summary: compacted.decision, claimSourceRefs };
}