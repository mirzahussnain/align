import type { CvExtractionPayload } from '@/shared/services/cv-extraction/types';
import { stableEvidenceId } from './evidence-id';
import { emptyCandidateEvidence } from './merge-evidence';
import type { CandidateEvidenceItem, EvidenceKind, PreservationTier, ProfessionalLinkType, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from './types';

export interface CvEvidenceSource {
  cvRevisionId: string;
  extractionId: string;
}

const compact = (...values: Array<string | null | undefined>) => values.map((value) => value?.trim()).filter(Boolean).join(' · ');
const hasMetric = (text: string) => /\b\d+(?:[,.]\d+)*\s*(?:%|users?|clients?|customers?|hours?|days?|weeks?|months?|years?|requests?|transactions?|projects?|people|staff)\b/i.test(text);

export function extractionToCandidateEvidence(payload: CvExtractionPayload, source: CvEvidenceSource): UnifiedCandidateEvidence {
  const result = emptyCandidateEvidence();
  const add = (args: { entityType: string; entityId: string; fieldPath: string; kind: EvidenceKind; field: string; text: string; tier: PreservationTier; canonicalData?: unknown; conflictKey?: string }) => {
    const text = args.text.trim();
    if (!text) return null;
    const id = stableEvidenceId('SOURCE_CV', source.cvRevisionId, args.entityType, args.entityId, args.fieldPath, text);
    const ref = { sourceType: 'SOURCE_CV' as const, entityType: args.entityType, entityId: args.entityId, fieldPath: args.fieldPath, snapshotId: source.extractionId };
    const item: CandidateEvidenceItem = {
      id, kind: args.kind, field: args.field, canonicalText: text, canonicalData: args.canonicalData,
      sourceEntityId: args.entityId, provenance: 'SOURCE_CV', preservationTier: args.tier,
      requirementIds: [], sourceRefs: [ref], ...(args.conflictKey ? { conflictKey: args.conflictKey } : {}),
    };
    result.evidenceById[id] = item;
    result.sourceRefs.push(ref);
    return id;
  };
  const entity = (id: string, label: string, details: Record<string, unknown>, evidenceIds: Array<string | null>): UnifiedEvidenceEntity => ({
    id: stableEvidenceId('source-cv-entity', source.cvRevisionId, id), sourceEntityId: id, label, details,
    evidenceIds: evidenceIds.filter((value): value is string => Boolean(value)),
  });
  const addLink = (type: ProfessionalLinkType, label: string, url: string | undefined, fieldPath: string, projectId?: string) => {
    if (!url) return;
    const entityId = projectId ?? source.cvRevisionId;
    const evidenceId = add({ entityType: projectId ? 'ExtractedProject' : 'CvRevision', entityId, fieldPath, kind: 'LINK', field: type, text: url, tier: 1 });
    if (evidenceId) result.professionalLinks.push({ id: stableEvidenceId('link', source.cvRevisionId, type, url, projectId), label, url, type, evidenceId, ...(projectId ? { projectId } : {}) });
  };

  const identityIds = [
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'identity.fullName', kind: 'IDENTITY', field: 'fullName', text: payload.identity.fullName ?? '', tier: 0, conflictKey: 'identity.fullName' }),
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'headline', kind: 'IDENTITY', field: 'headline', text: payload.headline ?? '', tier: 1 }),
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'summary', kind: 'OTHER', field: 'summary', text: payload.summary ?? '', tier: 2 }),
  ].filter((id): id is string => Boolean(id));
  result.identity = { fullName: payload.identity.fullName, headline: payload.headline, evidenceIds: identityIds };
  const phone = payload.identity.phone ?? compact(payload.identity.phoneDialCode, payload.identity.phoneNumber);
  const contactIds = [
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'identity.email', kind: 'CONTACT', field: 'email', text: payload.identity.email ?? '', tier: 0, conflictKey: 'identity.email' }),
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'identity.phone', kind: 'CONTACT', field: 'phone', text: phone, tier: 0, conflictKey: 'identity.phone' }),
    add({ entityType: 'CvRevision', entityId: source.cvRevisionId, fieldPath: 'identity.location', kind: 'CONTACT', field: 'location', text: payload.identity.location ?? '', tier: 1, conflictKey: 'identity.location' }),
  ].filter((id): id is string => Boolean(id));
  result.contact = { email: payload.identity.email, phone: phone || undefined, location: payload.identity.location, evidenceIds: contactIds };
  addLink('EMAIL', 'Email', payload.identity.email, 'identity.email');
  addLink('PHONE', 'Phone', phone || undefined, 'identity.phone');
  addLink('LINKEDIN', 'LinkedIn', payload.identity.linkedin, 'identity.linkedin');
  addLink('GITHUB', 'GitHub', payload.identity.github, 'identity.github');
  addLink('PORTFOLIO', 'Portfolio', payload.identity.website, 'identity.website');

  payload.experience.forEach((item, index) => {
    const entityId = `experience-${index}`;
    const base = add({ entityType: 'ExtractedExperience', entityId, fieldPath: 'record', kind: 'EMPLOYMENT', field: 'employment', text: compact(item.jobTitle, item.company, item.startDate ?? '', item.current ? 'Present' : item.endDate ?? ''), tier: 0, canonicalData: item });
    const bullets = item.achievements.map((text, bulletIndex) => add({ entityType: 'ExtractedExperience', entityId, fieldPath: `achievements[${bulletIndex}]`, kind: 'ACHIEVEMENT', field: 'experience.achievement', text, tier: hasMetric(text) ? 0 : 1 }));
    result.employment.push(entity(entityId, `${item.jobTitle}${item.company ? ` — ${item.company}` : ''}`, { ...item, sourceOrder: index }, [base, ...bullets]));
  });
  payload.projects.forEach((item, index) => {
    const entityId = `project-${index}`;
    const canonicalProjectId = stableEvidenceId('source-cv-entity', source.cvRevisionId, entityId);
    const base = add({ entityType: 'ExtractedProject', entityId, fieldPath: 'record', kind: 'PROJECT', field: 'project', text: item.name, tier: 1, canonicalData: item });
    const bullets = item.achievements.map((text, bulletIndex) => add({ entityType: 'ExtractedProject', entityId, fieldPath: `achievements[${bulletIndex}]`, kind: 'ACHIEVEMENT', field: 'project.achievement', text, tier: hasMetric(text) ? 0 : 1 }));
    result.projects.push(entity(entityId, item.name, { ...item, sourceOrder: index }, [base, ...bullets]));
    addLink('PROJECT_LIVE', `${item.name} live`, item.liveUrl, 'liveUrl', canonicalProjectId);
    addLink('PROJECT_REPOSITORY', `${item.name} repository`, item.repositoryUrl, 'repositoryUrl', canonicalProjectId);
  });
  payload.education.forEach((item, index) => {
    const entityId = `education-${index}`;
    const id = add({ entityType: 'ExtractedEducation', entityId, fieldPath: 'record', kind: 'EDUCATION', field: 'education', text: compact(item.degree, item.university, item.grade), tier: 0, canonicalData: item });
    result.education.push(entity(entityId, `${item.degree}${item.university ? ` — ${item.university}` : ''}`, item, [id]));
  });
  payload.skills.forEach((item, index) => {
    const entityId = `skill-${index}`;
    const id = add({ entityType: 'ExtractedSkill', entityId, fieldPath: 'name', kind: 'SKILL', field: 'skill', text: item.name, tier: 1, canonicalData: item });
    if (id) result.skills.push({ ...entity(entityId, item.name, item, [id]), category: item.category ?? 'Skills', name: item.name });
  });
  payload.certifications.forEach((item, index) => {
    const entityId = `certification-${index}`;
    const id = add({ entityType: 'ExtractedCredential', entityId, fieldPath: 'record', kind: 'CERTIFICATION', field: 'certification', text: compact(item.officialName, item.issuingBody, item.issueDate), tier: 1, canonicalData: item });
    result.certifications.push(entity(entityId, item.officialName, item, [id]));
  });
  payload.training.forEach((item, index) => {
    const entityId = `training-${index}`;
    const id = add({ entityType: 'ExtractedTraining', entityId, fieldPath: 'record', kind: 'TRAINING', field: 'training', text: compact(item.course, item.provider), tier: 2, canonicalData: item });
    result.training.push(entity(entityId, item.course, item, [id]));
  });
  payload.volunteering.forEach((item, index) => {
    const entityId = `volunteering-${index}`;
    const id = add({ entityType: 'ExtractedVolunteering', entityId, fieldPath: 'record', kind: 'VOLUNTEER', field: 'volunteering', text: compact(item.role, item.organisation, item.contribution), tier: 2, canonicalData: item });
    result.volunteerExperience.push(entity(entityId, `${item.role}${item.organisation ? ` — ${item.organisation}` : ''}`, item, [id]));
  });
  payload.otherEvidence.forEach((item, index) => {
    const entityId = `other-${index}`;
    const id = add({ entityType: 'ExtractedOtherEvidence', entityId, fieldPath: 'record', kind: 'OTHER', field: 'other', text: compact(item.title, item.description), tier: 2, canonicalData: item });
    result.otherEvidence.push(entity(entityId, item.title, item, [id]));
  });
  return result;
}
