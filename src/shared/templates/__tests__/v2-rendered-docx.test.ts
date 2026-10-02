import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateV2Template } from '../v2';
import type { CvBuildSpecV2 } from '@/shared/cv-generation/build-spec';

const sectionTypes = ['PROFILE', 'CORE_EXPERTISE', 'EXPERIENCE', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER'] as const;

describe('V2 rendered DOCX', () => {
  it('renders every planned evidence section and creates live document/project links', async () => {
    const spec: CvBuildSpecV2 = {
      version: 3, generationId: 'g1',
      identity: { fullName: 'Alex Candidate', headline: 'Evidence Engineer', email: 'alex@example.com', location: 'London', evidenceIds: ['identity'] },
      links: [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/alex', type: 'LINKEDIN', evidenceId: 'link-linkedin' }],
      sections: sectionTypes.map((type, index) => ({
        type, heading: type.replaceAll('_', ' '), entries: [{ id: `entry-${index}`, title: `${type} record`, evidenceIds: [`e-${index}`], lines: [{ evidenceId: `e-${index}`, text: `${type} verified evidence` }], links: type === 'PROJECTS' ? [{ id: 'project-link', label: 'Live demo', url: 'https://example.com/demo', type: 'PROJECT_LIVE', evidenceId: 'project-url', projectId: `entry-${index}` }] : [] }],
      })),
      presentation: { templateId: 'technical_precision', density: 'BALANCED', targetLength: 'TWO_PAGES' },
      provenance: { approvedEvidenceIds: ['identity'], omittedEvidenceIds: [], sourceMode: 'JOB_MATCH', atsStrategy: 'COMPOSITE' },
    };
    const zip = await JSZip.loadAsync(await generateV2Template(spec));
    const xml = await zip.file('word/document.xml')!.async('string');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    for (const type of sectionTypes) expect(xml).toContain(type.replaceAll('_', ' '));
    expect(xml).toContain('Live demo');
    expect(relationships).toContain('https://example.com/demo');
    expect(relationships).toContain('https://linkedin.com/in/alex');
  });
});
