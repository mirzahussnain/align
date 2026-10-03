import type { TemplateId } from '@/shared/constants/templates';
import type { ApprovedCvPlan, CvPlanSection, ProfessionalLink, UnifiedCandidateEvidence, UnifiedEvidenceEntity } from './types';
import { validateRewritePatches } from './rewrite-validator';
import { isPatchableEvidence } from './patchable-evidence';

export const CV_BUILD_SPEC_V2_VERSION = 3 as const;

export interface CvBuildLineV2 { evidenceId: string; text: string }
export interface CvBuildEntryV2 {
  id: string; title: string; subtitle?: string; startDate?: string; endDate?: string;
  evidenceIds: string[]; metadata?: Array<{ label: string; value: string }>; lines: CvBuildLineV2[]; links: ProfessionalLink[];
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

const STRUCTURAL_DETAIL_KEYS = new Set(['id', 'name', 'title', 'jobTitle', 'course', 'officialName', 'projectName', 'startDate', 'endDate', 'issueDate', 'expiryDate', 'year', 'current', 'liveUrl', 'repositoryUrl', 'projectUrl', 'achievements', 'evidenceMetadata', 'sortOrder', 'sourceOrder']);

function detailLabel(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

function renderableMetadata(entity: UnifiedEvidenceEntity): Array<{ label: string; value: string }> {
  const values = Object.entries(entity.details).flatMap(([key, value]) => {
    if (STRUCTURAL_DETAIL_KEYS.has(key) || value == null || value === '') return [];
    const rendered = Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(', ')
      : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    return rendered ? [{ label: detailLabel(key), value: rendered }] : [];
  });
  if ('category' in entity && typeof entity.category === 'string' && entity.category.trim()) {
    values.unshift({ label: 'Category', value: entity.category });
  }
  return values;
}

function toEntry(entity: UnifiedEvidenceEntity, evidence: UnifiedCandidateEvidence, selected: Set<string>, patches: Map<string, string>): CvBuildEntryV2 | null {
  const evidenceIds = entity.evidenceIds.filter((id) => selected.has(id));
  if (!evidenceIds.length) return null;
  const patchableIds = evidenceIds.filter((id) => isPatchableEvidence(evidence.evidenceById[id]));
  const lines = patchableIds.map((id) => ({ evidenceId: id, text: patches.get(id) ?? evidence.evidenceById[id].canonicalText }));
  const details = entity.details;
  return {
    id: entity.id, title: entity.label,
    subtitle: strings(details, ['location', 'provider', 'issuer', 'grade', 'role']),
    startDate: strings(details, ['startDate', 'issueDate', 'year']), endDate: details.current === true ? 'Present' : strings(details, ['endDate', 'expiryDate']),
    evidenceIds, metadata: renderableMetadata(entity), lines,
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
      const entries = summaryIds.map((id) => ({ id, title: '', evidenceIds: [id], metadata: [], lines: [{ evidenceId: id, text: patches.get(id) ?? args.evidence.evidenceById[id].canonicalText }], links: [] }));
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
  const rendered = renderedEvidenceIds(spec);
  return spec.provenance.approvedEvidenceIds.filter((id) => evidence.evidenceById[id]?.preservationTier <= 1 && !rendered.has(id));
}

function renderedEvidenceIds(spec: CvBuildSpecV2): Set<string> {
  const rendered = new Set(spec.sections.flatMap((section) => section.entries.flatMap((entry) => entry.evidenceIds)));
  for (const id of spec.identity.evidenceIds) rendered.add(id);
  for (const link of spec.links) rendered.add(link.evidenceId);
  for (const section of spec.sections) for (const entry of section.entries) for (const link of entry.links) rendered.add(link.evidenceId);
  return rendered;
}

export interface CvBuildValidationIssue {
  evidenceId: string;
  code: 'TRUTH_VALIDATION_FAILED' | 'PROVENANCE_VALIDATION_FAILED' | 'PRESERVATION_VALIDATION_FAILED';
}

export interface CvBuildValidationResult {
  ok: boolean;
  truth: CvBuildValidationIssue[];
  provenance: CvBuildValidationIssue[];
  preservation: CvBuildValidationIssue[];
}

export function validateBuildSpec(spec: CvBuildSpecV2, evidence: UnifiedCandidateEvidence, plan: ApprovedCvPlan): CvBuildValidationResult {
  const approved = new Set([...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]);
  const truth: CvBuildValidationIssue[] = [];
  const provenance: CvBuildValidationIssue[] = [];
  const checkedProvenance = new Set<string>();
  const checkProvenance = (evidenceId: string) => {
    if (checkedProvenance.has(evidenceId)) return;
    checkedProvenance.add(evidenceId);
    if (!approved.has(evidenceId) || !evidence.evidenceById[evidenceId]) {
      provenance.push({ evidenceId, code: 'PROVENANCE_VALIDATION_FAILED' });
    }
  };
  for (const id of spec.identity.evidenceIds) checkProvenance(id);
  for (const link of spec.links) checkProvenance(link.evidenceId);
  for (const section of spec.sections) {
    for (const entry of section.entries) {
      for (const id of entry.evidenceIds) checkProvenance(id);
      for (const link of entry.links) checkProvenance(link.evidenceId);
      for (const line of entry.lines) {
        checkProvenance(line.evidenceId);
        const item = evidence.evidenceById[line.evidenceId];
        if (!item) {
          truth.push({ evidenceId: line.evidenceId, code: 'TRUTH_VALIDATION_FAILED' });
          continue;
        }
        const validation = validateRewritePatches({
          schemaVersion: 1,
          patches: [{ evidenceId: line.evidenceId, text: line.text, sourceEvidenceIds: [line.evidenceId] }],
        }, evidence, plan);
        if (!validation.patches.has(line.evidenceId)) truth.push({ evidenceId: line.evidenceId, code: 'TRUTH_VALIDATION_FAILED' });
      }
    }
  }
  const rendered = renderedEvidenceIds(spec);
  const preservation = [...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]
    .filter((id) => !rendered.has(id))
    .map((evidenceId) => ({ evidenceId, code: 'PRESERVATION_VALIDATION_FAILED' as const }));
  return { ok: truth.length === 0 && provenance.length === 0 && preservation.length === 0, truth, provenance, preservation };
}
