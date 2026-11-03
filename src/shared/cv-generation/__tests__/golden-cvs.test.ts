import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { CvBuildSectionV2, CvBuildSpecV2, CvPresentationLine } from '../build-spec-types';
import { generateV2Template } from '@/shared/templates/v2';

interface GoldenCase { id: string; headline: string; sourceMode: 'JOB_MATCH' | 'CAREER_PROFILE'; sections: CvBuildSectionV2[]; expected: string[] }
const lines = (id: string, values: string[]): CvPresentationLine[] => values.map((text, index) => ({ id: `${id}-line-${index}`, text }));
const links = (id: string, enabled: boolean) => enabled ? [{ id: `${id}-repo`, label: 'Repository', url: `https://github.com/amina/${id}`, type: 'PROJECT_REPOSITORY' as const }] : [];
const experience = (id: string, title: string, employer: string, startDate: string, endDate: string, values: string[]): CvBuildSectionV2 => ({ type: 'EXPERIENCE', heading: 'Experience', items: [{ id, title, employer, startDate, endDate, lines: lines(id, values), links: [] }] });
const project = (id: string, name: string, startDate: string, endDate: string, values: string[]): CvBuildSectionV2 => ({ type: 'PROJECTS', heading: 'Projects', items: [{ id, name, startDate, endDate, technologies: [], lines: lines(id, values), links: links(id, true) }] });
const education = (id: string, degree: string, institution: string, values: string[]): CvBuildSectionV2 => ({ type: 'EDUCATION', heading: 'Education', items: [{ id, degree, institution, lines: lines(id, values), links: [] }] });
const skills = (type: 'SKILLS' | 'CORE_EXPERTISE', id: string, category: string, names: string[]): CvBuildSectionV2 => ({ type, heading: type === 'SKILLS' ? 'Skills' : 'Core Expertise', items: [{ id, category, skills: names.map((name, index) => ({ id: `${id}-${index}`, name })) }] });
const certification = (id: string, name: string, values: string[]): CvBuildSectionV2 => ({ type: 'CERTIFICATIONS', heading: 'Certifications', items: [{ id, name, lines: lines(id, values), links: [] }] });
const lineSection = (type: 'PROFILE', id: string, values: string[]): CvBuildSectionV2 => ({ type, heading: 'Profile', lines: lines(id, values) });
const impactSection = (id: string, heading: string, values: string[]): CvBuildSectionV2 => ({ type: 'SELECTED_IMPACT', heading: 'Selected Impact', items: [{ id, heading, lines: lines(id, values) }] });

const GOLDEN_CASES: GoldenCase[] = [
  { id: 'multi-role-software-engineer', headline: 'Senior Software Engineer', sourceMode: 'JOB_MATCH', sections: [
    { type: 'EXPERIENCE', heading: 'Experience', items: [
      { id: 'northstar', title: 'Senior Engineer', employer: 'Northstar', startDate: '2023-01', endDate: 'Present', lines: lines('northstar', ['Reduced API latency by 40% across 18 services.']), links: [] },
      { id: 'harbour', title: 'Software Engineer', employer: 'Harbour Labs', startDate: '2020-02', endDate: '2022-12', lines: lines('harbour', ['Delivered 12 customer migrations.']), links: [] },
    ] }, skills('SKILLS', 'platform-skills', 'Platform Engineering', ['C#', '.NET', 'PostgreSQL', 'Azure'])], expected: ['Northstar', '40%', 'Harbour Labs', '12 customer migrations'] },
  { id: 'junior-project-heavy', headline: 'Junior Software Engineer', sourceMode: 'JOB_MATCH', sections: [project('caretrack', 'CareTrack', '2025-01', '2025-08', ['Built REST APIs in C# and .NET.', 'Added 36 automated tests.']), education('degree', 'BSc Computer Science', 'City University', ['First-class final project.'])], expected: ['CareTrack', '36 automated tests', 'City University'] },
  { id: 'career-changer', headline: 'Operations Analyst transitioning to Software', sourceMode: 'JOB_MATCH', sections: [skills('CORE_EXPERTISE', 'transferable', 'Transferable Skills', ['Process analysis', 'Stakeholder communication', 'SQL']), project('workflow', 'Workflow Automation', '2025-02', '2025-05', ['Automated a weekly reporting workflow, saving 6 hours.'])], expected: ['Transferable Skills', 'Workflow Automation', '6 hours'] },
  { id: 'credential-heavy-regulated', headline: 'Registered Clinical Pharmacist', sourceMode: 'JOB_MATCH', sections: [{ type: 'CERTIFICATIONS', heading: 'Certifications', items: [
    { id: 'gphc', name: 'GPhC Registration 2071234', issueDate: '2021-08', expiryDate: '2027-08', lines: lines('gphc', ['Registration verified by the candidate.']), links: [] },
    { id: 'vaccination', name: 'Vaccination Certification', issueDate: '2024-03', expiryDate: '2027-03', lines: lines('vaccination', ['Completed accredited immunisation training.']), links: [] },
  ] }], expected: ['GPhC Registration 2071234', 'Vaccination Certification'] },
  { id: 'profile-only', headline: 'Product Designer', sourceMode: 'CAREER_PROFILE', sections: [lineSection('PROFILE', 'summary', ['Product designer focused on accessible public services.']), experience('civic', 'Product Designer', 'Civic Studio', '2022-04', 'Present', ['Led research with 24 service users.'])], expected: ['accessible public services', '24 service users'] },
  { id: 'one-hitl-project-many-gaps', headline: 'Backend Engineer', sourceMode: 'JOB_MATCH', sections: [project('evidence-hub', 'Evidence Hub', '2025-01', '2025-09', ['Built .NET REST APIs backed by PostgreSQL and deployed them to Azure.'])], expected: ['.NET REST APIs', 'PostgreSQL', 'Azure'] },
  { id: 'confirmed-essential-gap', headline: 'Data Analyst', sourceMode: 'JOB_MATCH', sections: [experience('insight', 'Data Analyst', 'Insight Co', '2023-01', 'Present', ['Built Power BI reporting used by 45 colleagues.'])], expected: ['Power BI', '45 colleagues'] },
  { id: 'hitl-new-project', headline: 'Full-stack Developer', sourceMode: 'JOB_MATCH', sections: [project('access-map', 'Access Map', '2026-01', '2026-07', ['Created an accessibility map covering 120 venues.'])], expected: ['Access Map', '120 venues'] },
  { id: 'hitl-enriched-experience', headline: 'Engineering Manager', sourceMode: 'JOB_MATCH', sections: [experience('scaleup', 'Engineering Manager', 'ScaleUp', '2021-06', 'Present', ['Mentored 6 engineers and introduced fortnightly delivery reviews.'])], expected: ['Mentored 6 engineers', 'fortnightly delivery reviews'] },
  { id: 'application-only-evidence', headline: 'Implementation Consultant', sourceMode: 'JOB_MATCH', sections: [impactSection('migration', 'Migration Programme', ['Coordinated a 9-team migration for this application context.'])], expected: ['9-team migration', 'application context'] },
];

function buildSpec(golden: GoldenCase, index: number): CvBuildSpecV2 {
  return {
    version: 4, generationId: `golden-${golden.id}`,
    identity: { fullName: 'Amina Shah', headline: golden.headline, email: 'amina@example.com', phone: '+44 7700 900111', location: 'London, UK' },
    links: [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/amina', type: 'LINKEDIN' }],
    sections: golden.sections, evidenceBindings: [], normalizationIssues: [],
    presentation: { templateId: (['architect', 'editorial_refined', 'technical_precision', 'academic_latex'] as const)[index % 4], density: index % 3 === 0 ? 'COMPACT' : index % 3 === 1 ? 'BALANCED' : 'SPACIOUS', targetLength: index % 2 === 0 ? 'ONE_PAGE' : 'ONE_TO_TWO_PAGES' },
    provenance: { approvedEvidenceIds: [], omittedEvidenceIds: golden.id === 'confirmed-essential-gap' ? ['unsupported-essential-requirement'] : [], sourceMode: golden.sourceMode, atsStrategy: 'STANDARD' },
  };
}

describe('V2 golden CVs', () => {
  it.each(GOLDEN_CASES.map((golden, index) => [golden.id, golden, index] as const))('generates and inspects %s', async (_id, golden, index) => {
    const spec = buildSpec(golden, index);
    const bytes = await generateV2Template(spec);
    expect(bytes.byteLength).toBeGreaterThan(5_000);
    const archive = await JSZip.loadAsync(bytes);
    const documentXml = await archive.file('word/document.xml')!.async('string');
    const relationshipsXml = await archive.file('word/_rels/document.xml.rels')!.async('string');
    for (const text of golden.expected) expect(documentXml).toContain(text);
    if (golden.id === 'multi-role-software-engineer') expect(documentXml.indexOf('Northstar')).toBeLessThan(documentXml.indexOf('Harbour Labs'));
    expect(relationshipsXml).toContain('https://linkedin.com/in/amina');
    if (golden.sections.some((section) => 'items' in section && section.items.some((item) => 'links' in item && item.links.length))) expect(relationshipsXml).toContain('https://github.com/amina/');
    expect(documentXml).not.toMatch(/requirement-|evidenceId|preservationTier|CONFIRMED_MISSING/);
    expect(spec.presentation.targetLength).toMatch(/ONE_PAGE|ONE_TO_TWO_PAGES/);
  });
});
