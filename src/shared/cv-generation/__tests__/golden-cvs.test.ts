import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { CvBuildSectionV2, CvBuildSpecV2 } from '../build-spec';
import { generateV2Template } from '@/shared/templates/v2';

interface GoldenCase {
  id: string;
  headline: string;
  sourceMode: 'JOB_MATCH' | 'CAREER_PROFILE';
  sections: CvBuildSectionV2[];
  expected: string[];
}

const entry = (id: string, title: string, startDate: string, endDate: string, lines: string[], projectLink = false) => ({
  id,
  title,
  startDate,
  endDate,
  evidenceIds: lines.map((_, index) => `${id}-e${index + 1}`),
  lines: lines.map((text, index) => ({ evidenceId: `${id}-e${index + 1}`, text })),
  links: projectLink ? [{ id: `${id}-repo`, label: 'Repository', url: `https://github.com/amina/${id}`, type: 'PROJECT_REPOSITORY' as const, evidenceId: `${id}-repo-evidence`, projectId: id }] : [],
});

const section = (type: CvBuildSectionV2['type'], heading: string, entries: CvBuildSectionV2['entries']): CvBuildSectionV2 => ({ type, heading, entries });

const GOLDEN_CASES: GoldenCase[] = [
  {
    id: 'multi-role-software-engineer', headline: 'Senior Software Engineer', sourceMode: 'JOB_MATCH',
    sections: [section('EXPERIENCE', 'Experience', [
      entry('northstar', 'Senior Engineer — Northstar', '2023-01', 'Present', ['Reduced API latency by 40% across 18 services.']),
      entry('harbour', 'Software Engineer — Harbour Labs', '2020-02', '2022-12', ['Delivered 12 customer migrations.']),
    ]), section('SKILLS', 'Skills', [entry('platform-skills', 'Platform Engineering', '', '', ['C#, .NET, PostgreSQL, Azure'])])],
    expected: ['Northstar', '40%', 'Harbour Labs', '12 customer migrations'],
  },
  {
    id: 'junior-project-heavy', headline: 'Junior Software Engineer', sourceMode: 'JOB_MATCH',
    sections: [section('PROJECTS', 'Projects', [entry('caretrack', 'CareTrack', '2025-01', '2025-08', ['Built REST APIs in C# and .NET.', 'Added 36 automated tests.'], true)]), section('EDUCATION', 'Education', [entry('degree', 'BSc Computer Science — City University', '2022-09', '2025-06', ['First-class final project.'])])],
    expected: ['CareTrack', '36 automated tests', 'City University'],
  },
  {
    id: 'career-changer', headline: 'Operations Analyst transitioning to Software', sourceMode: 'JOB_MATCH',
    sections: [section('CORE_EXPERTISE', 'Core Expertise', [entry('transferable', 'Transferable Skills', '', '', ['Process analysis, stakeholder communication, SQL'])]), section('PROJECTS', 'Projects', [entry('workflow', 'Workflow Automation', '2025-02', '2025-05', ['Automated a weekly reporting workflow, saving 6 hours.'], true)])],
    expected: ['Transferable Skills', 'Workflow Automation', '6 hours'],
  },
  {
    id: 'credential-heavy-regulated', headline: 'Registered Clinical Pharmacist', sourceMode: 'JOB_MATCH',
    sections: [section('CERTIFICATIONS', 'Certifications', [entry('gphc', 'GPhC Registration 2071234', '2021-08', '2027-08', ['Registration verified by the candidate.']), entry('vaccination', 'Vaccination Certification', '2024-03', '2027-03', ['Completed accredited immunisation training.'])])],
    expected: ['GPhC Registration 2071234', 'Vaccination Certification'],
  },
  {
    id: 'profile-only', headline: 'Product Designer', sourceMode: 'CAREER_PROFILE',
    sections: [section('PROFILE', 'Profile', [entry('summary', '', '', '', ['Product designer focused on accessible public services.'])]), section('EXPERIENCE', 'Experience', [entry('civic', 'Product Designer — Civic Studio', '2022-04', 'Present', ['Led research with 24 service users.'])])],
    expected: ['accessible public services', '24 service users'],
  },
  {
    id: 'one-hitl-project-many-gaps', headline: 'Backend Engineer', sourceMode: 'JOB_MATCH',
    sections: [section('PROJECTS', 'Projects', [entry('evidence-hub', 'Evidence Hub', '2025-01', '2025-09', ['Built .NET REST APIs backed by PostgreSQL and deployed them to Azure.'], true)])],
    expected: ['.NET REST APIs', 'PostgreSQL', 'Azure'],
  },
  {
    id: 'confirmed-essential-gap', headline: 'Data Analyst', sourceMode: 'JOB_MATCH',
    sections: [section('EXPERIENCE', 'Experience', [entry('insight', 'Data Analyst — Insight Co', '2023-01', 'Present', ['Built Power BI reporting used by 45 colleagues.'])])],
    expected: ['Power BI', '45 colleagues'],
  },
  {
    id: 'hitl-new-project', headline: 'Full-stack Developer', sourceMode: 'JOB_MATCH',
    sections: [section('PROJECTS', 'Projects', [entry('access-map', 'Access Map', '2026-01', '2026-07', ['Created an accessibility map covering 120 venues.'], true)])],
    expected: ['Access Map', '120 venues'],
  },
  {
    id: 'hitl-enriched-experience', headline: 'Engineering Manager', sourceMode: 'JOB_MATCH',
    sections: [section('EXPERIENCE', 'Experience', [entry('scaleup', 'Engineering Manager — ScaleUp', '2021-06', 'Present', ['Mentored 6 engineers and introduced fortnightly delivery reviews.'])])],
    expected: ['Mentored 6 engineers', 'fortnightly delivery reviews'],
  },
  {
    id: 'application-only-evidence', headline: 'Implementation Consultant', sourceMode: 'JOB_MATCH',
    sections: [section('SELECTED_IMPACT', 'Selected Impact', [entry('migration', 'Application-specific migration evidence', '2025-03', '2025-06', ['Coordinated a 9-team migration for this application context.'])])],
    expected: ['9-team migration', 'application context'],
  },
];

function buildSpec(golden: GoldenCase, index: number): CvBuildSpecV2 {
  const sectionEvidence = golden.sections.flatMap((value) => value.entries.flatMap((value) => [
    ...value.evidenceIds,
    ...value.links.map((link) => link.evidenceId),
  ]));
  return {
    version: 3,
    generationId: `golden-${golden.id}`,
    identity: { fullName: 'Amina Shah', headline: golden.headline, email: 'amina@example.com', phone: '+44 7700 900111', location: 'London, UK', evidenceIds: ['identity-name', 'identity-email'] },
    links: [{ id: 'linkedin', label: 'LinkedIn', url: 'https://linkedin.com/in/amina', type: 'LINKEDIN', evidenceId: 'linkedin-evidence' }],
    sections: golden.sections,
    presentation: { templateId: (['architect', 'editorial_refined', 'technical_precision', 'academic_latex'] as const)[index % 4], density: index % 3 === 0 ? 'COMPACT' : index % 3 === 1 ? 'BALANCED' : 'SPACIOUS', targetLength: index % 2 === 0 ? 'ONE_PAGE' : 'ONE_TO_TWO_PAGES' },
    provenance: { approvedEvidenceIds: ['identity-name', 'identity-email', 'linkedin-evidence', ...sectionEvidence], omittedEvidenceIds: golden.id === 'confirmed-essential-gap' ? ['unsupported-essential-requirement'] : [], sourceMode: golden.sourceMode, atsStrategy: 'STANDARD' },
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
    if (golden.sections.some((value) => value.entries.some((value) => value.links.length))) expect(relationshipsXml).toContain('https://github.com/amina/');
    expect(documentXml).not.toMatch(/requirement-|evidenceId|preservationTier|CONFIRMED_MISSING/);
    expect(spec.provenance.approvedEvidenceIds).toEqual(expect.arrayContaining(spec.sections.flatMap((value) => value.entries.flatMap((value) => value.evidenceIds))));
    expect(spec.presentation.targetLength).toMatch(/ONE_PAGE|ONE_TO_TWO_PAGES/);
  });
});
