import type { CvDensity } from '@/shared/cv-generation/types';
import {
  CV_TEMPLATE_DEFINITIONS,
  type TemplateId,
} from '@/shared/constants/templates';

export const CV_LAYOUT_PROFILES = ['preferred', 'compact', 'compact-tight'] as const;
export type CvLayoutProfile = (typeof CV_LAYOUT_PROFILES)[number];
export interface CvTemplateRenderOptions {
  profile?: CvLayoutProfile;
}
export interface CvTemplateRenderOptions {
  profile?: CvLayoutProfile;
}

interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LayoutSpacing {
  nameAfter: number;
  headlineAfter: number;
  contactAfter: number;
  headerAfter: number;
  dividerAfter: number;
  sectionBefore: number;
  sectionAfter: number;
  entryBefore: number;
  entryAfter: number;
  bulletAfter: number;
  metadataAfter: number;
  technologyAfter: number;
  linkAfter: number;
  profileAfter: number;
  skillAfter: number;
}

export interface TemplateLayout {
  templateId: TemplateId;
  profile: CvLayoutProfile;
  font: string;
  page: {
    width: 11_906;
    height: 16_838;
    orientation: 'portrait';
  };
  margins: Box;
  type: {
    documentDefault: number;
    name: number;
    headline: number;
    body: number;
    metadata: number;
    sectionHeading: number;
    entryTitle: number;
    link: number;
  };
  spacing: LayoutSpacing;
  lineSpacing: number;
  dateTabStopPosition?: number;
  sectionIndent?: number;
}

type TemplateLayoutBase = Omit<TemplateLayout, 'templateId' | 'profile' | 'font' | 'page' | 'lineSpacing'>;

const BASE_LAYOUTS: Record<TemplateId, TemplateLayoutBase> = {
  architect: {
    margins: { top: 820, right: 820, bottom: 820, left: 820 },
    type: {
      documentDefault: 19,
      name: 56,
      headline: 22,
      body: 19,
      metadata: 18,
      sectionHeading: 21,
      entryTitle: 21,
      link: 18,
    },
    spacing: {
      nameAfter: 25,
      headlineAfter: 25,
      contactAfter: 25,
      headerAfter: 100,
      dividerAfter: 0,
      sectionBefore: 160,
      sectionAfter: 55,
      entryBefore: 100,
      entryAfter: 20,
      bulletAfter: 45,
      metadataAfter: 35,
      technologyAfter: 35,
      linkAfter: 35,
      profileAfter: 45,
      skillAfter: 35,
    },
    dateTabStopPosition: 9_026,
  },
  editorial_refined: {
    margins: { top: 900, right: 900, bottom: 900, left: 900 },
    type: {
      documentDefault: 19,
      name: 54,
      headline: 23,
      body: 19,
      metadata: 18,
      sectionHeading: 22,
      entryTitle: 22,
      link: 18,
    },
    spacing: {
      nameAfter: 40,
      headlineAfter: 35,
      contactAfter: 25,
      headerAfter: 110,
      dividerAfter: 0,
      sectionBefore: 180,
      sectionAfter: 65,
      entryBefore: 100,
      entryAfter: 20,
      bulletAfter: 45,
      metadataAfter: 35,
      technologyAfter: 35,
      linkAfter: 35,
      profileAfter: 45,
      skillAfter: 35,
    },
  },
  technical_precision: {
    margins: { top: 760, right: 760, bottom: 760, left: 760 },
    type: {
      documentDefault: 19,
      name: 48,
      headline: 19,
      body: 19,
      metadata: 18,
      sectionHeading: 20,
      entryTitle: 20,
      link: 18,
    },
    spacing: {
      nameAfter: 20,
      headlineAfter: 20,
      contactAfter: 20,
      headerAfter: 80,
      dividerAfter: 0,
      sectionBefore: 120,
      sectionAfter: 40,
      entryBefore: 55,
      entryAfter: 20,
      bulletAfter: 25,
      metadataAfter: 35,
      technologyAfter: 35,
      linkAfter: 35,
      profileAfter: 45,
      skillAfter: 35,
    },
    sectionIndent: 120,
  },
  academic_latex: {
    margins: { top: 900, right: 900, bottom: 900, left: 900 },
    type: {
      documentDefault: 19,
      name: 50,
      headline: 21,
      body: 19,
      metadata: 18,
      sectionHeading: 21,
      entryTitle: 21,
      link: 18,
    },
    spacing: {
      nameAfter: 20,
      headlineAfter: 20,
      contactAfter: 20,
      headerAfter: 90,
      dividerAfter: 0,
      sectionBefore: 170,
      sectionAfter: 55,
      entryBefore: 100,
      entryAfter: 20,
      bulletAfter: 45,
      metadataAfter: 35,
      technologyAfter: 35,
      linkAfter: 35,
      profileAfter: 45,
      skillAfter: 35,
    },
  },
};

const DENSITY_SPACING: Record<CvDensity, number> = {
  COMPACT: 0.9,
  BALANCED: 1,
  SPACIOUS: 1.1,
};

const PROFILE_SPACING: Record<CvLayoutProfile, number> = {
  preferred: 1,
  compact: 0.82,
  'compact-tight': 0.68,
};

const PROFILE_MARGIN_REDUCTION: Record<CvLayoutProfile, number> = {
  preferred: 0,
  compact: 80,
  'compact-tight': 180,
};

function scaleSpacing(spacing: LayoutSpacing, factor: number): LayoutSpacing {
  return Object.fromEntries(
    Object.entries(spacing).map(([key, value]) => [key, Math.max(0, Math.round(value * factor))]),
  ) as unknown as LayoutSpacing;
}

function compactMargins(margins: Box, reduction: number): Box {
  return {
    top: Math.max(720, margins.top - reduction),
    right: Math.max(720, margins.right - reduction),
    bottom: Math.max(720, margins.bottom - reduction),
    left: Math.max(720, margins.left - reduction),
  };
}

export function layoutFor(
  templateId: TemplateId,
  density: CvDensity,
  profile: CvLayoutProfile,
): TemplateLayout {
  const base = BASE_LAYOUTS[templateId];
  const spacingFactor = DENSITY_SPACING[density] * PROFILE_SPACING[profile];
  return {
    templateId,
    profile,
    font: CV_TEMPLATE_DEFINITIONS[templateId].font,
    page: { width: 11_906, height: 16_838, orientation: 'portrait' },
    margins: compactMargins(base.margins, PROFILE_MARGIN_REDUCTION[profile]),
    type: { ...base.type },
    spacing: scaleSpacing(base.spacing, spacingFactor),
    lineSpacing: 1,
    dateTabStopPosition: base.dateTabStopPosition,
    sectionIndent: base.sectionIndent,
  };
}
