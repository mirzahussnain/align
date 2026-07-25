import { describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { TemplateId } from '@/shared/constants/templates';

// cv-generation pulls in prisma/storage for the persist path; stub them so this
// render-only test never touches a DB or bucket.
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { renderCvDocx } from '@/shared/services/cv-generation';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';

/** Canonical dates (YYYY-MM / YYYY) so per-template styling is observable. */
const CV: RewrittenCVData = {
  fullName: 'Alex Candidate',
  tagline: 'Software Engineer',
  contact: {
    email: 'alex@example.com',
    phone: '+44 7000 000000',
    location: 'London, UK',
    linkedin: 'linkedin.com/in/alex',
    visaStatus: 'British citizen',
  },
  professionalSummary: 'Engineer who builds reliable systems.',
  education: [{ degree: 'BSc CS', university: 'Manchester', startDate: '2014', endDate: '2017', grade: 'First', description: 'Systems.' }],
  projects: [{ name: 'Ingest', skills: 'Kafka', startDate: '2022-01', endDate: '2023-06', achievements: [{ label: 'Scale', body: 'Scaled ingest.' }] }],
  experience: [{ jobTitle: 'Engineer', company: 'FinCore', location: 'London', type: 'Full-time', startDate: '2019-08', endDate: '2024-12', achievements: [{ label: 'Impact', body: 'Cut latency.' }] }],
  coreSkills: [{ category: 'Languages', skills: 'Python, SQL' }, { category: 'Cloud', skills: 'AWS, Python' }],
  certifications: [{ name: 'AWS SA', issuer: 'AWS', year: '2021' }],
};

async function documentXml(templateId: TemplateId): Promise<string> {
  const buffer = await renderCvDocx(planCvBuildSpec({ data: CV, templateId, occupationId: 'software_engineer' }));
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml')!.async('string');
}

describe('rendered DOCX content', () => {
  it('spells the same canonical experience date differently per template date style (§7)', async () => {
    const architect = await documentXml('architect');       // short_month_year
    const editorial = await documentXml('editorial_refined'); // long_month_year
    const technical = await documentXml('technical_precision'); // numeric_month_year

    expect(architect).toContain('Dec 2024');
    expect(architect).not.toContain('December 2024');

    expect(editorial).toContain('December 2024');

    expect(technical).toContain('12/2024');
    expect(technical).not.toContain('Dec 2024');
  });

  it('never widens year-only education dates into a month, in any style (§7)', async () => {
    for (const templateId of ['architect', 'editorial_refined', 'technical_precision'] as const) {
      const xml = await documentXml(templateId);
      expect(xml).toContain('2014 – 2017');
    }
  });

  it('renders the full email address as link text, not a truncated local part (§9)', async () => {
    const xml = await documentXml('architect');
    expect(xml).toContain('alex@example.com');
    expect(xml).not.toContain('mail/alex');
  });

  it('renders bullets as real DOCX list items, not literal bullet characters (§10)', async () => {
    const xml = await documentXml('architect');
    // A real list paragraph carries numbering properties.
    expect(xml).toContain('<w:numPr>');
  });

  it('renders a flat-layout template skills as a single de-duplicated line (§8)', async () => {
    const xml = await documentXml('academic_latex'); // skillLayout: flat
    // Both groups collapse to one line; Python appears once despite two groups.
    expect(xml).toContain('Python, SQL, AWS');
    expect(xml).not.toContain('Python, SQL, AWS, Python');
  });
});
