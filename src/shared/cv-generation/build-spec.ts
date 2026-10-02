import type { TemplateId } from '@/shared/constants/templates';
import type { ApprovedCvPlan, CvPlanSection, ProfessionalLink, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from './types';

export const CV_BUILD_SPEC_V2_VERSION = 3 as const;

export interface CvBuildLineV2 { evidenceId: string; text: string }
export interface CvBuildEntryV2 {
  id: string; title: string; subtitle?: string; startDate?: string; endDate?: string;
  evidenceIds: string[]; lines: CvBuildLineV2[]; links: ProfessionalLink[];
}
export interface CvBuildSectionV2 { type: CvPlanSection; heading: string; entries: CvBuildEntryV2[] }
export interface CvBuildSpecV2 {
  version: typeof CV_BUILD_SPEC_V2_VERSION;
  generationId: string;
  identity: { fullName: string; headline?: string; email?: string; phone?: string; location?: string; evidenceIds: string[] };
  links: ProfessionalLink[];
  sections: CvBuildSectionV2[];
  presentation: { templateId: TemplateId; density: ApprovedCvPlan['density']; targetLength: ApprovedCvPlan['targetLength'] };
  provenance: { approvedEvidenceIds: string[]; omittedEvidenceIds: string[]; sourceMode: ApprovedCvPlan['sourceMode']; atsStrategy: ApprovedCvPlan['atsStrategy'] };
}

const headings: Record<CvPlanSection, string> = {
  PROFILE: 'Profile', EXECUTIVE_SUMMARY: 'Executive Summary', CORE_EXPERTISE: 'Core Expertise', EXPERIENCE: 'Experience',
  SELECTED_IMPACT: 'Selected Impact', SKILLS: 'Skills', PROJECTS: 'Projects', EDUCATION: 'Education',
  CERTIFICATIONS: 'Certifications', TRAINING: 'Training', VOLUNTEERING: 'Volunteering', OPEN_SOURCE: 'Open Source', OTHER: 'Additional Evidence',
};

const strings = (details: Record<string, unknown>, keys: string[]) => keys.map((key) => details[key]).find((value): value is string => typeof value === 'string' && value.trim().length > 0);

function toEntry(entity: UnifiedEvidenceEntity, evidence: UnifiedCandidateEvidence, selected: Set<string>, patches: Map<string, string>): CvBuildEntryV2 | null {
  const evidenceIds = entity.evidenceIds.filter((id) => selected.has(id));
  if (!evidenceIds.length) return null;
  const baseIds = new Set(evidenceIds.filter((id) => evidence.evidenceById[id]?.canonicalData));
  const lines = evidenceIds.filter((id) => !baseIds.has(id)).map((id) => ({ evidenceId: id, text: patches.get(id) ?? evidence.evidenceById[id].canonicalText }));
  const details = entity.details;
  return {
    id: entity.id, title: entity.label,
    subtitle: strings(details, ['location', 'provider', 'issuer', 'grade', 'role']),
    startDate: strings(details, ['startDate', 'issueDate', 'year']), endDate: strings(details, ['endDate', 'expiryDate']),
    evidenceIds, lines,
    links: evidence.professionalLinks.filter((link) => link.projectId && (link.projectId === entity.id || link.projectId === entity.sourceEntityId) && selected.has(link.evidenceId)),
  };
}

function entitiesFor(section: CvPlanSection, evidence: UnifiedCandidateEvidence): UnifiedEvidenceEntity[] {
  if (section === 'EXPERIENCE' || section === 'SELECTED_IMPACT') return evidence.employment;
  if (section === 'PROJECTS') return evidence.projects;
  if (section === 'EDUCATION') return evidence.education;
  if (section === 'CERTIFICATIONS') return evidence.certifications;
  if (section === 'TRAINING') return evidence.training;
  if (section === 'VOLUNTEERING') return evidence.volunteerExperience;
  if (section === 'OPEN_SOURCE') return evidence.openSource;
  if (section === 'SKILLS' || section === 'CORE_EXPERTISE') return evidence.skills;
  if (section === 'OTHER') return evidence.otherEvidence;
  return [];
}

export function assembleCvBuildSpec(args: { generationId: string; evidence: UnifiedCandidateEvidence; plan: ApprovedCvPlan; templateId: TemplateId; patches?: Map<string, string> }): CvBuildSpecV2 {
  const selected = new Set([...args.plan.includedEvidenceIds, ...args.plan.optionalEvidenceIds]);
  const patches = args.patches ?? new Map<string, string>();
  const sections: CvBuildSectionV2[] = [];
  for (const section of args.plan.sectionOrder) {
    if (section === 'PROFILE' || section === 'EXECUTIVE_SUMMARY') {
      const summaryIds = [...selected].filter((id) => args.evidence.evidenceById[id]?.field === 'summary');
      const entries = summaryIds.map((id) => ({ id, title: '', evidenceIds: [id], lines: [{ evidenceId: id, text: patches.get(id) ?? args.evidence.evidenceById[id].canonicalText }], links: [] }));
      if (entries.length) sections.push({ type: section, heading: headings[section], entries });
      continue;
    }
    const entries = entitiesFor(section, args.evidence).map((entity) => toEntry(entity, args.evidence, selected, patches)).filter((entry): entry is CvBuildEntryV2 => Boolean(entry));
    if (entries.length) sections.push({ type: section, heading: headings[section], entries });
  }
  const selectedLinks = args.evidence.professionalLinks.filter((link) => selected.has(link.evidenceId));
  return {
    version: CV_BUILD_SPEC_V2_VERSION, generationId: args.generationId,
    identity: {
      fullName: args.evidence.identity.fullName ?? '', headline: args.evidence.identity.headline,
      email: args.evidence.contact.email, phone: args.evidence.contact.phone, location: args.evidence.contact.location,
      evidenceIds: [...new Set([...(args.evidence.identity.evidenceIds ?? []), ...(args.evidence.contact.evidenceIds ?? [])].filter((id) => selected.has(id)))],
    },
    links: selectedLinks.filter((link) => !link.projectId), sections,
    presentation: { templateId: args.templateId, density: args.plan.density, targetLength: args.plan.targetLength },
    provenance: { approvedEvidenceIds: [...selected], omittedEvidenceIds: args.plan.omittedEvidence.map((item) => item.evidenceId), sourceMode: args.plan.sourceMode, atsStrategy: args.plan.atsStrategy },
  };
}

export function validateBuildSpecPreservation(spec: CvBuildSpecV2, evidence: UnifiedCandidateEvidence): string[] {
  const rendered = new Set(spec.sections.flatMap((section) => section.entries.flatMap((entry) => entry.evidenceIds)));
  for (const id of spec.identity.evidenceIds) rendered.add(id);
  for (const link of spec.links) rendered.add(link.evidenceId);
  for (const section of spec.sections) for (const entry of section.entries) for (const link of entry.links) rendered.add(link.evidenceId);
  return spec.provenance.approvedEvidenceIds.filter((id) => evidence.evidenceById[id]?.preservationTier <= 1 && !rendered.has(id));
}
