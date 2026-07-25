import { describe, it, expect, vi } from 'vitest';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import { CV_TEMPLATE_CAPABILITIES } from '@/shared/constants/cv-template-capabilities';
import type { RewrittenCVData } from '@/shared/templates/types';

// cv-generation imports prisma/storage for the persist path; stub them so this
// render-only test never touches a DB or bucket.
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { renderCvDocx } from '@/shared/services/cv-generation';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import type { TemplateId } from '@/shared/constants/templates';

/** Every render path now consumes a CvBuildSpec produced by the planner. */
const specFor = (templateId: TemplateId, data: RewrittenCVData) =>
  planCvBuildSpec({ data, templateId });

const CV: RewrittenCVData = {
  fullName: 'Alex Candidate',
  tagline: 'Senior Data Engineer · Streaming · 6 yrs',
  contact: {
    email: 'alex@example.com',
    phone: '+44 7000 000000',
    location: 'London, UK',
    website: 'https://alex.dev',
    linkedin: 'linkedin.com/in/alex',
    github: 'github.com/alex',
    visaStatus: 'British citizen',
  },
  professionalSummary: 'Data engineer with six years building streaming pipelines.',
  education: [
    {
      degree: 'BSc Computer Science',
      university: 'University of Manchester',
      startDate: 'Sep 2014',
      endDate: 'Jul 2017',
      grade: 'First',
      description: 'Distributed systems focus.',
    },
  ],
  projects: [
    {
      name: 'Realtime Ingest',
      skills: 'Kafka, Flink',
      startDate: 'Jan 2022',
      endDate: 'Present',
      achievements: [{ label: 'Throughput', body: 'Scaled ingest to 1M events/sec.' }],
    },
  ],
  experience: [
    {
      jobTitle: 'Senior Data Engineer',
      company: 'FinCore',
      location: 'London, UK',
      type: 'Full-time',
      startDate: 'Aug 2019',
      endDate: 'Present',
      achievements: [{ label: 'Impact', body: 'Cut pipeline latency by 40%.' }],
    },
  ],
  coreSkills: [{ category: 'Languages', skills: 'Python, Scala, SQL' }],
  certifications: [{ name: 'AWS Solutions Architect', issuer: 'AWS', year: '2021' }],
};

describe('renderCvDocx', () => {
  it.each(TEMPLATE_IDS)('renders the %s template to non-empty DOCX bytes', async (templateId) => {
    const buffer = await renderCvDocx(specFor(templateId, CV));
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it.each(TEMPLATE_IDS)('declares the %s renderer capability explicitly', (templateId) => {
    const capability = CV_TEMPLATE_CAPABILITIES[templateId];
    expect(capability).toBeDefined();
    expect(capability.supportsProjectSkills).toBe(true);
    expect(capability.supportsProjectLiveUrl).toBe(false);
    expect(capability.supportsProjectRepositoryUrl).toBe(false);
    expect(['grouped', 'flat']).toContain(capability.skillLayout);
    // Modernised capability surface used by the planner.
    expect(capability.supportedSections.length).toBeGreaterThan(0);
    expect(['omit', 'collapse']).toContain(capability.sparseSectionPolicy);
  });

  it('renders grouped, flat, ungrouped and project-skill fixture shapes', async () => {
    const variants: RewrittenCVData[] = [
      CV,
      { ...CV, coreSkills: [{ category: 'Additional Skills', skills: 'FastAPI, Claude Code' }] },
      { ...CV, coreSkills: [{ category: 'Skills', skills: 'FastAPI, PostgreSQL, Redis' }], projects: [{ ...CV.projects[0], skills: '' }] },
    ];
    for (const templateId of TEMPLATE_IDS) {
      for (const variant of variants) {
        await expect(renderCvDocx(specFor(templateId, variant))).resolves.toBeInstanceOf(Buffer);
      }
    }
  });

  it('rejects an unknown template id', async () => {
    const spec = specFor('architect', CV);
    const corrupted = { ...spec, presentation: { ...spec.presentation, templateId: 'not_a_template' as TemplateId } };
    await expect(renderCvDocx(corrupted)).rejects.toThrow();
  });
});
