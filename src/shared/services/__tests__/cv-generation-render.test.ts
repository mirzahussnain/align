import { describe, it, expect, vi } from 'vitest';
import { TEMPLATE_IDS } from '@/shared/constants/templates';
import type { RewrittenCVData } from '@/shared/templates/types';

// cv-generation imports prisma/storage for the persist path; stub them so this
// render-only test never touches a DB or bucket.
vi.mock('@/shared/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/shared/lib/storage', () => ({ storage: {}, keyFor: {} }));
vi.mock('@/shared/services/storage-quota', () => ({ pruneGeneratedCvs: vi.fn() }));

import { renderCvDocx } from '@/shared/services/cv-generation';

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
      stack: 'Kafka, Flink',
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
    const buffer = await renderCvDocx(templateId, CV);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('rejects an unknown template id', async () => {
    await expect(renderCvDocx('not_a_template', CV)).rejects.toThrow();
  });
});
