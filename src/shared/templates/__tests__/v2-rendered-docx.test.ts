import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { CV_TEMPLATE_RENDERERS, generateV2Template } from '../v2';
import { generateArchitectTemplate } from '../template1_architect';
import { generateEditorialTemplate } from '../template2_editorial';
import { generateTechnicalTemplate } from '../template3_technical';
import { generateAcademicTemplate } from '../template4_academic';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';
import type { TemplateId } from '@/shared/constants/templates';

const sectionTypes = ['PROFILE', 'CORE_EXPERTISE', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER'] as const;

describe('V2 rendered DOCX', () => {
  const spec = (templateId: TemplateId): CvBuildSpecV2 => ({
      version: 3, generationId: 'g1',
      identity: { fullName: 'Alex Candidate', headline: 'Evidence Engineer', email: 'alex@example.com', location: 'London', evidenceIds: ['identity'] },
      links: [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/alex', type: 'LINKEDIN', evidenceId: 'link-linkedin' }],
      sections: sectionTypes.map((type, index) => ({
        type, heading: type.replaceAll('_', ' '), entries: [{ id: `entry-${index}`, title: `${type} record`, startDate: '2022-01', endDate: '2024-12', evidenceIds: [`e-${index}`], metadata: [{ label: 'Employment Type', value: 'Part-time' }, { label: 'Skills', value: 'TypeScript, PostgreSQL' }], lines: [{ evidenceId: `e-${index}`, text: `${type} verified evidence` }], links: type === 'PROJECTS' ? [{ id: 'project-link', label: 'Live demo', url: 'https://example.com/demo', type: 'PROJECT_LIVE', evidenceId: 'project-url', projectId: `entry-${index}` }, { id: 'repo-link', label: 'Repository', url: 'https://github.com/alex/project', type: 'PROJECT_REPOSITORY', evidenceId: 'project-repo', projectId: `entry-${index}` }] : [] }],
      })),
      presentation: { templateId, density: 'BALANCED', targetLength: 'TWO_PAGES' },
      provenance: { approvedEvidenceIds: ['identity'], omittedEvidenceIds: [], sourceMode: 'JOB_MATCH', atsStrategy: 'COMPOSITE' },
    });

  it('registers one distinct renderer implementation for every supported template', () => {
    expect(CV_TEMPLATE_RENDERERS).toEqual({
      architect: generateArchitectTemplate,
      editorial_refined: generateEditorialTemplate,
      technical_precision: generateTechnicalTemplate,
      academic_latex: generateAcademicTemplate,
    });
    expect(new Set(Object.values(CV_TEMPLATE_RENDERERS)).size).toBe(4);
  });

  it.each([
    ['architect', '1B5EA6', 'Calibri'],
    ['editorial_refined', '8B4513', 'Calibri'],
    ['technical_precision', '087E8B', 'Aptos'],
    ['academic_latex', '000000', 'Times New Roman'],
  ] as const)('routes %s to its presentation while preserving every section and link', async (templateId, marker, font) => {
    const zip = await JSZip.loadAsync(await generateV2Template(spec(templateId)));
    const xml = await zip.file('word/document.xml')!.async('string');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const type of sectionTypes) expect(xml).toContain(type.replaceAll('_', ' '));
    const sectionPositions = sectionTypes.map((type) => xml.indexOf(type.replaceAll('_', ' ')));
    expect(sectionPositions).toEqual([...sectionPositions].sort((left, right) => left - right));
    expect(xml).toContain(marker);
    expect(xml).toContain(font);
    expect(xml).toContain('Live demo');
    expect(xml).toContain('Employment Type');
    expect(xml).toContain('Part-time');
    expect(xml).toContain('TypeScript, PostgreSQL');
    expect(relationships).toContain('https://example.com/demo');
    expect(relationships).toContain('https://github.com/alex/project');
    expect(relationships).toContain('https://linkedin.com/in/alex');
  });

  it('preserves meaningful pre-V2 presentation primitives per renderer', async () => {
    const architect = await JSZip.loadAsync(await generateV2Template(spec('architect')));
    const editorial = await JSZip.loadAsync(await generateV2Template(spec('editorial_refined')));
    const technical = await JSZip.loadAsync(await generateV2Template(spec('technical_precision')));
    const academic = await JSZip.loadAsync(await generateV2Template(spec('academic_latex')));
    const [architectXml, editorialXml, technicalXml, academicXml] = await Promise.all([
      architect.file('word/document.xml')!.async('string'),
      editorial.file('word/document.xml')!.async('string'),
      technical.file('word/document.xml')!.async('string'),
      academic.file('word/document.xml')!.async('string'),
    ]);
    expect(architectXml).toMatch(/w:val=.right./);
    expect(editorialXml).toContain('▪');
    expect(technicalXml).toContain('alex candidate');
    expect(technicalXml).toMatch(/<w:left w:val=.single./);
    expect(academicXml).toContain('Times New Roman');
    expect(academicXml).toContain('<w:tbl>');
  });

  it('fails clearly for an unknown template instead of rendering a generic fallback', async () => {
    await expect(generateV2Template(spec('unknown' as TemplateId))).rejects.toThrow('Unknown template ID: unknown');
  });
});
