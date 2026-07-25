/**
 * The canonical CV generation contract (Stage 1).
 *
 * Every generation path — deterministic `from-profile` and tailored `regenerate`
 * — produces a `CvBuildSpec` before anything is rendered. Renderers consume ONLY
 * this contract: they never see a raw Profile entity, raw LLM output, or ad-hoc
 * route data, and they never decide which sections exist or in what order. The
 * content planner (see `planner.ts`) owns those decisions; templates own
 * presentation only.
 *
 * Stage 1 deliberately carries section CONTENT as the same display-ready shapes
 * the legacy `RewrittenCVData` payload used, so this stage is a pure
 * architecture change (contract + planner + isolation) with no change to date,
 * skills, contact, or bullet presentation. Those become spec-driven in Stage 2;
 * provenance-bearing generated items arrive in Stage 3. The section-type union
 * and content shapes are expected to grow then.
 */
import type { TemplateId } from '@/shared/constants/templates';
import type { OccupationId, RoleArchetype } from '@/shared/types/classification';
import type { DateDisplayStyle } from '@/shared/utils/date';
import type {
  BulletPriorityDecision,
  PageDensityDecision,
  RemovedDuplicateDecision,
  SkillsGroupingDecision,
} from '@/shared/services/cv-content-priority';

/** Bumped whenever the planner's section-selection or ordering logic changes. */
export const CV_CONTENT_PLANNER_VERSION = 3;

/** The current canonical build-spec shape version. */
export const CV_BUILD_SPEC_VERSION = '2';

/**
 * The section kinds the planner can emit in Stage 1. These are the sections the
 * current evidence payload can populate; regulated registration, licences,
 * training, volunteering, languages, publications and additional-experience
 * arrive with the richer evidence model in a later stage.
 */
export type CvSectionType =
  | 'summary'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'education'
  | 'certifications';

export interface CvContactBlock {
  email: string;
  phone: string;
  location: string;
  website?: string;
  linkedin?: string;
  github?: string;
  visaStatus?: string;
}

export interface CvIdentity {
  fullName: string;
  /** The tagline the document leads with, e.g. "Senior Data Engineer · 6 yrs". */
  headline: string;
  contact: CvContactBlock;
}

export interface CvBullet {
  label: string;
  body: string;
}

export interface CvExperienceEntry {
  jobTitle: string;
  company: string;
  location: string;
  type: string;
  startDate: string;
  endDate: string;
  achievements: CvBullet[];
}

export interface CvProjectEntry {
  name: string;
  skills: string;
  startDate: string;
  endDate: string;
  achievements: CvBullet[];
  liveUrl?: string;
  repositoryUrl?: string;
}

export interface CvEducationEntry {
  degree: string;
  university: string;
  startDate: string;
  endDate: string;
  grade: string;
  description: string;
}

export interface CvSkillGroup {
  category: string;
  skills: string;
}

export interface CvCertificationEntry {
  name: string;
  issuer: string;
  year: string;
}

/**
 * One planned section: its resolved heading, and its typed, display-ready
 * content. The heading is decided by the planner (template capability override →
 * occupation → default), never by the renderer.
 */
export type CvSectionSpec =
  | { type: 'summary'; heading: string; text: string }
  | { type: 'skills'; heading: string; layout: 'grouped' | 'flat'; groups: CvSkillGroup[] }
  | { type: 'experience'; heading: string; entries: CvExperienceEntry[] }
  | { type: 'projects'; heading: string; entries: CvProjectEntry[] }
  | { type: 'education'; heading: string; entries: CvEducationEntry[] }
  | { type: 'certifications'; heading: string; entries: CvCertificationEntry[] };

/** Where the target occupation/role that shaped this plan came from. */
export interface CvBuildTarget {
  occupationId: OccupationId;
  role: string | null;
  /** e.g. 'profile_target', 'saved_profile_confirmed', 'job_description'. */
  targetSource: string | null;
}

export interface CvBuildPresentation {
  templateId: TemplateId;
  skillLayout: 'grouped' | 'flat';
  /** How the renderer spells canonical dates (§7). */
  dateStyle: DateDisplayStyle;
  pageLengthExpectation: 'one_page' | 'one_to_two_pages';
  densityMode: PageDensityDecision['mode'];
  compactSections: PageDensityDecision['compactSections'];
}

/**
 * Non-content provenance: how the plan was decided. Persisted alongside the
 * generated CV so a document can be traced to the exact planner + capability
 * contract that produced its structure. Never duplicates evidence.
 */
export interface CvBuildProvenance {
  plannerVersion: number;
  capabilityVersion: number;
  occupationId: OccupationId;
  roleArchetype: RoleArchetype;
  /** Sections rendered, in final order. */
  sectionOrder: CvSectionType[];
  /** Sections dropped because they carried no evidence (omit-empty). */
  omittedEmptySections: CvSectionType[];
  /** Sections dropped because the chosen template cannot present them. */
  unsupportedByTemplate: CvSectionType[];
  /**
   * True when the summary exceeds the template's soft length budget (§11).
   * Recorded for observability only — deterministic generation never truncates
   * user-authored summary text.
   */
  summaryExceedsBudget: boolean;
  priorityAlgorithmVersion: number;
  bulletPriorityDecisions: BulletPriorityDecision[];
  skillsGroupingDecisions: SkillsGroupingDecision[];
  duplicatesRemoved: RemovedDuplicateDecision[];
  pageDensityDecision: PageDensityDecision;
  optionalContentMovedLater: string[];
  omittedRedundantContent: string[];
}

/**
 * The single contract every renderer consumes. Sections are already filtered to
 * what has evidence, ordered, and heading-labelled — the renderer only lays them
 * out.
 */
export interface CvBuildSpec {
  version: string;
  identity: CvIdentity;
  target: CvBuildTarget;
  sections: CvSectionSpec[];
  presentation: CvBuildPresentation;
  provenance: CvBuildProvenance;
}
