import { describe, expect, it } from 'vitest';
import {
  CV_TEMPLATE_DEFINITIONS,
  DEFAULT_TEMPLATE_ID,
  TEMPLATE_IDS,
  type TemplateId,
} from '@/shared/constants/templates';
import {
  CV_LAYOUT_PROFILES,
  layoutFor,
  type CvLayoutProfile,
  type TemplateLayout,
} from '../layout';
import type { CvDensity } from '@/shared/cv-generation/types';

const densities: CvDensity[] = ['COMPACT', 'BALANCED', 'SPACIOUS'];

const expectedTemplates: Record<
  TemplateId,
  { name: string; font: string; purpose: string; version: string }
> = {
  architect: {
    name: 'Classic ATS',
    font: 'Arial',
    purpose: 'General UK applications',
    version: '2',
  },
  editorial_refined: {
    name: 'Modern Professional',
    font: 'Georgia',
    purpose: 'Software, business, and professional roles',
    version: '2',
  },
  technical_precision: {
    name: 'Project-Focused',
    font: 'Trebuchet MS',
    purpose: 'Portfolio, project, and technical contribution-led candidates',
    version: '2',
  },
  academic_latex: {
    name: 'Academic / Graduate',
    font: 'Times New Roman',
    purpose: 'Education, qualifications, awards, research, and early-career evidence',
    version: '2',
  },
};

const marginKeys = ['top', 'right', 'bottom', 'left'] as const;
const spacingKeys = [
  'headerAfter',
  'sectionBefore',
  'sectionAfter',
  'entryBefore',
  'entryAfter',
  'bulletAfter',
  'metadataAfter',
  'linkAfter',
] as const;

function expectReadable(layout: TemplateLayout) {
  expect(layout.page).toEqual(
    expect.objectContaining({ width: 11_906, height: 16_838, orientation: 'portrait' }),
  );
  expect(layout.type.body).toBeGreaterThanOrEqual(19);
  expect(layout.type.metadata).toBeGreaterThanOrEqual(18);
  expect(layout.type.sectionHeading).toBeGreaterThanOrEqual(20);
  expect(layout.lineSpacing).toBeGreaterThanOrEqual(1);
  for (const key of marginKeys) expect(layout.margins[key]).toBeGreaterThanOrEqual(720);
}

function expectNoLarger(next: TemplateLayout, previous: TemplateLayout) {
  expect(next.type).toEqual(previous.type);
  expect(next.lineSpacing).toBe(previous.lineSpacing);
  for (const key of marginKeys) expect(next.margins[key]).toBeLessThanOrEqual(previous.margins[key]);
  for (const key of spacingKeys) expect(next.spacing[key]).toBeLessThanOrEqual(previous.spacing[key]);
}

describe('CV template catalogue', () => {
  it('keeps the four stable IDs and approved default', () => {
    expect(TEMPLATE_IDS).toEqual([
      'architect',
      'editorial_refined',
      'technical_precision',
      'academic_latex',
    ]);
    expect(DEFAULT_TEMPLATE_ID).toBe('architect');
  });

  it('maps every stable ID to the approved identity and exact renderer font', () => {
    expect(Object.keys(CV_TEMPLATE_DEFINITIONS)).toEqual(TEMPLATE_IDS);
    for (const templateId of TEMPLATE_IDS) {
      expect(CV_TEMPLATE_DEFINITIONS[templateId]).toMatchObject(expectedTemplates[templateId]);
      expect(CV_TEMPLATE_DEFINITIONS[templateId].description.trim().length).toBeGreaterThan(20);
    }
  });
});

describe('bounded readable CV layout profiles', () => {
  it('defines only the approved ordered profiles', () => {
    expect(CV_LAYOUT_PROFILES).toEqual(['preferred', 'compact', 'compact-tight']);
  });

  it.each(TEMPLATE_IDS)('%s keeps A4 and readable floors for every density/profile', (templateId) => {
    for (const density of densities) {
      for (const profile of CV_LAYOUT_PROFILES) {
        expectReadable(layoutFor(templateId, density, profile));
      }
    }
  });

  it.each(TEMPLATE_IDS)('%s compacts spacing and margins without shrinking type', (templateId) => {
    for (const density of densities) {
      const layouts: Record<CvLayoutProfile, TemplateLayout> = {
        preferred: layoutFor(templateId, density, 'preferred'),
        compact: layoutFor(templateId, density, 'compact'),
        'compact-tight': layoutFor(templateId, density, 'compact-tight'),
      };
      expectNoLarger(layouts.compact, layouts.preferred);
      expectNoLarger(layouts['compact-tight'], layouts.compact);
    }
  });
});
