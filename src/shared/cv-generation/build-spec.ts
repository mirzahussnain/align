import type { TemplateId } from '@/shared/constants/templates';
import { dedupePresentationLines, normalizeEntitySections, type NormalizationInput } from './presentation-normalization';
import { normalizePresentationSkills } from './presentation-skills';
import { normalizePresentationIdentity, normalizeProfessionalUrl, normalizeProjectLinks } from './presentation-links';
import { normalizeIdentityText } from './entity-identity';
import { validateRewritePatches } from './rewrite-validator';
import type { ApprovedCvPlan, CvPlanSection, UnifiedCandidateEvidence } from './types';
import type { NormalizationAuthorityContext } from './presentation-authority';
import { CV_BUILD_SPEC_V2_VERSION, type CvBuildSectionV2, type CvBuildSpecV2, type CvPresentationLine } from './build-spec-types';

export * from './build-spec-types';

const headings: Record<CvPlanSection, string> = {
  PROFILE: 'Profile', EXECUTIVE_SUMMARY: 'Executive Summary', CORE_EXPERTISE: 'Core Expertise', EXPERIENCE: 'Experience',
  SELECTED_IMPACT: 'Selected Impact', SKILLS: 'Skills', PROJECTS: 'Projects', EDUCATION: 'Education',
  CERTIFICATIONS: 'Certifications', TRAINING: 'Training', VOLUNTEERING: 'Volunteering', OPEN_SOURCE: 'Open Source', OTHER: 'Additional Evidence',
};

export function assembleCvBuildSpec(args: {
  generationId: string;
  evidence: UnifiedCandidateEvidence;
  plan: ApprovedCvPlan;
  templateId: TemplateId;
  patches?: Map<string, string>;
  authorityContext?: NormalizationAuthorityContext;
}): CvBuildSpecV2 {
  const selectedEvidenceIds = new Set([...args.plan.includedEvidenceIds, ...args.plan.optionalEvidenceIds]);
  const input: NormalizationInput = {
    evidence: args.evidence,
    selectedEvidenceIds,
    patches: args.patches ?? new Map(),
    authorityContext: args.authorityContext ?? {},
  };
  const entities = normalizeEntitySections(input);
  const skills = normalizePresentationSkills({ ...input, sparseSkillArtifacts: entities.sparseSkillArtifacts });
  const identity = normalizePresentationIdentity(input);
  const normalizedLinks = normalizeProjectLinks(args.evidence.professionalLinks, entities.entityAliasIndex, selectedEvidenceIds);
  for (const project of entities.projects) project.links = normalizedLinks.projectLinks.get(project.id) ?? [];
  for (const project of entities.openSource) project.links = normalizedLinks.projectLinks.get(project.id) ?? [];

  const summaryItems = [...selectedEvidenceIds].map((id) => args.evidence.evidenceById[id]).filter((item) => item?.field === 'summary');
  const summary = dedupePresentationLines(summaryItems, input.patches, input.authorityContext);
  const selectedImpact = entities.experience.filter(({ lines }) => lines.length > 0).map(({ id, title, employer, lines }) => ({ id, heading: `${title} — ${employer}`, lines }));

  const sections = args.plan.sectionOrder.map((type): CvBuildSectionV2 => {
    const heading = headings[type];
    switch (type) {
      case 'PROFILE': case 'EXECUTIVE_SUMMARY': return { type, heading, lines: summary.lines };
      case 'SELECTED_IMPACT': return { type, heading, items: selectedImpact };
      case 'CORE_EXPERTISE': case 'SKILLS': return { type, heading, items: skills.groups };
      case 'EXPERIENCE': return { type, heading, items: entities.experience };
      case 'PROJECTS': return { type, heading, items: entities.projects };
      case 'EDUCATION': return { type, heading, items: entities.education };
      case 'CERTIFICATIONS': return { type, heading, items: entities.certifications };
      case 'TRAINING': return { type, heading, items: entities.training };
      case 'VOLUNTEERING': return { type, heading, items: entities.volunteering };
      case 'OPEN_SOURCE': return { type, heading, items: entities.openSource };
      case 'OTHER': return { type, heading, items: entities.other };
    }
  });

  const allBindings = [...identity.bindings, ...entities.bindings, ...skills.bindings, ...normalizedLinks.bindings, ...summary.bindings];
  const visibleNodeIds = new Set(identity.bindings.map(({ nodeId }) => nodeId));
  for (const link of normalizedLinks.links) visibleNodeIds.add(`link:${link.id}`);
  for (const section of sections) {
    if ('lines' in section) for (const line of section.lines) visibleNodeIds.add(`line:${line.id}`);
    else for (const item of section.items) {
      visibleNodeIds.add(item.id);
      if ('lines' in item) for (const line of item.lines) visibleNodeIds.add(`line:${line.id}`);
      if ('links' in item) for (const link of item.links) visibleNodeIds.add(`link:${link.id}`);
      if ('skills' in item) for (const skill of item.skills) visibleNodeIds.add(skill.id);
    }
  }
  const evidenceBindings = allBindings.filter(({ nodeId }) => visibleNodeIds.has(nodeId));
  return {
    version: CV_BUILD_SPEC_V2_VERSION,
    generationId: args.generationId,
    identity: identity.identity,
    links: normalizedLinks.links,
    sections,
    evidenceBindings,
    normalizationIssues: entities.issues,
    presentation: { templateId: args.templateId, density: args.plan.density, targetLength: args.plan.targetLength },
    provenance: {
      approvedEvidenceIds: [...selectedEvidenceIds], omittedEvidenceIds: args.plan.omittedEvidence.map(({ evidenceId }) => evidenceId),
      sourceMode: args.plan.sourceMode, atsStrategy: args.plan.atsStrategy,
    },
  };
}

function boundEvidenceIds(spec: CvBuildSpecV2): Set<string> {
  return new Set(spec.evidenceBindings.flatMap(({ evidenceIds }) => evidenceIds));
}

export function validateBuildSpecPreservation(spec: CvBuildSpecV2, _evidence: UnifiedCandidateEvidence): string[] {
  void _evidence;
  const bound = boundEvidenceIds(spec);
  return spec.provenance.approvedEvidenceIds.filter((id) => !bound.has(id));
}

export interface CvBuildValidationIssue {
  evidenceId: string;
  code: 'TRUTH_VALIDATION_FAILED' | 'PROVENANCE_VALIDATION_FAILED' | 'PRESERVATION_VALIDATION_FAILED' | 'AMBIGUOUS_EVIDENCE_ENTITY' | 'UNRESOLVED_EVIDENCE_ENTITY';
}

export interface CvBuildValidationResult {
  ok: boolean;
  truth: CvBuildValidationIssue[];
  provenance: CvBuildValidationIssue[];
  preservation: CvBuildValidationIssue[];
}

function presentationLines(spec: CvBuildSpecV2): CvPresentationLine[] {
  return spec.sections.flatMap((section) => 'lines' in section ? section.lines : section.items.flatMap((item) => 'lines' in item ? item.lines : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function recordsForBinding(evidenceIds: string[], evidence: UnifiedCandidateEvidence): Record<string, unknown>[] {
  const selected = new Set(evidenceIds);
  const records = evidenceIds.flatMap((id) => {
    const data = evidence.evidenceById[id]?.canonicalData;
    return isRecord(data) ? [data] : [];
  });
  const entities = [evidence.employment, evidence.projects, evidence.education, evidence.certifications, evidence.training, evidence.volunteerExperience, evidence.openSource, evidence.otherEvidence];
  for (const entity of entities.flat()) if (entity.evidenceIds.some((id) => selected.has(id))) records.push(entity.details);
  for (const skill of evidence.skills) if (skill.evidenceIds.some((id) => selected.has(id))) records.push({ ...skill.details, name: skill.name, category: skill.category });
  if ((evidence.identity.evidenceIds ?? []).some((id) => selected.has(id))) records.push(evidence.identity as unknown as Record<string, unknown>);
  if ((evidence.contact.evidenceIds ?? []).some((id) => selected.has(id))) records.push(evidence.contact as unknown as Record<string, unknown>);
  for (const link of evidence.professionalLinks) if (selected.has(link.evidenceId)) records.push(link as unknown as Record<string, unknown>);
  return records;
}

function supportsField(records: Record<string, unknown>[], presented: unknown, keys: string[]): boolean {
  if (presented === undefined || presented === null || presented === '') return true;
  const expected = normalizeIdentityText(presented);
  return records.some((record) => keys.some((key) => record[key] !== undefined && record[key] !== null && normalizeIdentityText(record[key]) === expected));
}

function structuralTruthIssues(spec: CvBuildSpecV2, evidence: UnifiedCandidateEvidence): CvBuildValidationIssue[] {
  const issues: CvBuildValidationIssue[] = [];
  const check = (nodeId: string, fields: Array<[unknown, string[]]>, extra?: (records: Record<string, unknown>[]) => boolean) => {
    const binding = spec.evidenceBindings.find((candidate) => candidate.nodeId === nodeId);
    if (!binding) return;
    const records = recordsForBinding(binding.evidenceIds, evidence);
    if (fields.some(([value, keys]) => !supportsField(records, value, keys)) || (extra && !extra(records))) {
      const structuralEvidenceId = binding.evidenceIds.find((id) => isRecord(evidence.evidenceById[id]?.canonicalData));
      issues.push({ evidenceId: binding.representativeEvidenceId ?? structuralEvidenceId ?? binding.evidenceIds[0] ?? nodeId, code: 'TRUTH_VALIDATION_FAILED' });
    }
  };
  for (const key of ['fullName', 'headline', 'email', 'phone', 'location'] as const) check(`identity:${key}`, [[spec.identity[key], [key]]]);
  const checkLinks = (links: CvBuildSpecV2['links']) => {
    for (const link of links) check(`link:${link.id}`, [[link.label, ['label']], [link.type, ['type']]], (records) => records.some((record) => typeof record.url === 'string' && normalizeProfessionalUrl(record.url) === normalizeProfessionalUrl(link.url)));
  };
  checkLinks(spec.links);
  for (const section of spec.sections) {
    switch (section.type) {
      case 'PROFILE': case 'EXECUTIVE_SUMMARY': case 'SELECTED_IMPACT': break;
      case 'CORE_EXPERTISE': case 'SKILLS':
        for (const group of section.items) for (const skill of group.skills) check(skill.id, [[skill.name, ['name']], [group.category, ['category']]]);
        break;
      case 'EXPERIENCE':
        for (const item of section.items) { check(item.id, [[item.title, ['title', 'jobTitle']], [item.employer, ['employer', 'company']], [item.location, ['location']], [item.employmentType, ['employmentType', 'type']], [item.startDate, ['startDate']], [item.endDate, ['endDate']], [item.current, ['current']]]); checkLinks(item.links); }
        break;
      case 'PROJECTS':
        for (const item of section.items) { check(item.id, [[item.name, ['name', 'projectName']], [item.subtitle, ['subtitle', 'description', 'purpose']], [item.startDate, ['startDate']], [item.endDate, ['endDate']]], (records) => item.technologies.every((technology) => records.some((record) => Array.isArray(record.technologies) && record.technologies.some((value) => typeof value === 'string' && normalizeIdentityText(value) === normalizeIdentityText(technology))))); checkLinks(item.links); }
        break;
      case 'EDUCATION':
        for (const item of section.items) { check(item.id, [[item.degree, ['degree', 'qualification']], [item.institution, ['university', 'institution']], [item.location, ['location']], [item.startDate, ['startDate']], [item.endDate, ['endDate']], [item.grade, ['grade']]]); checkLinks(item.links); }
        break;
      case 'CERTIFICATIONS':
        for (const item of section.items) { check(item.id, [[item.name, ['name', 'officialName']], [item.issuer, ['issuer', 'issuingBody']], [item.issueDate, ['issueDate']], [item.expiryDate, ['expiryDate']], [item.credentialId, ['credentialId', 'credentialNumber']], [item.credentialUrl, ['credentialUrl', 'verificationUrl']]]); checkLinks(item.links); }
        break;
      case 'TRAINING':
        for (const item of section.items) { check(item.id, [[item.course, ['course']], [item.provider, ['provider']], [item.field, ['field']], [item.status, ['status']], [item.startDate, ['startDate']], [item.endDate, ['endDate']], [item.result, ['result']]]); checkLinks(item.links); }
        break;
      case 'VOLUNTEERING':
        for (const item of section.items) { check(item.id, [[item.role, ['role']], [item.organisation, ['organisation', 'organization']], [item.startDate, ['startDate']], [item.endDate, ['endDate']]]); checkLinks(item.links); }
        break;
      case 'OPEN_SOURCE':
        for (const item of section.items) { check(item.id, [[item.projectName, ['projectName', 'name']], [item.role, ['role']], [item.repositoryUrl, ['repositoryUrl']], [item.projectUrl, ['projectUrl']], [item.startDate, ['startDate']], [item.endDate, ['endDate']], [item.description, ['description']]], (records) => item.technologies.every((technology) => records.some((record) => Array.isArray(record.technologies) && record.technologies.some((value) => typeof value === 'string' && normalizeIdentityText(value) === normalizeIdentityText(technology))))); checkLinks(item.links); }
        break;
      case 'OTHER':
        for (const item of section.items) { check(item.id, [[item.title, ['title']], [item.context, ['context']], [item.period, ['period']]]); checkLinks(item.links); }
        break;
    }
  }
  return issues;
}

export function validateBuildSpec(spec: CvBuildSpecV2, evidence: UnifiedCandidateEvidence, plan: ApprovedCvPlan): CvBuildValidationResult {
  const approved = new Set([...plan.includedEvidenceIds, ...plan.optionalEvidenceIds]);
  const truth: CvBuildValidationIssue[] = [...spec.normalizationIssues.map(({ evidenceId, code }) => ({ evidenceId, code })), ...structuralTruthIssues(spec, evidence)];
  const provenance: CvBuildValidationIssue[] = [];
  const seenProvenance = new Set<string>();
  for (const evidenceId of spec.evidenceBindings.flatMap(({ evidenceIds }) => evidenceIds)) {
    if (seenProvenance.has(evidenceId)) continue;
    seenProvenance.add(evidenceId);
    if (!approved.has(evidenceId) || !evidence.evidenceById[evidenceId]) provenance.push({ evidenceId, code: 'PROVENANCE_VALIDATION_FAILED' });
  }
  for (const line of presentationLines(spec)) {
    const binding = spec.evidenceBindings.find(({ nodeId }) => nodeId === `line:${line.id}`);
    const representativeEvidenceId = binding?.representativeEvidenceId ?? line.id;
    if (!binding || !evidence.evidenceById[representativeEvidenceId]) {
      truth.push({ evidenceId: representativeEvidenceId, code: 'TRUTH_VALIDATION_FAILED' });
      continue;
    }
    const validated = validateRewritePatches({ schemaVersion: 1, patches: [{ evidenceId: representativeEvidenceId, text: line.text, sourceEvidenceIds: [representativeEvidenceId] }] }, evidence, plan);
    if (!validated.patches.has(representativeEvidenceId)) truth.push({ evidenceId: representativeEvidenceId, code: 'TRUTH_VALIDATION_FAILED' });
  }
  const preservation = validateBuildSpecPreservation(spec, evidence).map((evidenceId) => ({ evidenceId, code: 'PRESERVATION_VALIDATION_FAILED' as const }));
  return { ok: truth.length === 0 && provenance.length === 0 && preservation.length === 0, truth, provenance, preservation };
}
