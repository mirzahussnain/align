/**
 * Deterministic CV content planner.
 *
 * Sits between evidence and template rendering. Given the display-ready evidence
 * payload, the resolved target occupation, the candidate's seniority and the
 * chosen template's capabilities, it decides — deterministically and testably:
 *
 *   • which sections exist (omit-empty)
 *   • the section order (occupation preset + evidence + relative order rules)
 *   • the heading label for each section (template override → default)
 *   • the skill layout (from template capability)
 *
 * It reuses the EXISTING occupation profiles (`sections.rules` +
 * `orderConstraints`) as the order source — no new occupation taxonomy is
 * introduced. Order is never globally fixed per template: two templates render
 * the same occupation in the same order but with their own headings. A template
 * may still constrain presentation via `preferredSectionOrder`, which is left
 * unset in Stage 1.
 *
 * The planner performs NO database, AI, or duration work, and never invents
 * evidence — it only selects, orders, and labels what it is handed.
 */
import type { RewrittenCVData } from '@/shared/templates/types';
import type { Classification, OccupationId, Seniority } from '@/shared/types/classification';
import { getOccupationProfile, isKnownOccupation } from '@/shared/occupations/registry';
import type { OccupationProfile } from '@/shared/occupations/types';
import {
  CV_TEMPLATE_CAPABILITIES,
  CV_TEMPLATE_CAPABILITIES_VERSION,
  type CvTemplateCapabilities,
} from '@/shared/constants/cv-template-capabilities';
import type { TemplateId } from '@/shared/constants/templates';
import { prioritizeCvContent, type CvContentPriorityPlan } from '@/shared/services/cv-content-priority';
import {
  CV_BUILD_SPEC_VERSION,
  CV_CONTENT_PLANNER_VERSION,
  type CvBuildSpec,
  type CvSectionSpec,
  type CvSectionType,
} from './types';

/** Occupation-profile section ids ↔ canonical build-spec section types. */
const SECTION_ID_TO_TYPE: Record<string, CvSectionType> = {
  'professional-summary': 'summary',
  'core-skills': 'skills',
  'professional-experience': 'experience',
  'key-projects': 'projects',
  education: 'education',
  certifications: 'certifications',
};
const TYPE_TO_SECTION_ID: Record<CvSectionType, string> = {
  summary: 'professional-summary',
  skills: 'core-skills',
  experience: 'professional-experience',
  projects: 'key-projects',
  education: 'education',
  certifications: 'certifications',
};

/** Fallback heading when a template declares no override for a section. */
const DEFAULT_HEADINGS: Record<CvSectionType, string> = {
  summary: 'Professional Summary',
  skills: 'Core Skills',
  experience: 'Professional Experience',
  projects: 'Key Projects',
  education: 'Education',
  certifications: 'Certifications',
};

/**
 * Stable universe order — used to place evidence-bearing sections the occupation
 * marks `irrelevant` (so real content is never dropped), and as the deterministic
 * tie-break when no occupation rule covers a section.
 */
const UNIVERSE_ORDER: CvSectionType[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
];

const VALID_SENIORITY = new Set<Seniority>(['entry', 'mid', 'senior', 'lead', 'unknown']);

function normaliseSeniority(value: string | null | undefined): Seniority {
  return value && VALID_SENIORITY.has(value as Seniority) ? (value as Seniority) : 'unknown';
}

/**
 * A minimal, self-consistent classification used only to evaluate an occupation
 * profile's `orderConstraints.appliesWhen` gates (which read seniority). It is
 * NOT persisted and NOT a real classifier result.
 */
function syntheticClassification(profile: OccupationProfile, seniority: Seniority): Classification {
  return {
    occupation: profile.id,
    sector: profile.sector,
    roleArchetype: profile.roleArchetype,
    applicationWorkflow: profile.applicationWorkflow,
    primaryArtifact: profile.primaryArtifact,
    secondaryArtifacts: profile.secondaryArtifacts,
    seniority,
    regulated: profile.regulated,
    confidence: 1,
    source: 'profile_target',
    reasonCodes: [],
  };
}

/** Which sections actually carry evidence in the payload. */
function sectionsWithEvidence(data: RewrittenCVData): Set<CvSectionType> {
  const present = new Set<CvSectionType>();
  if (data.professionalSummary?.trim()) present.add('summary');
  if (data.coreSkills?.some((group) => group.skills?.trim())) present.add('skills');
  if (data.experience?.length) present.add('experience');
  if (data.projects?.length) present.add('projects');
  if (data.education?.length) present.add('education');
  if (data.certifications?.length) present.add('certifications');
  return present;
}

/**
 * Stable topological ordering that honours the occupation's relative
 * `before → after` constraints. Ties break by the seed sequence's index, so the
 * result is fully deterministic. A constraint that would form a cycle is dropped
 * rather than throwing, and any node left unresolved falls back to seed order.
 */
function applyOrderConstraints(
  seed: CvSectionType[],
  edges: Array<[CvSectionType, CvSectionType]>
): CvSectionType[] {
  const seedIndex = new Map(seed.map((type, i) => [type, i]));
  const present = new Set(seed);

  const successors = new Map<CvSectionType, Set<CvSectionType>>(seed.map((t) => [t, new Set()]));
  const indegree = new Map<CvSectionType, number>(seed.map((t) => [t, 0]));

  for (const [before, after] of edges) {
    if (!present.has(before) || !present.has(after) || before === after) continue;
    const succ = successors.get(before)!;
    if (succ.has(after)) continue;
    succ.add(after);
    indegree.set(after, (indegree.get(after) ?? 0) + 1);
  }

  const bySeedIndex = (a: CvSectionType, b: CvSectionType) => seedIndex.get(a)! - seedIndex.get(b)!;
  const ready = seed.filter((t) => (indegree.get(t) ?? 0) === 0).sort(bySeedIndex);
  const result: CvSectionType[] = [];
  const done = new Set<CvSectionType>();

  while (ready.length > 0) {
    const next = ready.shift()!;
    result.push(next);
    done.add(next);
    for (const succ of [...successors.get(next)!].sort(bySeedIndex)) {
      indegree.set(succ, (indegree.get(succ) ?? 0) - 1);
      if ((indegree.get(succ) ?? 0) === 0) {
        ready.push(succ);
      }
    }
    ready.sort(bySeedIndex);
  }

  // Cycle safety: append anything unresolved in seed order.
  if (result.length < seed.length) {
    for (const type of seed) if (!done.has(type)) result.push(type);
  }
  return result;
}

/**
 * The occupation-driven, evidence-filtered section order. Occupation rules set
 * the base sequence (skipping `irrelevant` sections); evidence-bearing sections
 * the occupation does not mention are appended in universe order rather than
 * dropped; then relative order constraints are applied.
 */
function planSectionOrder(
  profile: OccupationProfile,
  present: Set<CvSectionType>,
  classification: Classification
): CvSectionType[] {
  // Base: occupation rule order, minus irrelevant, minus empty.
  const base: CvSectionType[] = [];
  for (const rule of profile.sections.rules) {
    const type = SECTION_ID_TO_TYPE[rule.section];
    if (!type || rule.presence === 'irrelevant') continue;
    if (present.has(type) && !base.includes(type)) base.push(type);
  }
  // Never drop real evidence the occupation happens not to list (or marks
  // irrelevant): append it in universe order.
  for (const type of UNIVERSE_ORDER) {
    if (present.has(type) && !base.includes(type)) base.push(type);
  }

  const edges = profile.sections.orderConstraints
    .filter((constraint) => !constraint.appliesWhen || constraint.appliesWhen(classification))
    .map((constraint): [CvSectionType, CvSectionType] | null => {
      const before = SECTION_ID_TO_TYPE[constraint.before];
      const after = SECTION_ID_TO_TYPE[constraint.after];
      return before && after ? [before, after] : null;
    })
    .filter((edge): edge is [CvSectionType, CvSectionType] => edge !== null);

  return applyOrderConstraints(base, edges);
}

function headingFor(type: CvSectionType, capability: CvTemplateCapabilities): string {
  return capability.headingLabels?.[type] ?? DEFAULT_HEADINGS[type];
}

/** Build one typed, heading-labelled section spec from the payload. */
function buildSection(
  type: CvSectionType,
  data: RewrittenCVData,
  capability: CvTemplateCapabilities
): CvSectionSpec {
  const heading = headingFor(type, capability);
  switch (type) {
    case 'summary':
      return { type, heading, text: data.professionalSummary };
    case 'skills':
      return {
        type,
        heading,
        layout: capability.skillLayout,
        groups: data.coreSkills.map((group) => ({ category: group.category, skills: group.skills })),
      };
    case 'experience':
      return {
        type,
        heading,
        entries: data.experience.map((entry) => ({
          jobTitle: entry.jobTitle,
          company: entry.company,
          location: entry.location,
          type: entry.type,
          startDate: entry.startDate,
          endDate: entry.endDate,
          achievements: entry.achievements.map((a) => ({ label: a.label, body: a.body })),
        })),
      };
    case 'projects':
      return {
        type,
        heading,
        entries: data.projects.map((entry) => ({
          name: entry.name,
          skills: entry.skills,
          startDate: entry.startDate,
          endDate: entry.endDate,
          achievements: entry.achievements.map((a) => ({ label: a.label, body: a.body })),
        })),
      };
    case 'education':
      return {
        type,
        heading,
        entries: data.education.map((entry) => ({
          degree: entry.degree,
          university: entry.university,
          startDate: entry.startDate,
          endDate: entry.endDate,
          grade: entry.grade,
          description: entry.description,
        })),
      };
    case 'certifications':
      return {
        type,
        heading,
        entries: data.certifications.map((entry) => ({
          name: entry.name,
          issuer: entry.issuer,
          year: entry.year,
        })),
      };
  }
}

export interface PlanCvBuildSpecParams {
  /** The display-ready evidence payload both generation paths already produce. */
  data: RewrittenCVData;
  templateId: TemplateId;
  /** Resolved target occupation; unknown/absent values fall back to `generic`. */
  occupationId?: string | null;
  /** Target role title carried for provenance only. */
  role?: string | null;
  /** Where the target came from (provenance only). */
  targetSource?: string | null;
  /** Candidate seniority, used to gate education-first / projects-first rules. */
  seniority?: string | null;
  /** Accepted deterministic priority result; omitted for profile-only generation. */
  contentPlan?: CvContentPriorityPlan;
}

/**
 * Produce the canonical `CvBuildSpec` from the evidence payload. This is the
 * single conversion both generation routes call before rendering.
 */
export function planCvBuildSpec(params: PlanCvBuildSpecParams): CvBuildSpec {
  const { templateId } = params;
  const occupationId: OccupationId = isKnownOccupation(params.occupationId)
    ? params.occupationId
    : 'generic';
  const profile = getOccupationProfile(occupationId);
  const capability = CV_TEMPLATE_CAPABILITIES[templateId];
  const contentPlan = params.contentPlan ?? prioritizeCvContent({
    data: params.data,
    pageLengthExpectation: capability.pageLengthExpectation,
    groupSkills: false,
  });
  const data = contentPlan.data;
  const seniority = normaliseSeniority(params.seniority);
  const classification = syntheticClassification(profile, seniority);

  const present = sectionsWithEvidence(data);
  const ordered = planSectionOrder(profile, present, classification);

  // Template presentation limits: drop sections the template cannot present.
  const supported = new Set(capability.supportedSections);
  const unsupportedByTemplate: CvSectionType[] = [];
  const finalTypes: CvSectionType[] = [];
  for (const type of ordered) {
    if (supported.has(type)) finalTypes.push(type);
    else unsupportedByTemplate.push(type);
  }

  // A template may impose its own order (unset in Stage 1); when it does, it
  // reorders only the sections already selected — it never adds or removes.
  const presentation = capability.preferredSectionOrder;
  const orderedTypes = presentation
    ? [...finalTypes].sort(
        (a, b) => presentation.indexOf(a) - presentation.indexOf(b)
      )
    : finalTypes;

  const sections = orderedTypes.map((type) => buildSection(type, data, capability));

  const omittedEmptySections = UNIVERSE_ORDER.filter((type) => !present.has(type));
  const summaryExceedsBudget = (data.professionalSummary?.trim().length ?? 0) > capability.summaryMaxChars;

  return {
    version: CV_BUILD_SPEC_VERSION,
    identity: {
      fullName: data.fullName,
      headline: data.tagline,
      contact: { ...data.contact },
    },
    target: {
      occupationId,
      role: params.role ?? null,
      targetSource: params.targetSource ?? null,
    },
    sections,
    presentation: {
      templateId,
      skillLayout: capability.skillLayout,
      dateStyle: capability.dateStyle,
      pageLengthExpectation: capability.pageLengthExpectation,
      densityMode: contentPlan.density.mode,
      compactSections: contentPlan.density.compactSections,
    },
    provenance: {
      plannerVersion: CV_CONTENT_PLANNER_VERSION,
      capabilityVersion: CV_TEMPLATE_CAPABILITIES_VERSION,
      occupationId,
      roleArchetype: profile.roleArchetype,
      sectionOrder: orderedTypes,
      omittedEmptySections,
      unsupportedByTemplate,
      summaryExceedsBudget,
      priorityAlgorithmVersion: contentPlan.version,
      bulletPriorityDecisions: contentPlan.bulletDecisions,
      skillsGroupingDecisions: contentPlan.skillsDecisions,
      duplicatesRemoved: contentPlan.duplicatesRemoved,
      pageDensityDecision: contentPlan.density,
      optionalContentMovedLater: contentPlan.optionalContentMovedLater,
      omittedRedundantContent: contentPlan.omittedRedundantContent,
    },
  };
}

/** Exposed for tests: the canonical section-id ↔ type maps. */
export { SECTION_ID_TO_TYPE, TYPE_TO_SECTION_ID, DEFAULT_HEADINGS };
