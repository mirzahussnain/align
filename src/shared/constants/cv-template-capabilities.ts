import type { TemplateId } from './templates';
import type { CvSectionType } from '@/shared/services/cv-build-spec/types';
import type { DateDisplayStyle } from '@/shared/utils/date';

/** Bumped whenever any template's declared capabilities change. */
export const CV_TEMPLATE_CAPABILITIES_VERSION = 3;

export type { DateDisplayStyle };

export type CvTemplateCapabilities = {
  skillLayout: 'grouped' | 'flat';
  supportsProjectSkills: boolean;
  supportsProjectLiveUrl: boolean;
  supportsProjectRepositoryUrl: boolean;

  /** The section kinds this template can present. Planned sections it cannot
   *  present are dropped by the planner and recorded in provenance. */
  supportedSections: CvSectionType[];
  /**
   * A template-imposed order that OVERRIDES the occupation-driven order. Left
   * undefined in Stage 1 so section order stays occupation- and evidence-led,
   * never globally fixed per template (see the generation contract, §4).
   */
  preferredSectionOrder?: CvSectionType[];
  /** Per-section heading wording. Falls back to the planner's default heading. */
  headingLabels?: Partial<Record<CvSectionType, string>>;
  /** How canonical dates are spelled by this template's renderer (§7). */
  dateStyle: DateDisplayStyle;
  /**
   * Soft guidance on summary length for this template (§11). Deterministic
   * generation records over-budget summaries in provenance but does NOT truncate
   * user-authored text; the LLM-side enforcement lands with the Stage 3 prompt.
   */
  summaryMaxChars: number;
  pageLengthExpectation: 'one_page' | 'one_to_two_pages';
  sparseSectionPolicy: 'omit' | 'collapse';
};

const ALL_SECTIONS: CvSectionType[] = [
  'summary',
  'skills',
  'experience',
  'projects',
  'education',
  'certifications',
];

/** Every renderer is declared intentionally; unsupported optional fields omit cleanly. */
export const CV_TEMPLATE_CAPABILITIES: Record<TemplateId, CvTemplateCapabilities> = {
  architect: {
    skillLayout: 'grouped',
    supportsProjectSkills: true,
    supportsProjectLiveUrl: false,
    supportsProjectRepositoryUrl: false,
    supportedSections: ALL_SECTIONS,
    dateStyle: 'short_month_year',
    summaryMaxChars: 600,
    pageLengthExpectation: 'one_to_two_pages',
    sparseSectionPolicy: 'omit',
  },
  editorial_refined: {
    skillLayout: 'grouped',
    supportsProjectSkills: true,
    supportsProjectLiveUrl: false,
    supportsProjectRepositoryUrl: false,
    supportedSections: ALL_SECTIONS,
    dateStyle: 'long_month_year',
    summaryMaxChars: 600,
    pageLengthExpectation: 'one_to_two_pages',
    sparseSectionPolicy: 'omit',
  },
  technical_precision: {
    skillLayout: 'grouped',
    supportsProjectSkills: true,
    supportsProjectLiveUrl: false,
    supportsProjectRepositoryUrl: false,
    supportedSections: ALL_SECTIONS,
    // Preserves this template's historical heading wording under isolation.
    headingLabels: {
      summary: 'Profile',
      skills: 'Technical Skills',
      experience: 'Experience',
    },
    dateStyle: 'numeric_month_year',
    summaryMaxChars: 500,
    pageLengthExpectation: 'one_to_two_pages',
    sparseSectionPolicy: 'omit',
  },
  academic_latex: {
    skillLayout: 'flat',
    supportsProjectSkills: true,
    supportsProjectLiveUrl: false,
    supportsProjectRepositoryUrl: false,
    supportedSections: ALL_SECTIONS,
    headingLabels: {
      skills: 'Skills',
      projects: 'Projects',
    },
    dateStyle: 'long_month_year',
    summaryMaxChars: 800,
    pageLengthExpectation: 'one_to_two_pages',
    sparseSectionPolicy: 'omit',
  },
};
