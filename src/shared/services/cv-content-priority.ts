import type { RewrittenCVData } from '@/shared/templates/types';
import type {
  RewriteRequirement,
  RewriteSourceRef,
} from '@/shared/types/cv-rewrite';
import { extractImpactMetrics, normalizeText } from './cv-evidence';

export const CV_CONTENT_PRIORITY_VERSION = 1;

export type ContentPriority = 'essential' | 'high' | 'normal' | 'low';
export type PageDensityMode = 'normal' | 'compact' | 'highly_compact' | 'likely_multi_page';

export interface BulletPriorityDecision {
  sourcePath: string;
  priority: ContentPriority;
  reasons: string[];
  originalIndex: number;
  finalIndex: number | null;
}

export interface RemovedDuplicateDecision {
  sourcePath: string;
  duplicateOf: string;
  normalizedText: string;
}

export interface SkillsGroupingDecision {
  displayName: string;
  group: 'role_critical_verified' | 'additional_verified';
  sourcePath: string;
  priority: ContentPriority;
}

export interface PageDensityDecision {
  mode: PageDensityMode;
  score: number;
  reasons: string[];
  pageLengthExpectation: 'one_page' | 'one_to_two_pages';
  compactSections: Array<'skills' | 'experience' | 'projects'>;
}

export interface CvContentPriorityPlan {
  version: number;
  data: RewrittenCVData;
  bulletDecisions: BulletPriorityDecision[];
  skillsDecisions: SkillsGroupingDecision[];
  duplicatesRemoved: RemovedDuplicateDecision[];
  density: PageDensityDecision;
  optionalContentMovedLater: string[];
  omittedRedundantContent: string[];
}

export interface PrioritizeCvContentParams {
  data: RewrittenCVData;
  claimSourceRefs?: Record<string, RewriteSourceRef[]>;
  requirements?: RewriteRequirement[];
  pageLengthExpectation: 'one_page' | 'one_to_two_pages';
  /** Tailored rewrites group skills by role relevance; profile-only builds preserve categories. */
  groupSkills?: boolean;
}

const PRIORITY_RANK: Record<ContentPriority, number> = {
  essential: 0,
  high: 1,
  normal: 2,
  low: 3,
};

function refPriority(
  refs: readonly RewriteSourceRef[],
  requirements: ReadonlyMap<string, RewriteRequirement>
): { priority: ContentPriority; reasons: string[] } {
  const reasons: string[] = [];
  let priority: ContentPriority = 'normal';

  for (const ref of refs) {
    if (ref.source === 'approved_profile') {
      priority = 'essential';
      reasons.push('approved_profile_evidence');
    } else if (ref.source === 'application_context') {
      priority = 'essential';
      reasons.push('approved_application_context');
    } else if (ref.source === 'ledger_evidence') {
      const requirement = requirements.get(ref.requirementId);
      if (requirement?.importance === 'mandatory') {
        priority = 'essential';
        reasons.push('mandatory_requirement_support');
      } else if (requirement && priority !== 'essential') {
        priority = 'high';
        reasons.push('desirable_requirement_support');
      }
    }
  }

  if (refs.length === 0) reasons.push('no_claim_reference_metadata');
  return { priority, reasons: [...new Set(reasons)] };
}

function normalizedBullet(label: string, body: string): string {
  return normalizeText(`${label} ${body}`);
}

function prioritizeBullets(
  section: 'experience' | 'projects',
  entries: RewrittenCVData['experience'] | RewrittenCVData['projects'],
  refsByPath: Record<string, RewriteSourceRef[]>,
  requirements: ReadonlyMap<string, RewriteRequirement>,
  decisions: BulletPriorityDecision[],
  removed: RemovedDuplicateDecision[]
) {
  return entries.map((entry, entryIndex) => {
    const candidates = entry.achievements.map((bullet, originalIndex) => {
      const sourcePath = `${section}.${entryIndex}.achievements.${originalIndex}`;
      const refs = [
        ...(refsByPath[`${section}.${entryIndex}`] ?? []),
        ...(refsByPath[sourcePath] ?? []),
      ];
      const assessed = refPriority(refs, requirements);
      if (extractImpactMetrics(bullet.body).length > 0) {
        assessed.reasons.push('supported_metric_preserved');
        if (assessed.priority === 'normal') assessed.priority = 'high';
      }
      return { bullet, sourcePath, originalIndex, ...assessed };
    });

    const kept: typeof candidates = [];
    const firstByText = new Map<string, (typeof candidates)[number]>();
    for (const candidate of candidates) {
      const normalized = normalizedBullet(candidate.bullet.label, candidate.bullet.body);
      const first = firstByText.get(normalized);
      if (normalized && first) {
        // Never represent removal of protected evidence as a page-length decision.
        // Identical protected claims are retained; only ordinary redundant copies go.
        if (candidate.priority === 'essential' || first.priority === 'essential') {
          kept.push(candidate);
          continue;
        }
        removed.push({
          sourcePath: candidate.sourcePath,
          duplicateOf: first.sourcePath,
          normalizedText: normalized,
        });
        decisions.push({
          sourcePath: candidate.sourcePath,
          priority: candidate.priority,
          reasons: [...candidate.reasons, 'exact_duplicate_removed'],
          originalIndex: candidate.originalIndex,
          finalIndex: null,
        });
        continue;
      }
      firstByText.set(normalized, candidate);
      kept.push(candidate);
    }

    const ordered = kept
      .map((candidate, stableIndex) => ({ candidate, stableIndex }))
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.candidate.priority] - PRIORITY_RANK[b.candidate.priority] ||
          a.stableIndex - b.stableIndex
      )
      .map(({ candidate }, finalIndex) => {
        decisions.push({
          sourcePath: candidate.sourcePath,
          priority: candidate.priority,
          reasons: candidate.reasons,
          originalIndex: candidate.originalIndex,
          finalIndex,
        });
        return candidate.bullet;
      });

    return { ...entry, achievements: ordered };
  });
}

function splitSkills(skills: string): string[] {
  return skills
    .split(/[,;\n|]+/)
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function requirementForSkill(
  skill: string,
  requirements: readonly RewriteRequirement[]
): RewriteRequirement[] {
  const normalized = normalizeText(skill);
  if (!normalized) return [];
  return requirements.filter((requirement) => {
    const requirementText = normalizeText(requirement.text);
    return requirementText.includes(normalized) || normalized.includes(requirementText);
  });
}

function prioritizeSkills(
  groups: RewrittenCVData['coreSkills'],
  refsByPath: Record<string, RewriteSourceRef[]>,
  requirements: readonly RewriteRequirement[],
  decisions: SkillsGroupingDecision[]
): RewrittenCVData['coreSkills'] {
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const seen = new Set<string>();
  const critical: string[] = [];
  const additional: string[] = [];

  groups.forEach((group, groupIndex) => {
    const sourcePath = `skills.${groupIndex}`;
    const refs = refsByPath[sourcePath] ?? [];
    const assessed = refPriority(refs, requirementsById);
    const approved = refs.some(
      (ref) => ref.source === 'approved_profile' || ref.source === 'application_context'
    );

    for (const skill of splitSkills(group.skills)) {
      const normalized = normalizeText(skill);
      if (!normalized || seen.has(normalized)) continue;

      const tiedRequirements = requirementForSkill(skill, requirements);
      const unsupportedOnly =
        tiedRequirements.length > 0 &&
        tiedRequirements.every((requirement) =>
          ['not_met', 'contradicted', 'unclear'].includes(requirement.status)
        ) &&
        !approved;
      if (unsupportedOnly) continue;

      seen.add(normalized);
      const roleCritical =
        assessed.priority === 'essential' ||
        tiedRequirements.some(
          (requirement) =>
            requirement.importance === 'mandatory' &&
            ['met', 'partial'].includes(requirement.status)
        );
      const groupName = roleCritical
        ? 'role_critical_verified'
        : 'additional_verified';
      (roleCritical ? critical : additional).push(skill);
      decisions.push({
        displayName: skill,
        group: groupName,
        sourcePath,
        priority: roleCritical ? 'essential' : assessed.priority,
      });
    }
  });

  const result: RewrittenCVData['coreSkills'] = [];
  if (critical.length > 0) {
    result.push({ category: 'Role-critical verified skills', skills: critical.join(', ') });
  }
  if (additional.length > 0) {
    result.push({ category: 'Additional verified skills', skills: additional.join(', ') });
  }
  return result;
}

function estimateDensity(
  data: RewrittenCVData,
  expectation: 'one_page' | 'one_to_two_pages'
): PageDensityDecision {
  const populatedSections = [
    data.professionalSummary.trim(),
    data.coreSkills.length,
    data.experience.length,
    data.projects.length,
    data.education.length,
    data.certifications.length,
  ].filter(Boolean).length;
  const entries =
    data.experience.length +
    data.projects.length +
    data.education.length +
    data.certifications.length;
  const bulletCount =
    data.experience.reduce((sum, entry) => sum + entry.achievements.length, 0) +
    data.projects.reduce((sum, entry) => sum + entry.achievements.length, 0);
  const skillCount = data.coreSkills.reduce(
    (sum, group) => sum + splitSkills(group.skills).length,
    0
  );
  const textLength = JSON.stringify(data).length;
  const score = Math.round(
    populatedSections * 3 +
      entries * 3 +
      bulletCount * 2 +
      skillCount * 0.5 +
      textLength / 500
  );
  const thresholds = expectation === 'one_page' ? [18, 27, 36] : [30, 44, 58];
  const mode: PageDensityMode =
    score <= thresholds[0]
      ? 'normal'
      : score <= thresholds[1]
        ? 'compact'
        : score <= thresholds[2]
          ? 'highly_compact'
          : 'likely_multi_page';
  const compactSections: PageDensityDecision['compactSections'] =
    mode === 'normal'
      ? []
      : [
          ...(skillCount > 8 ? (['skills'] as const) : []),
          ...(data.experience.some((entry) => entry.achievements.length > 4)
            ? (['experience'] as const)
            : []),
          ...(data.projects.some((entry) => entry.achievements.length > 4)
            ? (['projects'] as const)
            : []),
        ];
  return {
    mode,
    score,
    pageLengthExpectation: expectation,
    compactSections: [...new Set(compactSections)],
    reasons: [
      `${populatedSections}_populated_sections`,
      `${entries}_entries`,
      `${bulletCount}_bullets`,
      `${skillCount}_skills`,
      `${textLength}_content_characters`,
      mode === 'likely_multi_page'
        ? 'content_preserved_over_page_target'
        : 'presentation_compaction_sufficient',
    ],
  };
}

export function prioritizeCvContent(params: PrioritizeCvContentParams): CvContentPriorityPlan {
  const refsByPath = params.claimSourceRefs ?? {};
  const requirements = params.requirements ?? [];
  const requirementsById = new Map(
    requirements.map((requirement) => [requirement.id, requirement])
  );
  const bulletDecisions: BulletPriorityDecision[] = [];
  const duplicatesRemoved: RemovedDuplicateDecision[] = [];
  const skillsDecisions: SkillsGroupingDecision[] = [];

  const data: RewrittenCVData = {
    ...params.data,
    contact: { ...params.data.contact },
    education: params.data.education.map((entry) => ({ ...entry })),
    certifications: params.data.certifications.map((entry) => ({ ...entry })),
    experience: prioritizeBullets(
      'experience',
      params.data.experience,
      refsByPath,
      requirementsById,
      bulletDecisions,
      duplicatesRemoved
    ) as RewrittenCVData['experience'],
    projects: prioritizeBullets(
      'projects',
      params.data.projects,
      refsByPath,
      requirementsById,
      bulletDecisions,
      duplicatesRemoved
    ) as RewrittenCVData['projects'],
    coreSkills: params.groupSkills === false
      ? params.data.coreSkills.map((group) => ({ ...group }))
      : prioritizeSkills(
          params.data.coreSkills,
          refsByPath,
          requirements,
          skillsDecisions
        ),
  };

  return {
    version: CV_CONTENT_PRIORITY_VERSION,
    data,
    bulletDecisions,
    skillsDecisions,
    duplicatesRemoved,
    density: estimateDensity(data, params.pageLengthExpectation),
    optionalContentMovedLater: bulletDecisions
      .filter(
        (decision) =>
          decision.finalIndex !== null &&
          decision.finalIndex > decision.originalIndex &&
          decision.priority !== 'essential'
      )
      .map((decision) => decision.sourcePath),
    omittedRedundantContent: duplicatesRemoved.map((item) => item.sourcePath),
  };
}
