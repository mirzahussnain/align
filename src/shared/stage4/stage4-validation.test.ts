import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { TEMPLATE_IDS } from '@/shared/constants/templates';
import { CV_TEMPLATE_CAPABILITIES } from '@/shared/constants/cv-template-capabilities';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import { prioritizeCvContent } from '@/shared/services/cv-content-priority';
import { renderCvDocx } from '@/shared/services/cv-generation';
import {
  structuredRewriteToRewrittenData,
  validateStructuredRewriteProvenance,
} from '@/shared/services/cv-rewrite-structured';
import { extractVisibleDocxText } from './docx-validator';
import { GOLDEN_CV_FIXTURES } from './fixtures';

function planned(fixture: (typeof GOLDEN_CV_FIXTURES)[number]) {
  const adapted = structuredRewriteToRewrittenData(
    fixture.structuredRewrite,
    CV_TEMPLATE_CAPABILITIES[fixture.template].summaryMaxChars
  );
  const contentPlan = prioritizeCvContent({
    data: adapted.data,
    claimSourceRefs: adapted.claimSourceRefs,
    requirements: fixture.generationInput.rewriteContext.requirements,
    pageLengthExpectation: CV_TEMPLATE_CAPABILITIES[fixture.template].pageLengthExpectation,
  });
  return {
    adapted,
    contentPlan,
    spec: planCvBuildSpec({
      data: contentPlan.data,
      templateId: fixture.template,
      occupationId: fixture.occupation,
      role: fixture.targetRole,
      targetSource: 'stage4_fixture',
      contentPlan,
    }),
  };
}

describe('Stage 4 fixture coverage', () => {
  it.each(TEMPLATE_IDS)('covers required densities and role families in %s', (template) => {
    const fixtures = GOLDEN_CV_FIXTURES.filter((fixture) => fixture.template === template);
    expect(new Set(fixtures.map((fixture) => fixture.density))).toEqual(
      new Set(['sparse', 'normal', 'dense', 'likely-multi-page'])
    );
    expect(fixtures.some((fixture) => fixture.occupation === 'software_engineer')).toBe(true);
    expect(fixtures.some((fixture) => fixture.occupation === 'registered_nurse')).toBe(true);
    expect(fixtures.some((fixture) => ['administrator', 'warehouse_operative'].includes(fixture.occupation))).toBe(true);
  });

  it('uses General for IT support because no calibrated profile exists', () => {
    const fixtures = GOLDEN_CV_FIXTURES.filter((fixture) => fixture.occupationLabel.startsWith('IT Support'));
    expect(fixtures).toHaveLength(4);
    expect(fixtures.every((fixture) => fixture.occupation === 'generic')).toBe(true);
  });
});

describe('Stage 4 claim and provenance validation', () => {
  it.each(GOLDEN_CV_FIXTURES)('$fixtureId has valid claim-level source references', (fixture) => {
    const result = validateStructuredRewriteProvenance(
      fixture.structuredRewrite,
      fixture.generationInput
    );
    expect(result).toEqual({ ok: true, reasons: [] });
    const { adapted } = planned(fixture);
    const sources = new Set(Object.values(adapted.claimSourceRefs).flat().map((ref) => ref.source));
    expect(sources).toEqual(new Set(fixture.expected.provenanceSources));
    expect(JSON.stringify(adapted.data)).not.toContain('sourceRefs');
    expect(JSON.stringify(adapted.data)).not.toContain('requirementId');
  });

  it.each(GOLDEN_CV_FIXTURES.filter((fixture) => fixture.expected.unsupportedRequirements.length > 0))(
    '$fixtureId records every unsupported requirement and does not render its id',
    async (fixture) => {
      expect(fixture.structuredRewrite.generationNotes?.unsupportedRequirementsNotAdded).toEqual(
        fixture.expected.unsupportedRequirements
      );
      const { spec } = planned(fixture);
      const buffer = await renderCvDocx(spec);
      const zip = await JSZip.loadAsync(buffer);
      const text = extractVisibleDocxText(await zip.file('word/document.xml')!.async('string'));
      for (const id of fixture.expected.unsupportedRequirements) expect(text).not.toContain(id);
    }
  );
});

describe('Stage 4 renderer contract regression', () => {
  it.each(GOLDEN_CV_FIXTURES)('$fixtureId renders exactly the canonical headings and section order', async (fixture) => {
    const { spec } = planned(fixture);
    expect(spec.sections.map((section) => section.type)).toEqual(fixture.expected.sectionOrder);
    expect(spec.sections.map((section) => section.heading)).toEqual(fixture.expected.headings);
    expect(spec.presentation.densityMode).toBe(fixture.expected.densityMode);

    const buffer = await renderCvDocx(spec);
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file('word/document.xml')!.async('string');
    const text = extractVisibleDocxText(xml).toLocaleLowerCase();
    for (const heading of fixture.expected.headings) expect(text).toContain(heading.toLocaleLowerCase());
    for (const claim of fixture.expected.claims) expect(text).toContain(claim.toLocaleLowerCase());
    expect(xml).toContain('<w:keepNext/>');
  });

  it('preserves the same semantic content strategy across template renderers', () => {
    const grouped = Map.groupBy(GOLDEN_CV_FIXTURES, (fixture) => fixture.fixtureId.replace(/-(architect|editorial_refined|technical_precision|academic_latex)$/u, ''));
    for (const fixtures of grouped.values()) {
      const plans = fixtures.map((fixture) => planned(fixture));
      const baseline = plans[0].contentPlan.data;
      for (const plan of plans.slice(1)) {
        expect(plan.contentPlan.data).toEqual(baseline);
        expect(plan.spec.provenance.sectionOrder).toEqual(plans[0].spec.provenance.sectionOrder);
      }
    }
  });
});
