import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { assembleCvBuildSpec, validateBuildSpec } from '../build-spec';
import { normalizeIdentityText } from '../entity-identity';
import { generateV2Template } from '@/shared/templates/v2';
import { createProductionShapedNormalizationFixture } from './fixtures/production-shaped-normalization';

describe('production-shaped build normalization', () => {
  it('reports unique normalized content and valid DOCX output for every renderer', async () => {
    const fixture = createProductionShapedNormalizationFixture();
    const rendererResults: Record<string, boolean> = {};
    for (const templateId of ['architect', 'editorial_refined', 'technical_precision', 'academic_latex'] as const) {
      const spec = assembleCvBuildSpec({ generationId: 'synthetic-generation', evidence: fixture.evidence, plan: fixture.plan, templateId, authorityContext: fixture.authorityContext });
      const experience = spec.sections.find((section) => section.type === 'EXPERIENCE');
      const projects = spec.sections.find((section) => section.type === 'PROJECTS');
      const education = spec.sections.find((section) => section.type === 'EDUCATION');
      const skills = spec.sections.find((section) => section.type === 'SKILLS');
      if (experience?.type !== 'EXPERIENCE' || projects?.type !== 'PROJECTS' || education?.type !== 'EDUCATION' || skills?.type !== 'SKILLS') throw new Error('Expected core presentation sections');
      const achievementTexts = [...experience.items, ...projects.items].flatMap(({ lines }) => lines.map(({ text }) => normalizeIdentityText(text)));
      const links = [...spec.links, ...projects.items.flatMap(({ links }) => links)];
      const report = {
        sectionOrder: spec.sections.map(({ type }) => type),
        experienceCount: experience.items.length,
        projectCount: projects.items.length,
        educationCount: education.items.length,
        skillCount: skills.items.reduce((count, group) => count + group.skills.length, 0),
        duplicateAchievementCount: achievementTexts.length - new Set(achievementTexts).size,
        leakedInternalFieldCount: ['excerpt', 'skillIds', 'sourceEntityId', 'evidenceId', 'requirementIds', 'canonicalData', 'reconciliation'].filter((token) => JSON.stringify({ identity: spec.identity, links: spec.links, sections: spec.sections }).includes(token)).length,
        duplicateLinkCount: links.length - new Set(links.map(({ type, url }) => `${type}:${url}`)).size,
        validation: validateBuildSpec(spec, fixture.evidence, fixture.plan),
      };
      expect(report).toMatchObject({ sectionOrder: fixture.plan.sectionOrder, ...fixture.expected, duplicateAchievementCount: 0, leakedInternalFieldCount: 0, duplicateLinkCount: 0, validation: { ok: true, truth: [], provenance: [], preservation: [] } });

      const archive = await JSZip.loadAsync(await generateV2Template(spec));
      const xml = await archive.file('word/document.xml')!.async('string');
      const relationships = await archive.file('word/_rels/document.xml.rels')!.async('string');
      expect(xml.split('alex@example.com')).toHaveLength(2);
      expect(xml.split('+44 7700 900123')).toHaveLength(2);
      expect(relationships.split('https://lighthouse.example')).toHaveLength(2);
      rendererResults[templateId] = true;
    }
    expect(rendererResults).toEqual({ architect: true, editorial_refined: true, technical_precision: true, academic_latex: true });
  });
});
