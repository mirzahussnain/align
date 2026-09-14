import { describe, expect, it } from 'vitest';
import { prioritizeCvContent } from '@/shared/services/cv-content-priority';
import { planCvBuildSpec } from '../planner';
import type { RewrittenCVData } from '@/shared/templates/types';

const DATA: RewrittenCVData = {
  fullName: 'A. Candidate',
  tagline: 'Engineer',
  contact: { email: '', phone: '', location: '' },
  professionalSummary: 'Engineer with verified experience.',
  experience: [
    {
      jobTitle: 'Engineer',
      company: 'Acme',
      location: '',
      type: '',
      startDate: '2020',
      endDate: 'Present',
      achievements: [
        { label: 'Delivery', body: 'Delivered a verified result.' },
        { label: ' delivery ', body: 'DELIVERED a verified result!' },
      ],
    },
  ],
  projects: [],
  education: [],
  coreSkills: [{ category: 'Tools', skills: 'SQL, Python' }],
  certifications: [],
};

describe('CvBuildSpec priority integration', () => {
  it('carries one deterministic priority plan into presentation and provenance', () => {
    const contentPlan = prioritizeCvContent({
      data: DATA,
      pageLengthExpectation: 'one_to_two_pages',
    });
    const spec = planCvBuildSpec({
      data: contentPlan.data,
      contentPlan,
      templateId: 'architect',
      occupationId: 'software_engineer',
    });

    expect(spec.version).toBe('2');
    expect(spec.presentation.densityMode).toBe(contentPlan.density.mode);
    expect(spec.presentation.compactSections).toEqual(contentPlan.density.compactSections);
    expect(spec.provenance.priorityAlgorithmVersion).toBe(contentPlan.version);
    expect(spec.provenance.duplicatesRemoved).toEqual(contentPlan.duplicatesRemoved);
    expect(spec.provenance.pageDensityDecision).toEqual(contentPlan.density);

    const experience = spec.sections.find((section) => section.type === 'experience');
    expect(experience?.type === 'experience' && experience.entries[0].achievements).toHaveLength(
      1
    );
  });
});
