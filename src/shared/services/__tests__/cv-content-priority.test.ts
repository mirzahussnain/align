import { describe, expect, it } from 'vitest';
import {
  prioritizeCvContent,
  type PrioritizeCvContentParams,
} from '@/shared/services/cv-content-priority';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { RewriteRequirement } from '@/shared/types/cv-rewrite';
import {
  approvedProfileRef,
  ledgerEvidenceRef,
  sourceCvRef,
} from './fixtures/structured-rewrite';

function cv(overrides: Partial<RewrittenCVData> = {}): RewrittenCVData {
  return {
    fullName: 'A. Candidate',
    tagline: 'Data Engineer',
    contact: { email: '', phone: '', location: '' },
    professionalSummary: 'Data engineer.',
    experience: [],
    projects: [],
    education: [],
    coreSkills: [],
    certifications: [],
    ...overrides,
  };
}

const requirements: RewriteRequirement[] = [
  {
    id: 'mandatory-sql',
    text: 'SQL',
    importance: 'mandatory',
    status: 'met',
    category: 'tool',
    cvEvidence: ['SQL'],
    approvedProfileEvidence: [],
  },
  {
    id: 'missing-kubernetes',
    text: 'Kubernetes',
    importance: 'desirable',
    status: 'not_met',
    category: 'tool',
    cvEvidence: [],
    approvedProfileEvidence: [],
  },
];

function prioritize(
  params: Omit<PrioritizeCvContentParams, 'pageLengthExpectation'> & {
    pageLengthExpectation?: PrioritizeCvContentParams['pageLengthExpectation'];
  }
) {
  return prioritizeCvContent({
    pageLengthExpectation: 'one_page',
    ...params,
  });
}

describe('bullet prioritisation', () => {
  it('preserves mandatory evidence and keeps equal-priority bullets stable', () => {
    const data = cv({
      experience: [
        {
          jobTitle: 'Engineer',
          company: 'Acme',
          location: '',
          type: '',
          startDate: '',
          endDate: '',
          achievements: [
            { label: 'First', body: 'Ordinary first claim.' },
            { label: 'Required', body: 'Delivered mandatory SQL reporting.' },
            { label: 'Second', body: 'Ordinary second claim.' },
          ],
        },
      ],
    });
    const plan = prioritize({
      data,
      requirements,
      claimSourceRefs: {
        'experience.0.achievements.0': [sourceCvRef()],
        'experience.0.achievements.1': [ledgerEvidenceRef('mandatory-sql')],
        'experience.0.achievements.2': [sourceCvRef()],
      },
    });
    expect(plan.data.experience[0].achievements.map((bullet) => bullet.label)).toEqual([
      'Required',
      'First',
      'Second',
    ]);
    expect(plan.bulletDecisions.find((item) => item.sourcePath.endsWith('.1'))).toMatchObject({
      priority: 'essential',
      finalIndex: 0,
    });
    expect(plan.optionalContentMovedLater).toContain('experience.0.achievements.0');
  });

  it('removes normalized exact duplicates and records the source location', () => {
    const data = cv({
      projects: [
        {
          name: 'Platform',
          skills: 'SQL',
          startDate: '',
          endDate: '',
          achievements: [
            { label: 'Impact', body: 'Improved throughput.' },
            { label: ' impact ', body: 'IMPROVED   throughput!' },
          ],
        },
      ],
    });
    const plan = prioritize({ data });
    expect(plan.data.projects[0].achievements).toHaveLength(1);
    expect(plan.duplicatesRemoved).toEqual([
      expect.objectContaining({
        sourcePath: 'projects.0.achievements.1',
        duplicateOf: 'projects.0.achievements.0',
      }),
    ]);
  });

  it('does not remove duplicate text when either occurrence carries approved evidence', () => {
    const data = cv({
      experience: [
        {
          jobTitle: 'Engineer',
          company: 'Acme',
          location: '',
          type: '',
          startDate: '',
          endDate: '',
          achievements: [
            { label: '', body: 'Used SQL.' },
            { label: '', body: 'Used SQL.' },
          ],
        },
      ],
    });
    const plan = prioritize({
      data,
      requirements,
      claimSourceRefs: {
        'experience.0.achievements.0': [sourceCvRef()],
        'experience.0.achievements.1': [
          approvedProfileRef('mandatory-sql', 'skill', 'skill-1'),
        ],
      },
    });
    expect(plan.data.experience[0].achievements).toHaveLength(2);
    expect(plan.duplicatesRemoved).toEqual([]);
  });

  it('preserves supported metrics and never truncates dense bullet content', () => {
    const achievements = Array.from({ length: 8 }, (_, index) => ({
      label: `Result ${index}`,
      body: index === 0 ? 'Improved throughput by 30%.' : `Unique claim ${index}.`,
    }));
    const plan = prioritize({
      data: cv({
        experience: [
          {
            jobTitle: 'Engineer',
            company: 'Acme',
            location: '',
            type: '',
            startDate: '',
            endDate: '',
            achievements,
          },
        ],
      }),
    });
    expect(plan.data.experience[0].achievements).toHaveLength(8);
    expect(plan.data.experience[0].achievements.some((item) => item.body.includes('30%'))).toBe(
      true
    );
    expect(plan.density.compactSections).toContain('experience');
  });
});

describe('skills prioritisation', () => {
  it('groups, deduplicates and excludes a skill tied only to an unmet requirement', () => {
    const plan = prioritize({
      data: cv({
        coreSkills: [
          { category: 'Core', skills: 'SQL, Python, sql' },
          { category: 'Additional', skills: 'Git, Kubernetes' },
        ],
      }),
      requirements,
      claimSourceRefs: {
        'skills.0': [ledgerEvidenceRef('mandatory-sql')],
        'skills.1': [sourceCvRef()],
      },
    });
    expect(plan.data.coreSkills).toEqual([
      {
        category: 'Role-critical verified skills',
        skills: 'SQL, Python',
      },
      {
        category: 'Additional verified skills',
        skills: 'Git',
      },
    ]);
    expect(plan.skillsDecisions.map((item) => item.displayName)).toEqual([
      'SQL',
      'Python',
      'Git',
    ]);
  });
});

describe('page-density planning', () => {
  it('is deterministic and allows likely multi-page output without omitting unique evidence', () => {
    const achievements = Array.from({ length: 20 }, (_, index) => ({
      label: `Evidence ${index}`,
      body: `Unique verified evidence statement ${index} with substantial relevant detail.`,
    }));
    const dense = cv({
      professionalSummary: 'A'.repeat(800),
      experience: Array.from({ length: 5 }, (_, index) => ({
        jobTitle: `Role ${index}`,
        company: `Employer ${index}`,
        location: '',
        type: '',
        startDate: `${2015 + index}`,
        endDate: `${2016 + index}`,
        achievements,
      })),
      coreSkills: [{ category: 'Tools', skills: Array.from({ length: 30 }, (_, i) => `Skill ${i}`).join(', ') }],
    });
    const first = prioritize({ data: dense });
    const second = prioritize({ data: dense });
    expect(second).toEqual(first);
    expect(first.density.mode).toBe('likely_multi_page');
    expect(first.data.experience.flatMap((entry) => entry.achievements)).toHaveLength(100);
    expect(first.omittedRedundantContent).toEqual([]);
    expect(first.density.reasons).toContain('content_preserved_over_page_target');
  });
});
