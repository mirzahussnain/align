import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { CV_TEMPLATE_RENDERERS, generateV2Template } from '../v2';
import { generateArchitectTemplate } from '../template1_architect';
import { generateEditorialTemplate } from '../template2_editorial';
import { generateTechnicalTemplate } from '../template3_technical';
import { generateAcademicTemplate } from '../template4_academic';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec-types';
import type { TemplateId } from '@/shared/constants/templates';
import { employmentTypeLabel } from '@/shared/constants/employment-type';
import { CV_LAYOUT_PROFILES, layoutFor } from '../layout';

const sectionOrder = ['PROJECTS', 'EXPERIENCE', 'SKILLS', 'EDUCATION'] as const;

describe('V2 rendered DOCX', () => {
  const spec = (templateId: TemplateId): CvBuildSpecV2 => ({
    version: 4,
    generationId: 'g1',
    identity: { fullName: 'Alex McCandidate', headline: 'Evidence Engineer', email: 'alex@example.com', phone: '+44 7700 900123', location: 'London' },
    links: [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/alex', type: 'LINKEDIN' }],
    sections: [
      { type: 'PROJECTS', heading: 'Projects', items: [{ id: 'project-1', name: 'Lighthouse API', subtitle: 'Reliable services', technologies: ['TypeScript', 'PostgreSQL'], lines: [{ id: 'project-line', text: 'Reduced API latency by 25%.' }], links: [
        { id: 'project-live', label: 'Live demo', url: 'https://example.com/demo', type: 'PROJECT_LIVE' },
        { id: 'project-repo', label: 'Repository', url: 'https://github.com/alex/project', type: 'PROJECT_REPOSITORY' },
      ] }] },
      { type: 'EXPERIENCE', heading: 'Experience', items: [{ id: 'role-1', title: 'Platform Engineer', employer: 'Northwind Robotics', startDate: '2022-01', endDate: '2024-12', lines: [{ id: 'role-line', text: 'Led a safe platform migration.' }], links: [] }] },
      { type: 'SKILLS', heading: 'Skills', items: [{ id: 'skill-category:languages', category: 'Languages', skills: [{ id: 'skill-rust', name: 'Rust' }] }] },
      { type: 'EDUCATION', heading: 'Education', items: [{ id: 'education-1', degree: 'BSc Data Engineering', institution: 'Westbridge Institute', grade: 'First', lines: [], links: [] }] },
    ],
    evidenceBindings: [],
    normalizationIssues: [],
    presentation: { templateId, density: 'BALANCED', targetLength: 'TWO_PAGES' },
    provenance: { approvedEvidenceIds: [], omittedEvidenceIds: [], sourceMode: 'JOB_MATCH', atsStrategy: 'COMPOSITE' },
  });

  it('registers one distinct renderer implementation for every supported template', () => {
    expect(CV_TEMPLATE_RENDERERS).toEqual({ architect: generateArchitectTemplate, editorial_refined: generateEditorialTemplate, technical_precision: generateTechnicalTemplate, academic_latex: generateAcademicTemplate });
    expect(new Set(Object.values(CV_TEMPLATE_RENDERERS)).size).toBe(4);
  });

  it.each(['architect', 'editorial_refined', 'technical_precision', 'academic_latex'] as const)(
    'applies the shared phone formatter in %s without mutating the build spec',
    async (templateId) => {
      const value = spec(templateId);
      value.identity.phone = '+44 · 7737853800';
      const original = structuredClone(value);
      const xml = await (await JSZip.loadAsync(await generateV2Template(value))).file('word/document.xml')!.async('string');
      expect(xml).toContain('+44 7737 853800');
      expect(xml).not.toContain('+44 · 7737853800');
      expect(value).toEqual(original);
    },
  );

  it.each([
    ['architect', '1B5EA6', 'Arial'],
    ['editorial_refined', '8B4513', 'Georgia'],
    ['technical_precision', '087E8B', 'Trebuchet MS'],
    ['academic_latex', '000000', 'Times New Roman'],
  ] as const)('renders %s from presentation fields only', async (templateId, marker, font) => {
    const zip = await JSZip.loadAsync(await generateV2Template(spec(templateId)));
    const xml = await zip.file('word/document.xml')!.async('string');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    const positions = sectionOrder.map((type) => xml.indexOf(type[0] + type.slice(1).toLocaleLowerCase('en-GB')));
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    for (const text of ['Lighthouse API', 'TypeScript', 'PostgreSQL', 'Platform Engineer', 'Northwind Robotics', 'Languages', 'Rust', 'BSc Data Engineering', 'Westbridge Institute', 'Reduced API latency by 25%.', 'Led a safe platform migration.']) {
      expect(xml.split(text)).toHaveLength(2);
    }
    expect(xml.split('alex@example.com')).toHaveLength(2);
    expect(xml.split('+44 7700 900123')).toHaveLength(2);
    expect(xml).toContain('Alex McCandidate');
    expect(xml).toContain(marker);
    expect(xml).toContain(font);
    for (const forbidden of ['Excerpt:', 'Skill Ids:', 'sourceEntityId', 'evidenceId', 'requirementIds', 'canonicalData', 'Category:', 'Company:', 'Degree:', 'University:']) expect(xml).not.toContain(forbidden);
    expect(relationships.split('https://example.com/demo')).toHaveLength(2);
    expect(relationships.split('https://github.com/alex/project')).toHaveLength(2);
    expect(relationships.split('https://linkedin.com/in/alex')).toHaveLength(2);
  });

  it.each([
    ['architect', '1B5EA6', 'Arial'],
    ['editorial_refined', '8B4513', 'Georgia'],
    ['technical_precision', '087E8B', 'Trebuchet MS'],
    ['academic_latex', '000000', 'Times New Roman'],
  ] as const)('emits explicit A4 layout and unchanged content for every %s profile', async (templateId, marker, font) => {
    for (const profile of CV_LAYOUT_PROFILES) {
      const layout = layoutFor(templateId, 'BALANCED', profile);
      const zip = await JSZip.loadAsync(await generateV2Template(spec(templateId), { profile }));
      const xml = await zip.file('word/document.xml')!.async('string');
      expect(xml).toMatch(new RegExp(`<w:pgSz[^>]*w:w=[^0-9]*${layout.page.width}[^>]*w:h=[^0-9]*${layout.page.height}`));
      expect(xml).toMatch(new RegExp(`<w:pgMar[^>]*w:top=[^0-9]*${layout.margins.top}[^>]*w:right=[^0-9]*${layout.margins.right}[^>]*w:bottom=[^0-9]*${layout.margins.bottom}[^>]*w:left=[^0-9]*${layout.margins.left}`));
      expect(xml).toContain(marker);
      expect(xml).toContain(font);
      expect(xml.match(/<w:numPr>/g)).toHaveLength(2);
      const positions = sectionOrder.map((type) => xml.indexOf(type[0] + type.slice(1).toLocaleLowerCase('en-GB')));
      expect(positions).toEqual([...positions].sort((left, right) => left - right));
      for (const text of ['Lighthouse API', 'Reduced API latency by 25%.', 'Platform Engineer', 'Led a safe platform migration.']) {
        expect(xml.split(text)).toHaveLength(2);
      }
    }
  });

  it('preserves meaningful template presentation primitives without lowercasing the technical name', async () => {
    const buffers = await Promise.all((['architect', 'editorial_refined', 'technical_precision', 'academic_latex'] as const).map((id) => generateV2Template(spec(id))));
    const xml = await Promise.all(buffers.map(async (buffer) => (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string')));
    expect(xml[0]).toMatch(/w:val=.right./);
    expect(xml[1]).toContain('▪');
    expect(xml[2]).toContain('Alex McCandidate');
    expect(xml[2]).not.toContain('alex mccandidate');
    expect(xml[2]).toMatch(/<w:left w:val=.single./);
    expect(xml[3]).toContain('Times New Roman');
  });

  it('renders authoritative current dates, completed open-ended dates, and shared employment labels', async () => {
    const value = spec('architect');
    value.sections = [{
      type: 'EXPERIENCE',
      heading: 'Experience',
      items: [
        { id: 'current', title: 'Consultant', employer: 'Current Co', employmentType: 'FREELANCE', startDate: '2023-01', current: true, lines: [], links: [] },
        { id: 'completed', title: 'Developer', employer: 'Former Co', employmentType: 'FIXED_TERM', startDate: '2020-01', current: false, lines: [], links: [] },
        { id: 'intern', title: 'Intern', employer: 'Early Co', employmentType: 'INTERNSHIP', startDate: '2019-01', endDate: '2019-06', current: false, lines: [], links: [] },
      ],
    }];

    const xml = await (await JSZip.loadAsync(await generateV2Template(value))).file('word/document.xml')!.async('string');
    expect(xml).toMatch(/Jan 2023[^<]+Present/);
    expect(xml).toContain('Jan 2020');
    expect(xml.split('Present')).toHaveLength(2);
    for (const label of ['Freelance', 'Fixed-term', 'Internship']) expect(xml).toContain(label);
    expect(employmentTypeLabel('FREELANCE')).toBe('Freelance');
    expect(employmentTypeLabel('FIXED_TERM')).toBe('Fixed-term');
    expect(employmentTypeLabel('INTERNSHIP')).toBe('Internship');
  });

  it('renders one presentation line as one DOCX bullet even when its source was wrapped', async () => {
    const value = spec('architect');
    value.sections = [{
      type: 'PROJECTS',
      heading: 'Projects',
      items: [{ id: 'project-1', name: 'Lighthouse API', technologies: [], lines: [{ id: 'one-evidence', text: 'Built one coherent evidence line.' }], links: [] }],
    }];
    const xml = await (await JSZip.loadAsync(await generateV2Template(value))).file('word/document.xml')!.async('string');
    expect(xml.match(/<w:numPr>/g)).toHaveLength(1);
    expect(xml.split('Built one coherent evidence line.')).toHaveLength(2);
  });

  it('keeps a reasonably sized multi-paragraph entry together but lets oversized entries break', async () => {
    const value = spec('architect');
    value.sections = [{
      type: 'PROJECTS',
      heading: 'Projects',
      items: [
        {
          id: 'bounded',
          name: 'Kinetix',
          technologies: ['Next.js'],
          lines: [
            { id: 'bounded-1', text: 'Built an evidence-backed workflow with deterministic validation.' },
            { id: 'bounded-2', text: 'Shipped authenticated document previews and private storage.' },
          ],
          links: [{ id: 'bounded-link', label: 'Repository', url: 'https://github.com/alex/kinetix', type: 'PROJECT_REPOSITORY' }],
        },
        {
          id: 'oversized',
          name: 'Oversized Research',
          technologies: [],
          lines: Array.from({ length: 14 }, (_, index) => ({ id: 'long-' + index, text: 'A deliberately long evidence line that must be allowed to paginate naturally without forcing an extra page ' + index + '.' })),
          links: [],
        },
      ],
    }];
    const xml = await (await JSZip.loadAsync(await generateV2Template(value))).file('word/document.xml')!.async('string');
    const bounded = xml.slice(xml.indexOf('Kinetix'), xml.indexOf('Oversized Research'));
    const oversized = xml.slice(xml.indexOf('Oversized Research'));
    expect(bounded.match(/<w:keepNext\/>/g)?.length).toBeGreaterThanOrEqual(4);
    expect(oversized.match(/<w:keepNext\/>/g)?.length ?? 0).toBe(0);
  });

  it('fails clearly for an unknown template instead of rendering a generic fallback', async () => {
    await expect(generateV2Template(spec('unknown' as TemplateId))).rejects.toThrow('Unknown template ID: unknown');
  });
});
