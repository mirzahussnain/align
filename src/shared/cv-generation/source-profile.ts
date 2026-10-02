import type { ProfileData, ProfileEvidenceMetadata } from '@/features/dashboard/data/load-profile';
import { stableEvidenceId } from './evidence-id';
import { emptyCandidateEvidence } from './merge-evidence';
import type {
  CandidateEvidenceItem,
  EvidenceKind,
  EvidenceSourceRef,
  PreservationTier,
  ProfessionalLinkType,
  UnifiedCandidateEvidence,
  UnifiedEvidenceEntity,
} from './types';

const hasMetric = (text: string) => /(?:\b\d+(?:\.\d+)?\s*%|[$£€]\s*\d|\b\d+[x×]\b|\b\d+(?:[,.]\d+)*\s*(?:users?|customers?|hours?|days?|weeks?|months?|years?|requests?|transactions?|projects?|people|staff)\b)/i.test(text);
const compact = (...values: Array<string | undefined>) => values.map((value) => value?.trim()).filter(Boolean).join(' · ');

interface ProfileSourceOptions {
  snapshotId: string;
  sourceType?: 'CAREER_PROFILE' | 'PROFILE_EVIDENCE';
}

export function profileToCandidateEvidence(profile: ProfileData, options: ProfileSourceOptions): UnifiedCandidateEvidence {
  const result = emptyCandidateEvidence();
  const sourceType = options.sourceType ?? 'CAREER_PROFILE';

  const add = (args: {
    entityType: string; entityId: string; fieldPath: string; kind: EvidenceKind; field: string; text: string;
    tier: PreservationTier; conflictKey?: string; canonicalData?: unknown; requirementIds?: string[];
  }): string | null => {
    const text = args.text.trim();
    if (!text) return null;
    const id = stableEvidenceId(sourceType, args.entityType, args.entityId, args.fieldPath, text);
    const ref: EvidenceSourceRef = {
      sourceType, entityType: args.entityType, entityId: args.entityId, fieldPath: args.fieldPath, snapshotId: options.snapshotId,
    };
    const item: CandidateEvidenceItem = {
      id, kind: args.kind, field: args.field, canonicalText: text, canonicalData: args.canonicalData,
      sourceEntityId: args.entityId, provenance: sourceType, preservationTier: args.tier,
      requirementIds: args.requirementIds ?? [], sourceRefs: [ref], ...(args.conflictKey ? { conflictKey: args.conflictKey } : {}),
    };
    result.evidenceById[id] = item;
    result.sourceRefs.push(ref);
    return id;
  };

  const addHitlMetadata = (
    entityType: string,
    entityId: string,
    metadata: ProfileEvidenceMetadata[] | undefined,
    defaultKind: EvidenceKind,
    field: string
  ): string[] => (metadata ?? []).flatMap((item, index) => {
    const text = item.text.trim();
    if (!text || result.evidenceById[item.evidenceId]) return [];
    const ref: EvidenceSourceRef = {
      sourceType: 'PROFILE_EVIDENCE', entityType, entityId,
      fieldPath: `evidenceMetadata[${index}]`, snapshotId: options.snapshotId,
    };
    result.evidenceById[item.evidenceId] = {
      id: item.evidenceId,
      kind: item.fieldKind === 'ACHIEVEMENT' ? 'ACHIEVEMENT' : defaultKind,
      field: `${field}.${item.fieldKind.toLowerCase()}`,
      canonicalText: text,
      canonicalData: { fieldKind: item.fieldKind, generationId: item.generationId },
      sourceEntityId: entityId,
      provenance: 'HITL',
      preservationTier: hasMetric(text) ? 0 : 1,
      requirementIds: item.requirementIds,
      sourceRefs: [ref],
    };
    result.sourceRefs.push(ref);
    return [item.evidenceId];
  });

  const identityIds = [
    add({ entityType: 'ProfileIdentity', entityId: profile.profileId, fieldPath: 'fullName', kind: 'IDENTITY', field: 'fullName', text: profile.personal.fullName, tier: 0, conflictKey: 'identity.fullName' }),
    add({ entityType: 'Profile', entityId: profile.profileId, fieldPath: 'tagline', kind: 'IDENTITY', field: 'headline', text: profile.personal.tagline, tier: 1 }),
    add({ entityType: 'Profile', entityId: profile.profileId, fieldPath: 'professionalSummary', kind: 'OTHER', field: 'summary', text: profile.personal.professionalSummary, tier: 2 }),
  ].filter((id): id is string => Boolean(id));
  result.identity = { fullName: profile.personal.fullName || undefined, headline: profile.personal.tagline || undefined, evidenceIds: identityIds };

  const phone = compact(profile.personal.phoneDialCode, profile.personal.phoneNumber);
  const location = [profile.personal.city, profile.personal.state, profile.personal.country].filter(Boolean).join(', ');
  const contactIds = [
    add({ entityType: 'ProfileIdentity', entityId: profile.profileId, fieldPath: 'email', kind: 'CONTACT', field: 'email', text: profile.personal.email, tier: 0, conflictKey: 'identity.email' }),
    add({ entityType: 'ProfileIdentity', entityId: profile.profileId, fieldPath: 'phone', kind: 'CONTACT', field: 'phone', text: phone, tier: 0, conflictKey: 'identity.phone' }),
    add({ entityType: 'ProfileIdentity', entityId: profile.profileId, fieldPath: 'location', kind: 'CONTACT', field: 'location', text: location, tier: 1, conflictKey: 'identity.location' }),
  ].filter((id): id is string => Boolean(id));
  result.contact = { email: profile.personal.email || undefined, phone: phone || undefined, location: location || undefined, evidenceIds: contactIds };

  const addLink = (type: ProfessionalLinkType, label: string, url: string, fieldPath: string, projectId?: string) => {
    const evidenceId = add({ entityType: projectId ? 'ProjectEntry' : 'ProfileIdentity', entityId: projectId ?? profile.profileId, fieldPath, kind: 'LINK', field: type, text: url, tier: type === 'EMAIL' || type === 'PHONE' ? 0 : 1 });
    if (!evidenceId) return;
    result.professionalLinks.push({ id: stableEvidenceId('link', type, url, projectId), label, url, type, evidenceId, ...(projectId ? { projectId } : {}) });
  };
  addLink('EMAIL', 'Email', profile.personal.email, 'email');
  addLink('PHONE', 'Phone', phone, 'phone');
  addLink('LINKEDIN', 'LinkedIn', profile.personal.linkedin, 'linkedin');
  addLink('GITHUB', 'GitHub', profile.personal.github, 'github');
  addLink('PORTFOLIO', 'Portfolio', profile.personal.website, 'website');

  const entity = (id: string, label: string, details: Record<string, unknown>, evidenceIds: Array<string | null>): UnifiedEvidenceEntity => ({
    id: stableEvidenceId('entity', id), sourceEntityId: id, label, details, evidenceIds: evidenceIds.filter((value): value is string => Boolean(value)),
  });

  for (const [index, item] of profile.experience.entries()) {
    const base = add({ entityType: 'Experience', entityId: item.id, fieldPath: 'record', kind: 'EMPLOYMENT', field: 'employment', text: compact(item.jobTitle, item.company, item.startDate, item.current ? 'Present' : item.endDate), tier: 0, canonicalData: item });
    const bullets = item.achievements.map((text, bulletIndex) => add({ entityType: 'Experience', entityId: item.id, fieldPath: `achievements[${bulletIndex}]`, kind: 'ACHIEVEMENT', field: 'experience.achievement', text, tier: hasMetric(text) ? 0 : 1 }));
    const hitl = addHitlMetadata('Experience', item.id, item.evidenceMetadata, 'EMPLOYMENT', 'experience');
    result.employment.push(entity(item.id, `${item.jobTitle} — ${item.company}`, { ...item, sortOrder: index }, [base, ...bullets, ...hitl]));
  }

  for (const [index, item] of profile.projects.entries()) {
    const base = add({ entityType: 'ProjectEntry', entityId: item.id, fieldPath: 'record', kind: 'PROJECT', field: 'project', text: item.name, tier: 1, canonicalData: item });
    const bullets = item.achievements.map((text, bulletIndex) => add({ entityType: 'ProjectEntry', entityId: item.id, fieldPath: `achievements[${bulletIndex}]`, kind: 'ACHIEVEMENT', field: 'project.achievement', text, tier: hasMetric(text) ? 0 : 1 }));
    const hitl = addHitlMetadata('ProjectEntry', item.id, item.evidenceMetadata, 'PROJECT', 'project');
    result.projects.push(entity(item.id, item.name, { ...item, sortOrder: index }, [base, ...bullets, ...hitl]));
    addLink('PROJECT_LIVE', `${item.name} live`, item.liveUrl ?? '', 'liveUrl', item.id);
    addLink('PROJECT_REPOSITORY', `${item.name} repository`, item.repositoryUrl ?? '', 'repositoryUrl', item.id);
  }

  for (const [index, item] of profile.education.entries()) {
    const id = add({ entityType: 'Education', entityId: item.id, fieldPath: 'record', kind: 'EDUCATION', field: 'education', text: compact(item.degree, item.university, item.grade), tier: 0, canonicalData: item });
    const hitl = addHitlMetadata('Education', item.id, item.evidenceMetadata, 'EDUCATION', 'education');
    result.education.push(entity(item.id, `${item.degree} — ${item.university}`, { ...item, sortOrder: index }, [id, ...hitl]));
  }
  for (const group of profile.skills) for (const item of group.skillItems) {
    const id = add({ entityType: 'Skill', entityId: item.id, fieldPath: 'name', kind: 'SKILL', field: 'skill', text: item.name, tier: 1, canonicalData: item });
    if (id) result.skills.push({ ...entity(item.id, item.name, item, [id]), category: group.category, name: item.name });
  }
  for (const item of profile.certifications) {
    const id = add({ entityType: 'Certification', entityId: item.id, fieldPath: 'record', kind: 'CERTIFICATION', field: 'certification', text: compact(item.name, item.issuer, item.issueDate || item.year), tier: 1, canonicalData: item });
    const hitl = addHitlMetadata('Certification', item.id, item.evidenceMetadata, 'CERTIFICATION', 'certification');
    result.certifications.push(entity(item.id, item.name, item, [id, ...hitl]));
  }
  for (const item of profile.trainings) {
    const id = add({ entityType: 'Training', entityId: item.id, fieldPath: 'record', kind: 'TRAINING', field: 'training', text: compact(item.course, item.provider, item.result), tier: 2, canonicalData: item });
    const hitl = addHitlMetadata('Training', item.id, item.evidenceMetadata, 'TRAINING', 'training');
    result.training.push(entity(item.id, item.course, item, [id, ...hitl]));
  }
  for (const item of profile.volunteering) {
    const id = add({ entityType: 'Volunteering', entityId: item.id, fieldPath: 'record', kind: 'VOLUNTEER', field: 'volunteering', text: compact(item.role, item.organisation, item.contribution, item.outcome), tier: 2, canonicalData: item });
    const hitl = addHitlMetadata('Volunteering', item.id, item.evidenceMetadata, 'VOLUNTEER', 'volunteering');
    result.volunteerExperience.push(entity(item.id, `${item.role} — ${item.organisation}`, item, [id, ...hitl]));
  }
  for (const item of profile.openSource ?? []) {
    const id = add({ entityType: 'OpenSourceContribution', entityId: item.id, fieldPath: 'record', kind: 'OPEN_SOURCE', field: 'openSource', text: compact(item.projectName, item.role, item.description, ...item.contributions), tier: 1, canonicalData: item });
    const hitl = addHitlMetadata('OpenSourceContribution', item.id, item.evidenceMetadata, 'OPEN_SOURCE', 'openSource');
    result.openSource.push(entity(item.id, item.projectName, item, [id, ...hitl]));
    addLink('PROJECT_REPOSITORY', `${item.projectName} repository`, item.repositoryUrl, 'repositoryUrl', item.id);
    addLink('PROJECT_LIVE', `${item.projectName} project`, item.projectUrl, 'projectUrl', item.id);
  }
  for (const item of profile.otherEvidence) {
    const id = add({ entityType: 'OtherEvidence', entityId: item.id, fieldPath: 'record', kind: 'OTHER', field: 'other', text: compact(item.title, item.description, item.outcome), tier: 2, canonicalData: item });
    const hitl = addHitlMetadata('OtherEvidence', item.id, item.evidenceMetadata, 'OTHER', 'other');
    result.otherEvidence.push(entity(item.id, item.title, item, [id, ...hitl]));
  }

  return result;
}
