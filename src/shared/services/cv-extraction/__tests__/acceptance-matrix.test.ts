import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CvImportEntityType } from '@/generated/prisma/client';
import type { ProfileData } from '@/features/dashboard/data/load-profile';
import { buildImportCandidates, type CandidateDraft } from '../../cv-import';
import { extractStoredCv, type CvExtractionPayload } from '..';
import {
  academicResearchDocx,
  docxFromDocxLibrary,
  employerFirstOperationsDocx,
  equivalentParityDocx,
  equivalentParityPdf,
  minimalPdf,
  twoColumnSidebarCvPdf,
} from './fixtures';

interface AcceptanceReport {
  detectedSections: string[];
  counts: {
    experience: number;
    education: number;
    projects: number;
    skills: number;
  };
  relationships: {
    experience: Array<[string, string | undefined, string | null, string | null, boolean]>;
    education: Array<[string, string | undefined, string | null, string | null]>;
    projects: Array<[string, string[]]>;
  };
  categories: string[];
  fakeEntities: string[];
  duplicateSkills: string[];
  reviewIssues: string[];
  destructiveGuesses: string[];
}

function logicalSkillName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-GB').replace(/[^a-z0-9+#.]+/gu, ' ').trim();
}

function emptyProfile(fullName: string): ProfileData {
  return {
    profileId: 'acceptance-profile',
    label: 'Acceptance',
    targetIndustry: '',
    personal: {
      label: 'Acceptance',
      fullName,
      tagline: '',
      professionalSummary: '',
      targetOccupation: '',
      targetRoleTitle: '',
      targetSeniority: '',
      targetIndustry: '',
      email: '',
      phoneDialCode: '',
      phoneNumber: '',
      phoneCountry: '',
      city: '',
      state: '',
      country: '',
      website: '',
      linkedin: '',
      github: '',
      visaStatus: '',
      visaExpiry: '',
    },
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    trainings: [],
    licences: [],
    professionalRegistrations: [],
    languages: [],
    volunteering: [],
    otherEvidence: [],
  };
}

function acceptanceReport(
  payload: CvExtractionPayload,
  candidates: CandidateDraft[],
  expectedProjects: string[]
): AcceptanceReport {
  const skillCounts = new Map<string, number>();
  for (const candidate of candidates.filter(({ entityType }) => entityType === CvImportEntityType.SKILL)) {
    const key = logicalSkillName(String(candidate.structuredData.name ?? ''));
    skillCounts.set(key, (skillCounts.get(key) ?? 0) + 1);
  }

  const destructiveGuesses = candidates
    .filter(({ conflictCode }) => conflictCode === 'MISSING_REQUIRED_FIELD')
    .map(({ sourceExcerpt }) => sourceExcerpt);

  return {
    detectedSections: payload.detectedSections,
    counts: {
      experience: payload.experience.length,
      education: payload.education.length,
      projects: payload.projects.length,
      skills: payload.skills.length,
    },
    relationships: {
      experience: payload.experience.map((entry) => [
        entry.jobTitle,
        entry.company,
        entry.startDate,
        entry.endDate,
        entry.current,
      ]),
      education: payload.education.map((entry) => [
        entry.degree,
        entry.university,
        entry.startDate,
        entry.endDate,
      ]),
      projects: payload.projects.map((entry) => [entry.name, entry.achievements]),
    },
    categories: [...new Set(payload.skills.flatMap((skill) => (skill.category ? [skill.category] : [])))],
    fakeEntities: payload.projects
      .filter((project) => !expectedProjects.includes(project.name))
      .map((project) => project.name),
    duplicateSkills: [...skillCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([name]) => name),
    reviewIssues: (payload.reviewIssues ?? []).map((issue) => issue.code),
    destructiveGuesses,
  };
}

async function extractAcceptance(
  bytes: Buffer,
  fullName: string,
  expectedProjects: string[] = []
) {
  const extraction = await extractStoredCv(bytes);
  const candidates = buildImportCandidates({
    extraction: extraction.structured,
    profile: emptyProfile(fullName),
    accountFullName: fullName,
  });
  return {
    ...extraction,
    candidates,
    report: acceptanceReport(extraction.structured, candidates, expectedProjects),
  };
}

const DOMAIN_CASES = [
  {
    domain: 'healthcare',
    fullName: 'Amara Okafor',
    bytes: () => minimalPdf([
      'Amara Okafor',
      'CLINICAL EXPERIENCE',
      'Senior Staff Nurse at North Hospital, Mar 2021 - Present',
      'Led safe handovers across an acute ward.',
      'CLINICAL SKILLS',
      'Clinical: Cannulation, Venepuncture',
    ]),
    relationship: ['Senior Staff Nurse', 'North Hospital'],
    category: 'Clinical',
  },
  {
    domain: 'marketing',
    fullName: 'Leila Grant',
    bytes: () => minimalPdf([
      'Leila Grant',
      'EMPLOYMENT HISTORY',
      'Campaign Lead | BrightWorks | Jan 2020 - Dec 2023',
      'Lifted returning visits through a renewal campaign.',
      'TOOLS',
      'Channels: Email, Paid Social',
    ]),
    relationship: ['Campaign Lead', 'BrightWorks'],
    category: 'Channels',
  },
  {
    domain: 'finance',
    fullName: 'Taylor Reed',
    bytes: () => minimalPdf([
      'Taylor Reed',
      'EMPLOYMENT',
      'Risk Analyst | North Bank',
      'Jan 2019 - Nov 2022',
      'Reconciled monthly control accounts.',
      'CORE COMPETENCIES',
      'Controls: Reconciliation, Risk Reporting',
    ]),
    relationship: ['Risk Analyst', 'North Bank'],
    category: 'Controls',
  },
  {
    domain: 'administration and retail',
    fullName: 'Priya Cole',
    bytes: () => minimalPdf([
      'Priya Cole',
      'WORK HISTORY',
      'Store Administrator at Market House, Feb 2018 - Jun 2021',
      'Coordinated weekly stock counts and rotas.',
      'KEY SKILLS',
      'Scheduling, Stock Control',
    ]),
    relationship: ['Store Administrator', 'Market House'],
    category: undefined,
  },
  {
    domain: 'graduate',
    fullName: 'Mina Patel',
    bytes: () => minimalPdf([
      'Mina Patel',
      'ACADEMIC BACKGROUND',
      'BA Economics at York College, 2020 - 2023',
      'RELEVANT EXPERIENCE',
      'Research Assistant at Policy Lab, Sep 2022 - May 2023',
      'Prepared survey summaries for a public report.',
      'SKILLS SUMMARY',
      'Research: Survey Design, Excel',
    ]),
    relationship: ['Research Assistant', 'Policy Lab'],
    category: 'Research',
  },
  {
    domain: 'executive',
    fullName: 'Owen Price',
    bytes: () => minimalPdf([
      'Owen Price',
      'EXECUTIVE SUMMARY',
      'Service leader with responsibility for national programmes.',
      'ENGAGEMENTS',
      'Programme Director at Civic Partnership, Jan 2016 - Present',
      'Directed a multi-region transformation portfolio.',
      'AREAS OF EXPERTISE',
      'Leadership: Governance, Portfolio Direction',
    ]),
    relationship: ['Programme Director', 'Civic Partnership'],
    category: 'Leadership',
  },
] as const;

describe('CV extraction acceptance matrix', () => {
  it('preserves the supplied production-shaped PDF without invented entities', async () => {
    const bytes = await readFile(new URL('./fixtures/Hussnain_Ali_CV_Finalv2.pdf', import.meta.url));
    const { structured, report } = await extractAcceptance(
      bytes,
      'Hussnain Ali',
      ['Bhejo', 'Kinetix', 'Align']
    );

    expect(report.counts.experience).toBe(3);
    expect(report.relationships.experience).toEqual([
      ['Software Engineer', 'Independent Products', '2025-10', null, true],
      ['Software Engineer (Junior Full-Stack Developer)', 'NextPak Agile Solutions', '2023-12', '2024-05', false],
      ['Associate Web Developer', 'Cosmic365 AI', '2022-08', '2022-10', false],
    ]);
    expect(report.counts.education).toBe(2);
    expect(structured.education).toEqual([
      expect.objectContaining({
        degree: 'MSc Computer Science & Technology (AI)',
        university: 'Ulster University, UK',
        startDate: '2024-09',
        endDate: '2025-10',
        current: false,
        grade: 'Distinction',
      }),
      expect.objectContaining({
        degree: 'BSc Software Engineering',
        university: 'Capital University of Science & Technology, Pakistan',
        startDate: '2019-09',
        endDate: '2023-07',
        current: false,
        grade: 'First Class Honours, 3.82/4.0 GPA',
      }),
    ]);
    expect(structured.projects.map((project) => project.name)).toEqual(['Bhejo', 'Kinetix', 'Align']);
    expect(report.fakeEntities).toEqual([]);
    expect(structured.projects.map((project) => project.achievements.length)).toEqual([2, 2, 2]);
    expect(structured.projects.map((project) => project.technologies)).toEqual([
      ['Next.js', 'TypeScript', 'OpenCV.js', 'Supabase', 'Computer Vision', 'Vercel'],
      ['Next.js', 'TypeScript', 'Node.js', 'Redis', 'RabbitMQ', 'WebSockets', 'Azure', 'Cloudflare R2'],
      ['Next.js', 'TypeScript', 'PostgreSQL', 'BetterAuth', 'Upstash', 'LLM Integration', 'External APIs'],
    ]);
    expect(structured.skills.map((skill) => skill.name)).toContain('CI/CD');
    expect(structured.skills.map((skill) => skill.name)).not.toContain('CI');
    expect(structured.skills.map((skill) => skill.name)).not.toContain('CD');
    expect(report.categories).toEqual([
      'Frontend',
      'Backend',
      'Data & Architecture',
      'Testing & Delivery',
      'Additional',
    ]);
    expect(report.duplicateSkills).toEqual([]);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it.each(DOMAIN_CASES)('keeps $domain facts domain-neutral', async (fixture) => {
    const { structured, report } = await extractAcceptance(fixture.bytes(), fixture.fullName);

    expect(report.counts.experience).toBe(1);
    expect(report.relationships.experience[0].slice(0, 2)).toEqual(fixture.relationship);
    expect(structured.skills.some((skill) => skill.category === fixture.category)).toBe(true);
    expect(report.fakeEntities).toEqual([]);
    expect(report.duplicateSkills).toEqual([]);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it('keeps academic publications as unknown-section evidence, not software-shaped entities', async () => {
    const { structured, report } = await extractAcceptance(await academicResearchDocx(), 'Dr Noor Shah');

    expect(report.relationships.experience[0].slice(0, 2)).toEqual(['Research Fellow', 'Coastal Institute']);
    expect(structured.skills.map(({ name }) => name)).toEqual(['Thematic Analysis', 'Qualitative Interviews']);
    expect(structured.otherEvidence).toEqual([
      expect.objectContaining({
        title: 'PUBLICATIONS',
        description: 'Shah, N. (2023). Coastal resilience in regional planning.',
      }),
    ]);
    expect(report.fakeEntities).toEqual([]);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it('keeps employer-first operations facts and table-owned skill categories', async () => {
    const { structured, report } = await extractAcceptance(await employerFirstOperationsDocx(), 'Morgan Ellis');

    expect(report.relationships.experience).toEqual([
      ['Operations Manager', 'National Archives Service', '2018-04', '2023-12', false],
    ]);
    expect(structured.skills.map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'Capacity Planning', category: 'Operations' },
      { name: 'Service Design', category: 'Operations' },
    ]);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it('keeps sidebar skills and career facts in their own columns', async () => {
    const { structured, report } = await extractAcceptance(twoColumnSidebarCvPdf(), 'Rosa Mehta');

    expect(report.relationships.experience).toEqual([
      ['Service Manager', 'Borough Support', '2020-01', null, true],
    ]);
    expect(structured.skills.map(({ name }) => name)).toEqual([
      'Case Management',
      'Stakeholder Liaison',
      'Process Mapping',
    ]);
    expect(structured.experience[0].achievements).toEqual(['Reduced resident response times.']);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it('keeps the existing table-heavy DOCX layout free of cross-entity attachment', async () => {
    const { structured, report } = await extractAcceptance(await docxFromDocxLibrary(), 'Amara Okafor');

    expect(report.counts.experience).toBe(2);
    expect(report.counts.education).toBe(1);
    expect(structured.skills.map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'Venepuncture', category: 'Clinical' },
      { name: 'Cannulation', category: 'Clinical' },
      { name: 'EPR', category: 'Systems' },
      { name: 'SystmOne', category: 'Systems' },
    ]);
    expect(report.fakeEntities).toEqual([]);
    expect(report.reviewIssues).toEqual([]);
    expect(report.destructiveGuesses).toEqual([]);
  });

  it('produces equivalent import facts from equivalent PDF and DOCX inputs', async () => {
    const [pdf, docx] = await Promise.all([
      extractAcceptance(equivalentParityPdf(), 'Taylor Reed', ['Close Process Review']),
      equivalentParityDocx().then((bytes) =>
        extractAcceptance(bytes, 'Taylor Reed', ['Close Process Review'])
      ),
    ]);
    const facts = (result: Awaited<ReturnType<typeof extractAcceptance>>) => ({
      experience: result.report.relationships.experience,
      education: result.report.relationships.education,
      projects: result.structured.projects.map(({ name, technologies }) => ({ name, technologies })),
      skills: result.candidates
        .filter(({ entityType }) => entityType === CvImportEntityType.SKILL)
        .map(({ structuredData }) => [structuredData.name, structuredData.category])
        .sort(([left], [right]) => String(left).localeCompare(String(right))),
    });

    expect(facts(pdf)).toEqual(facts(docx));
    expect(pdf.report.reviewIssues).toEqual([]);
    expect(docx.report.reviewIssues).toEqual([]);
    expect(pdf.report.destructiveGuesses).toEqual([]);
    expect(docx.report.destructiveGuesses).toEqual([]);
  });
});
