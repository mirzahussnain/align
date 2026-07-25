import { z } from 'zod';
import { prisma } from '@/shared/lib/prisma';
import type { JobRequirementLedgerEntry } from '@/shared/types/ai';
import type { UserProvidedContext } from '@/shared/types/cv-rewrite';
import type { ProfileEvidenceRef } from '@/shared/types/profile-reasoning';
import { normaliseSkillName } from '@/shared/utils/skill-normalization';
import { CERTIFICATION_STATUS_OPTIONS, LANGUAGE_PROFICIENCY_OPTIONS, LICENCE_STATUS_OPTIONS, REGISTRATION_STATUS_OPTIONS, TRAINING_STATUS_OPTIONS, VERIFICATION_STATUS_OPTIONS, languageProficiencyLabel } from '@/shared/constants/profile-field-options';
import { formatDateRange, formatProfileDate, isProfileDate } from '@/shared/utils/date';
import { validateProfileDateRange, type ProfileDateBoundary } from '@/shared/utils/date-policy';

export const STRUCTURED_EVIDENCE_KINDS = [
  'skill_tool', 'employment', 'project', 'education', 'training', 'certification',
  'licence', 'registration', 'language', 'volunteering', 'other',
] as const;
export type StructuredEvidenceKind = (typeof STRUCTURED_EVIDENCE_KINDS)[number];

const text = z.string().trim().min(1).max(400);
const optionalText = z.string().trim().max(2000).optional().default('');
const date = z.string().trim().refine((value) => !value || isProfileDate(value), 'Use YYYY or YYYY-MM.').optional().default('');
const stringList = z.array(text).max(30).default([]);
const values = (options: readonly { value: string }[]) => options.map((option) => option.value) as [string, ...string[]];
/** A controlled value that may also be left unset (''). Invalid non-empty values are still rejected server-side. */
const optionalEnum = (options: readonly { value: string }[]) => z.enum(values(options)).or(z.literal('')).optional().default('');
const languageProficiency = optionalEnum(LANGUAGE_PROFICIENCY_OPTIONS);
const certificationStatus = optionalEnum(CERTIFICATION_STATUS_OPTIONS);
const trainingStatus = optionalEnum(TRAINING_STATUS_OPTIONS);
const licenceStatus = optionalEnum(LICENCE_STATUS_OPTIONS);
const registrationStatus = optionalEnum(REGISTRATION_STATUS_OPTIONS);
const verificationStatus = optionalEnum(VERIFICATION_STATUS_OPTIONS);
/** Languages need at least one of the three abilities; a missing one stays null, never inferred from the others. */
function requireOneAbility(value: Record<string, unknown>, ctx: z.RefinementCtx) {
  if (!['speaking', 'reading', 'writing'].some((ability) => String(value[ability] ?? '').trim())) {
    ctx.addIssue({ code: 'custom', path: ['speaking'], message: 'Give at least one of speaking, reading, or writing proficiency.' });
  }
}
function checkDateRange(value: Record<string, unknown>, ctx: z.RefinementCtx, start: string, end: string, startLabel: string, endLabel: string, endBoundary: ProfileDateBoundary = 'past-or-current') {
  const message = validateProfileDateRange({ start: String(value[start] ?? ''), end: String(value[end] ?? ''), startLabel, endLabel, endBoundary });
  if (message) ctx.addIssue({ code: 'custom', path: [message.startsWith(startLabel) ? start : end], message });
}

const schemas = {
  skill_tool: z.object({ name: text, level: z.enum(['professional', 'project', 'limited_exposure', 'training', 'learning']), contextType: text, linkedEvidenceId: optionalText, activity: text, period: optionalText, outcome: optionalText }),
  employment: z.object({ employer: text, role: text, startDate: date, endDate: date, responsibility: text, skillsTools: stringList, outcome: optionalText }).superRefine((value, ctx) => checkDateRange(value, ctx, 'startDate', 'endDate', 'Experience start', 'Experience end')), 
  project: z.object({ projectName: text, context: text, description: text, contribution: text, skillsTools: stringList, startDate: date, endDate: date, outcomeOrLink: optionalText }).superRefine((value, ctx) => checkDateRange(value, ctx, 'startDate', 'endDate', 'Project start', 'Project expected end', 'future-allowed')), 
  education: z.object({ qualification: text, institution: text, field: optionalText, status: optionalText, startDate: date, endDate: date, result: optionalText }).superRefine((value, ctx) => checkDateRange(value, ctx, 'startDate', 'endDate', 'Start date', 'End date')),
  training: z.object({ course: text, provider: optionalText, field: optionalText, status: trainingStatus, startDate: date, endDate: date, result: optionalText }).superRefine((value, ctx) => checkDateRange(value, ctx, 'startDate', 'endDate', 'Start date', 'End date', value.status === 'in_progress' ? 'future-allowed' : 'past-or-current')),
  certification: z.object({ officialName: text, issuingBody: optionalText, issueDate: date, expiryDate: date, credentialNumber: optionalText, status: certificationStatus, verificationUrl: z.string().url().optional().or(z.literal('')).default(''), verificationStatus: verificationStatus }).superRefine((value, ctx) => checkDateRange(value, ctx, 'issueDate', 'expiryDate', 'Issue date', 'Expiry date', 'future-allowed')),
  licence: z.object({ officialName: text, issuingBody: optionalText, issueDate: date, expiryDate: date, credentialNumber: optionalText, status: licenceStatus, verificationUrl: z.string().url().optional().or(z.literal('')).default(''), verificationStatus: verificationStatus }).superRefine((value, ctx) => checkDateRange(value, ctx, 'issueDate', 'expiryDate', 'Issue date', 'Expiry date', 'future-allowed')),
  registration: z.object({ officialName: text, issuingBody: text, issueDate: date, expiryDate: date, credentialNumber: optionalText, status: registrationStatus, verificationUrl: z.string().url().optional().or(z.literal('')).default(''), verificationStatus: verificationStatus }).superRefine((value, ctx) => checkDateRange(value, ctx, 'issueDate', 'expiryDate', 'Issue date', 'Expiry date', 'future-allowed')),
  language: z.object({ language: text, speaking: languageProficiency, reading: languageProficiency, writing: languageProficiency, professionalUseContext: optionalText, formalTest: optionalText }).superRefine(requireOneAbility),
  volunteering: z.object({ organisation: text, role: text, startDate: date, endDate: date, contribution: optionalText, skillsTools: stringList, outcome: optionalText }).superRefine((value, ctx) => checkDateRange(value, ctx, 'startDate', 'endDate', 'Start date', 'End date')),
  other: z.object({ title: text, context: optionalText, description: text, period: optionalText, outcome: optionalText }).superRefine((value, ctx) => {
    const combined = `${value.title} ${value.context}`.toLowerCase();
    if (/\b(skill|employment|work history|project|education|degree|certification|licen[cs]e|registration|language|training|volunteer)/.test(combined)) ctx.addIssue({ code: 'custom', message: 'Use the matching profile section instead of Other evidence for this type of record.' });
  }),
} as const;

export class StructuredEvidenceValidationError extends Error {}

export function validateStructuredEvidence(kind: unknown, details: unknown) {
  if (!STRUCTURED_EVIDENCE_KINDS.includes(kind as StructuredEvidenceKind)) {
    throw new StructuredEvidenceValidationError('Unsupported evidence type.');
  }
  const result = schemas[kind as StructuredEvidenceKind].safeParse(details);
  if (!result.success) throw new StructuredEvidenceValidationError(result.error.issues[0]?.message ?? 'Invalid evidence details.');
  return { kind: kind as StructuredEvidenceKind, details: result.data };
}

/** Canonical persistence adapter shared by HITL capture and Profile Management. */
export async function createCanonicalEvidence(profileId: string, kind: unknown, raw: unknown): Promise<ProfileEvidenceRef> {
  const { kind: parsedKind, details } = validateStructuredEvidence(kind, raw);
  const d = details as Record<string, unknown>;
  const text = (key: string) => String(d[key] ?? '').trim();
  const list = (key: string) => Array.isArray(d[key]) ? d[key].map(String) : [];
  if (parsedKind === 'skill_tool') {
    const name = text('name');
    const item = await prisma.skill.create({ data: { profileId, name, normalizedName: normaliseSkillName(name), level: text('level'), contextType: text('contextType'), linkedEvidenceId: text('linkedEvidenceId') || null, activity: text('activity'), period: text('period') || null, outcome: text('outcome') || null }, select: { id: true } });
    return { type: 'skill', id: item.id };
  }
  if (parsedKind === 'employment') {
    if (!text('startDate')) throw new StructuredEvidenceValidationError('Employment evidence needs a start date to be saved to your profile.');
    const item = await prisma.experience.create({ data: { profileId, jobTitle: text('role'), company: text('employer'), startDate: text('startDate'), endDate: text('endDate') || null, achievements: [text('responsibility'), ...list('skillsTools').map((value) => `Used ${value}`), text('outcome')].filter(Boolean) }, select: { id: true } });
    return { type: 'experience', id: item.id };
  }
  if (parsedKind === 'project') { const item = await prisma.projectEntry.create({ data: { profileId, name: text('projectName'), startDate: text('startDate') || null, endDate: text('endDate') || null, achievements: [text('description'), text('contribution'), text('outcomeOrLink')].filter(Boolean) }, select: { id: true } }); return { type: 'project', id: item.id }; }
  if (parsedKind === 'education') { const item = await prisma.education.create({ data: { profileId, degree: text('qualification'), university: text('institution'), startDate: text('startDate') || null, endDate: text('endDate') || null, grade: text('result') || null, description: [text('field'), text('status')].filter(Boolean).join(' — ') || null }, select: { id: true } }); return { type: 'education', id: item.id }; }
  if (parsedKind === 'certification') { const item = await prisma.certification.create({ data: { profileId, name: text('officialName'), issuer: text('issuingBody') || null, year: text('issueDate') || null, issueDate: text('issueDate') || null, expiryDate: text('expiryDate') || null, credentialNumber: text('credentialNumber') || null, status: text('status') || null, verificationUrl: text('verificationUrl') || null, verificationStatus: text('verificationStatus') || null }, select: { id: true } }); return { type: 'certification', id: item.id }; }
  if (parsedKind === 'training') { const item = await prisma.training.create({ data: { profileId, course: text('course'), provider: text('provider') || null, field: text('field') || null, status: text('status') || null, startDate: text('startDate') || null, endDate: text('endDate') || null, result: text('result') || null }, select: { id: true } }); return { type: 'training', id: item.id }; }
  if (parsedKind === 'licence') { const item = await prisma.licence.create({ data: { profileId, officialName: text('officialName'), issuingBody: text('issuingBody') || null, issueDate: text('issueDate') || null, expiryDate: text('expiryDate') || null, credentialNumber: text('credentialNumber') || null, status: text('status') || null, verificationUrl: text('verificationUrl') || null, verificationStatus: text('verificationStatus') || null }, select: { id: true } }); return { type: 'licence', id: item.id }; }
  if (parsedKind === 'registration') { const item = await prisma.professionalRegistration.create({ data: { profileId, officialName: text('officialName'), issuingBody: text('issuingBody'), issueDate: text('issueDate') || null, expiryDate: text('expiryDate') || null, registrationNumber: text('credentialNumber') || null, status: text('status') || null, verificationUrl: text('verificationUrl') || null, verificationStatus: text('verificationStatus') || null }, select: { id: true } }); return { type: 'professional_registration', id: item.id }; }
  if (parsedKind === 'language') { const item = await prisma.language.create({ data: { profileId, language: text('language'), speaking: text('speaking') || null, reading: text('reading') || null, writing: text('writing') || null, professionalUseContext: text('professionalUseContext') || null, formalTest: text('formalTest') || null }, select: { id: true } }); return { type: 'language', id: item.id }; }
  if (parsedKind === 'volunteering') { const item = await prisma.volunteering.create({ data: { profileId, organisation: text('organisation'), role: text('role'), startDate: text('startDate') || null, endDate: text('endDate') || null, contribution: text('contribution') || null, skillsTools: list('skillsTools'), outcome: text('outcome') || null }, select: { id: true } }); return { type: 'volunteering', id: item.id }; }
  const item = await prisma.otherEvidence.create({ data: { profileId, title: text('title'), context: text('context') || null, description: text('description'), period: text('period') || null, outcome: text('outcome') || null }, select: { id: true } });
  return { type: 'other', id: item.id };
}
const labels: Record<StructuredEvidenceKind, string> = {
  skill_tool: 'Skill or tool', employment: 'Employment evidence', project: 'Project', education: 'Education', training: 'Training', certification: 'Certification', licence: 'Licence', registration: 'Professional registration', language: 'Language', volunteering: 'Volunteering', other: 'Other evidence',
};

/**
 * Canonical, factual rendering used only after server validation. Missing
 * optional fields are omitted cleanly — no dangling separators, no "undefined",
 * no inferred issuer/ability/status — and controlled codes map to human labels.
 */
export function describeStructuredEvidence(kind: string, raw: unknown) {
  const { kind: parsedKind, details } = validateStructuredEvidence(kind.toLowerCase(), raw);
  const d = details as Record<string, unknown>;
  const value = (key: string) => (typeof d[key] === 'string' ? (d[key] as string).trim() : '');
  const list = (key: string) => (Array.isArray(d[key]) ? d[key].join(', ') : '');
  /** "A — B" when B is present, otherwise just "A". */
  const joinDash = (head: string, tail: string) => (tail ? `${head} — ${tail}` : head);
  const credential = ['certification', 'licence', 'registration'].includes(parsedKind);

  let text: string;
  if (parsedKind === 'skill_tool') {
    text = joinDash(value('name'), `${value('level').replaceAll('_', ' ')}: ${value('activity')}`);
  } else if (parsedKind === 'employment') {
    text = `${value('role')} at ${value('employer')}: ${value('responsibility')}`;
  } else if (parsedKind === 'project') {
    text = `${value('projectName')}: ${value('contribution')}`;
  } else if (parsedKind === 'education' || parsedKind === 'training') {
    text = joinDash(value(parsedKind === 'education' ? 'qualification' : 'course'), value('institution') || value('provider'));
  } else if (credential) {
    const verification = value('verificationStatus') === 'verified' ? 'verified' : 'user-confirmed, unverified';
    text = `${joinDash(value('officialName'), value('issuingBody'))} (${verification})`;
  } else if (parsedKind === 'language') {
    const abilities = (['speaking', 'reading', 'writing'] as const)
      .map((ability) => [ability, value(ability)] as const)
      .filter(([, level]) => level)
      .map(([ability, level]) => `${ability}: ${languageProficiencyLabel(level)}`)
      .join('; ');
    text = joinDash(value('language'), abilities);
  } else if (parsedKind === 'volunteering') {
    const head = `${value('role')} at ${value('organisation')}`;
    text = value('contribution') ? `${head}: ${value('contribution')}` : head;
  } else {
    text = `${value('title')}: ${value('description')}`;
  }

  const dateText = parsedKind === 'other'
    ? formatProfileDate(value('period'))
    : ['certification', 'licence', 'registration'].includes(parsedKind)
      ? formatDateRange(value('issueDate'), value('expiryDate'))
      : ['employment', 'project', 'education', 'training', 'volunteering'].includes(parsedKind)
        ? formatDateRange(value('startDate'), value('endDate'))
        : '';
  const extras = [list('skillsTools'), value('outcome'), value('outcomeOrLink'), value('professionalUseContext'), dateText].filter(Boolean);
  return { label: labels[parsedKind], text: [text, ...extras].join('. ') };
}


/** Revalidate application-only context at generation time; client text is never trusted. */
export async function resolveApprovedApplicationEvidence(
  userId: string,
  analysisId: string,
  profileId: string | null,
  ids: string[],
  requirements: JobRequirementLedgerEntry[]
): Promise<{ id: string; requirementId: string; context: UserProvidedContext }[]> {
  if (ids.length === 0) return [];
  if (new Set(ids).size !== ids.length) throw new StructuredEvidenceValidationError('Duplicate application evidence context.');
  const rows = await prisma.applicationEvidenceContext.findMany({
    where: { id: { in: ids }, userId, analysisId, ...(profileId ? { profileId } : {}) },
    select: { id: true, requirementId: true, kind: true, details: true },
  });
  if (rows.length !== ids.length) throw new StructuredEvidenceValidationError('Application evidence is stale, deleted, or not owned by this profile.');
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  return rows.map((row) => {
    const requirement = requirementsById.get(row.requirementId);
    if (!requirement || !['partial', 'not_met', 'contradicted', 'unclear'].includes(requirement.status)) throw new StructuredEvidenceValidationError('Application evidence no longer targets an eligible requirement.');
    const description = describeStructuredEvidence(row.kind, row.details);
    return { id: row.id, requirementId: row.requirementId, context: { label: requirement.text, text: description.text } };
  });
}
