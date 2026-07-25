import { describe, it, expect } from 'vitest';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import {
  CV_TEMPLATE_CAPABILITIES,
  CV_TEMPLATE_CAPABILITIES_VERSION,
} from '@/shared/constants/cv-template-capabilities';
import type { CvSectionType } from '../types';

const STAGE1_SECTIONS: CvSectionType[] = [
  'summary', 'skills', 'experience', 'projects', 'education', 'certifications',
];

describe('CV_TEMPLATE_CAPABILITIES', () => {
  it('declares a versioned capability record', () => {
    expect(CV_TEMPLATE_CAPABILITIES_VERSION).toBeGreaterThan(0);
  });

  it.each(TEMPLATE_IDS)('%s declares a complete, self-consistent capability', (templateId) => {
    const capability = CV_TEMPLATE_CAPABILITIES[templateId];
    expect(capability).toBeDefined();

    // Every Stage-1 section is presentable by every current template.
    for (const section of STAGE1_SECTIONS) {
      expect(capability.supportedSections).toContain(section);
    }

    // Heading overrides may only target sections the template supports.
    for (const key of Object.keys(capability.headingLabels ?? {})) {
      expect(capability.supportedSections).toContain(key as CvSectionType);
    }

    // A template-imposed order, when present, may only reference supported sections.
    for (const section of capability.preferredSectionOrder ?? []) {
      expect(capability.supportedSections).toContain(section);
    }

    expect(['grouped', 'flat']).toContain(capability.skillLayout);
    expect(['one_page', 'one_to_two_pages']).toContain(capability.pageLengthExpectation);
    expect(['omit', 'collapse']).toContain(capability.sparseSectionPolicy);
    expect(['short_month_year', 'long_month_year', 'numeric_month_year', 'year_only_when_possible'])
      .toContain(capability.dateStyle);
    expect(capability.summaryMaxChars).toBeGreaterThan(0);
  });

  it('leaves section order occupation-driven (no template fixes a global order in Stage 1)', () => {
    for (const templateId of TEMPLATE_IDS) {
      expect(CV_TEMPLATE_CAPABILITIES[templateId].preferredSectionOrder).toBeUndefined();
    }
  });
});
