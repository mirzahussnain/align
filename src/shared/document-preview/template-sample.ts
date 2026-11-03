import type { TemplateId } from '@/shared/constants/templates';
import type {
  CvBuildSectionV2,
  CvBuildSpecV2,
  CvPresentationLine,
} from '@/shared/cv-generation/build-spec-types';

export type TemplateSampleSize = 'short' | 'medium' | 'overflow';

const line = (id: string, text: string): CvPresentationLine => ({ id, text });

function experience(index: number, bulletCount: number, verbose: boolean): CvBuildSectionV2 {
  const phrases = [
    'Reduced service response time by 32% through measured workflow improvements.',
    'Coordinated releases with engineering, operations and customer-support partners.',
    'Built automated quality checks that prevented incomplete records reaching production.',
    'Documented operational decisions and evidence so later reviews remained reproducible.',
    'Mentored colleagues through structured pairing and concise technical walkthroughs.',
    'Investigated reliability issues and verified fixes with repeatable regression tests.',
  ];
  return {
    type: 'EXPERIENCE',
    heading: 'Experience',
    items: [{
      id: `sample-role-${index}`,
      title: index === 0 ? 'Senior Product Engineer' : `Product Engineer ${index + 1}`,
      employer: `Example Organisation ${index + 1}`,
      location: 'United Kingdom',
      startDate: `${2025 - index}-01`,
      endDate: index === 0 ? 'Present' : `${2025 - index}-12`,
      lines: Array.from({ length: bulletCount }, (_, bullet) => line(
        `sample-role-${index}-line-${bullet}`,
        verbose
          ? `${phrases[bullet % phrases.length]} This representative sentence deliberately exercises readable wrapping without using real candidate information.`
          : phrases[bullet % phrases.length],
      )),
      links: [],
    }],
  };
}

export function createSafeTemplateSample(
  templateId: TemplateId,
  size: TemplateSampleSize,
): CvBuildSpecV2 {
  const sections: CvBuildSectionV2[] = [
    {
      type: 'PROFILE',
      heading: 'Profile',
      lines: [line(
        'sample-profile',
        'Evidence-led product engineer focused on accessible, reliable digital services.',
      )],
    },
    {
      type: 'SKILLS',
      heading: 'Skills',
      items: [{
        id: 'sample-skills',
        category: 'Product Engineering',
        skills: ['TypeScript', 'Service design', 'PostgreSQL', 'Automated testing', 'Accessibility', 'Cloud delivery']
          .map((name, index) => ({ id: `sample-skill-${index}`, name })),
      }],
    },
  ];

  if (size === 'short') {
    sections.push(experience(0, 2, false));
  } else if (size === 'medium') {
    sections.push({
      type: 'EXPERIENCE', heading: 'Experience',
      items: Array.from({ length: 8 }, (_, index) => index).flatMap((index) => {
        const section = experience(index, 6, false);
        return section.type === 'EXPERIENCE' ? section.items : [];
      }),
    });
    sections.push({
      type: 'PROJECTS', heading: 'Selected Projects', items: [{
        id: 'sample-project', name: 'Accessible Service Toolkit',
        startDate: '2024-02', endDate: '2024-10', technologies: ['TypeScript', 'WCAG'],
        lines: [
          line('sample-project-1', 'Created reusable accessibility checks for twelve service teams.'),
          line('sample-project-2', 'Published evidence and adoption guidance for repeatable delivery.'),
        ], links: [],
      }],
    });
  } else {
    sections.push({
      type: 'EXPERIENCE', heading: 'Experience',
      items: Array.from({ length: 12 }, (_, index) => {
        const section = experience(index, 6, true);
        if (section.type !== 'EXPERIENCE') throw new Error('Invalid sample section');
        return section.items[0];
      }),
    });
  }

  return {
    version: 4,
    generationId: `safe-template-${templateId}-${size}`,
    identity: {
      fullName: 'Jordan Taylor',
      headline: 'Product Engineer',
      email: 'candidate@example.invalid',
      phone: '+44 0000 000000',
      location: 'United Kingdom',
    },
    links: [{
      id: 'sample-portfolio', label: 'Portfolio',
      url: 'https://example.invalid/portfolio', type: 'PORTFOLIO',
    }],
    sections,
    evidenceBindings: [],
    normalizationIssues: [],
    presentation: {
      templateId,
      density: 'BALANCED',
      targetLength: 'ONE_TO_TWO_PAGES',
    },
    provenance: {
      approvedEvidenceIds: [], omittedEvidenceIds: [],
      sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD',
    },
  };
}
