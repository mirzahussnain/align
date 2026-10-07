import { describe, expect, it } from 'vitest';
import { groupSectionBlocks } from '../interpreter/grouping';
import { readExperienceSections } from '../interpreter/experience';
import { readProjectSections } from '../interpreter/projects';
import { readSkillSections } from '../interpreter/skills';
import { sectionDocument } from '../interpreter/sections';
import { findDateRange } from '../dates';
import type { NormalizedDocument, NormalizedDocumentBlock } from '../document/types';

function document(blocks: Omit<NormalizedDocumentBlock, 'id' | 'order'>[]): NormalizedDocument {
  return {
    sourceType: 'pdf',
    pageCount: 1,
    blocks: blocks.map((block, order) => ({ ...block, id: `b${order}`, order })),
  };
}

describe('interpreter sections', () => {
  it.each([
    ['Education & Training', 'education'],
    ['Selected Work', 'projects'],
    ['Research Projects', 'projects'],
    ['Engagements', 'experience'],
    ['Clinical Skills', 'skills'],
    ['Research Methods', 'skills'],
    ['Tools', 'skills'],
    ['Professional Skills', 'skills'],
  ] as const)('recognises the specified alias %s', (heading, id) => {
    const sections = sectionDocument(document([
      { text: heading, kind: 'heading', style: { headingLevel: 2 } },
      { text: 'Evidence', kind: 'paragraph' },
    ]));
    expect(sections[1]).toMatchObject({ id, heading });
  });

  it('keeps repeated headings as separate section instances', () => {
    const sections = sectionDocument(document([
      { text: 'Experience', kind: 'heading' },
      { text: 'First role', kind: 'paragraph' },
      { text: 'Employment History', kind: 'heading' },
      { text: 'Second role', kind: 'paragraph' },
    ]));
    expect(sections.filter((section) => section.id === 'experience')).toHaveLength(2);
  });

  it('preserves an unknown styled section without forcing it into the prior section', () => {
    const sections = sectionDocument(document([
      { text: 'Experience', kind: 'heading' },
      { text: 'Role', kind: 'paragraph' },
      { text: 'Publications', kind: 'heading', style: { headingLevel: 2 } },
      { text: 'A paper', kind: 'paragraph' },
    ]));
    expect(sections.at(-1)).toMatchObject({ id: 'unknown', heading: 'Publications' });
    expect(sections.at(-1)?.blocks.map((block) => block.text)).toEqual(['A paper']);
  });

  it('does not recognise a section alias embedded in prose', () => {
    const sections = sectionDocument(document([
      { text: 'I apply clinical skills throughout my experience.', kind: 'paragraph' },
    ]));
    expect(sections).toHaveLength(1);
    expect(sections[0].id).toBe('head');
  });
});

describe('interpreter groups', () => {
  it('isolates two-column streams and resets at peer headings', () => {
    const [section] = sectionDocument(document([
      { text: 'Experience', kind: 'heading' },
      { text: 'Role A', kind: 'heading', layout: { column: 1 } },
      { text: 'A detail', kind: 'bullet', layout: { column: 1 } },
      { text: 'Sidebar skill', kind: 'bullet', layout: { column: 0 } },
      { text: 'Role B', kind: 'heading', layout: { column: 1 } },
      { text: 'B detail', kind: 'bullet', layout: { column: 1 } },
    ])).filter((candidate) => candidate.id === 'experience');

    expect(groupSectionBlocks(section).map((group) => group.blocks.map((block) => block.text))).toEqual([
      ['Role A', 'A detail'],
      ['Sidebar skill'],
      ['Role B', 'B detail'],
    ]);
  });

  it('groups table cells only within their row', () => {
    const section = sectionDocument(document([
      { text: 'Skills', kind: 'heading' },
      { text: 'Category A', kind: 'table-cell', table: { table: 0, row: 0, column: 0 } },
      { text: 'TypeScript', kind: 'table-cell', table: { table: 0, row: 0, column: 1 } },
      { text: 'Category B', kind: 'table-cell', table: { table: 0, row: 1, column: 0 } },
      { text: 'Docker', kind: 'table-cell', table: { table: 0, row: 1, column: 1 } },
    ])).find((candidate) => candidate.id === 'skills')!;

    expect(groupSectionBlocks(section).map((group) => group.blocks.map((block) => block.text))).toEqual([
      ['Category A', 'TypeScript'],
      ['Category B', 'Docker'],
    ]);
  });
});

function experience(blocks: Omit<NormalizedDocumentBlock, 'id' | 'order'>[]) {
  return readExperienceSections(sectionDocument(document([
    { text: 'Experience', kind: 'heading', style: { headingLevel: 2 } },
    ...blocks,
  ])));
}

describe('interpreter experience', () => {
  it.each([
    {
      name: 'role-first inline',
      blocks: [{ text: 'Lead Analyst | Northstar Group | Jan 2021 - Present', kind: 'paragraph' }],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', startDate: '2021-01', endDate: null, current: true },
    },
    {
      name: 'employer-first three-block',
      blocks: [
        { text: 'Northstar Group', kind: 'paragraph', style: { bold: true } },
        { text: 'Lead Analyst', kind: 'paragraph' },
        { text: 'Jan 2021 - Dec 2023', kind: 'paragraph' },
      ],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', startDate: '2021-01', endDate: '2023-12', current: false },
    },
    {
      name: 'dates-first pipe-delimited',
      blocks: [{ text: 'Jan 2021 - Dec 2023 | Lead Analyst | Northstar Group', kind: 'paragraph' }],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', startDate: '2021-01', endDate: '2023-12', current: false },
    },
    {
      name: 'employer and location plus separate date',
      blocks: [
        { text: 'Northstar Group | Bristol, UK', kind: 'paragraph', style: { bold: true } },
        { text: 'Lead Analyst', kind: 'paragraph' },
        { text: 'Jan 2021 - Dec 2023', kind: 'paragraph' },
      ],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', location: 'Bristol, UK', startDate: '2021-01', endDate: '2023-12', current: false },
    },
    {
      name: 'title and employer plus next-block date',
      blocks: [
        { text: 'Lead Analyst | Northstar Group', kind: 'paragraph' },
        { text: 'Jan 2021 - Dec 2023', kind: 'paragraph' },
      ],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', startDate: '2021-01', endDate: '2023-12', current: false },
    },
    {
      name: 'table row',
      blocks: [
        { text: 'Lead Analyst', kind: 'table-cell', table: { table: 0, row: 0, column: 0 } },
        { text: 'Northstar Group', kind: 'table-cell', table: { table: 0, row: 0, column: 1 } },
        { text: 'Jan 2021 - Dec 2023', kind: 'table-cell', table: { table: 0, row: 0, column: 2 } },
      ],
      expected: { jobTitle: 'Lead Analyst', company: 'Northstar Group', startDate: '2021-01', endDate: '2023-12', current: false },
    },
  ])('reads $name using only local structure', ({ blocks, expected }) => {
    const result = experience(blocks as Omit<NormalizedDocumentBlock, 'id' | 'order'>[]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject(expected);
    expect(result.issues).toEqual([]);
  });

  it('does not infer current when an end date is missing', () => {
    const result = experience([{ text: 'Lead Analyst | Northstar Group | Jan 2021', kind: 'paragraph' }]);
    expect(result.entries[0]).toMatchObject({ startDate: '2021-01', endDate: null, current: false });
  });

  it('reports a date that has no local experience header', () => {
    const result = experience([{ text: 'Jan 2021 - Dec 2023', kind: 'paragraph' }]);
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'AMBIGUOUS_DATE_OWNERSHIP', blockIds: ['b1'] })]);
  });

  it('does not invent title or employer when two plain blocks are equally plausible', () => {
    const result = experience([
      { text: 'Northstar Group', kind: 'paragraph' },
      { text: 'Lead Analyst', kind: 'paragraph' },
      { text: 'Jan 2021 - Dec 2023', kind: 'paragraph' },
    ]);
    expect(result.entries).toEqual([]);
    expect(result.issues).toEqual([expect.objectContaining({ code: 'AMBIGUOUS_EXPERIENCE_HEADER', blockIds: ['b1', 'b2'] })]);
  });

  it('returns the exact source span of an embedded date range', () => {
    const line = 'Lead Analyst | Northstar Group | Jan 2021 - Dec 2023 | Bristol';
    const found = findDateRange(line);
    expect(found && line.slice(found.startIndex, found.endIndex)).toBe('Jan 2021 - Dec 2023');
  });
});

function projectResult(blocks: Omit<NormalizedDocumentBlock, 'id' | 'order'>[]) {
  return readProjectSections(sectionDocument(document([
    { text: 'Projects', kind: 'heading', style: { headingLevel: 2 } },
    ...blocks,
  ])));
}

describe('interpreter projects', () => {
  it.each([
    ['marketing', 'Audience Renewal Study', 'Email | Paid social', 'Lifted returning visits by 18%.'],
    ['research', 'Coastal Resilience Review', 'Interviews | Thematic analysis', 'Synthesised evidence from 42 interviews.'],
    ['operations', 'Depot Flow Redesign', 'Process mapping | Capacity planning', 'Reduced average dispatch time by 11%.'],
  ])('keeps %s project metadata and detail on its styled heading', (_domain, name, metadata, detail) => {
    const result = projectResult([
      { text: name, kind: 'paragraph', style: { bold: true } },
      { text: metadata, kind: 'paragraph' },
      { text: detail, kind: 'bullet', list: { level: 0, ordered: false } },
    ]);
    expect(result.projects).toEqual([
      expect.objectContaining({
        name,
        technologies: metadata.split(' | '),
        achievements: [detail],
      }),
    ]);
    expect(result.skillRepresentations.map(({ name: skill }) => skill)).toEqual(metadata.split(' | '));
    expect(result.issues).toEqual([]);
  });

  it('does not promote a short metadata row to a fake project', () => {
    const result = projectResult([
      { text: 'Align', kind: 'paragraph', style: { bold: true } },
      { text: 'Next.js | PostgreSQL', kind: 'paragraph' },
      { text: 'Built an evidence-led career workflow.', kind: 'bullet' },
    ]);
    expect(result.projects.map(({ name }) => name)).toEqual(['Align']);
    expect(result.projects[0].technologies).toEqual(['Next.js', 'PostgreSQL']);
    expect(result.projects[0].achievements).toEqual(['Built an evidence-led career workflow.']);
  });

  it('starts peer styled projects and keeps their details separate', () => {
    const result = projectResult([
      { text: 'Service Review', kind: 'paragraph', style: { bold: true } },
      { text: 'Mapped a national support journey.', kind: 'bullet' },
      { text: 'Intake Redesign', kind: 'paragraph', style: { bold: true } },
      { text: 'Reduced hand-offs across three teams.', kind: 'bullet' },
    ]);
    expect(result.projects.map(({ name, achievements }) => ({ name, achievements }))).toEqual([
      { name: 'Service Review', achievements: ['Mapped a national support journey.'] },
      { name: 'Intake Redesign', achievements: ['Reduced hand-offs across three teams.'] },
    ]);
  });

  it('reads dates and project links from the identity block', () => {
    const result = projectResult([
      {
        text: 'Field Notes Portal | Jan 2022 - Mar 2023',
        kind: 'paragraph',
        style: { bold: true },
        linkDetails: [
          { url: 'https://github.com/example/field-notes', visibleText: 'Repository' },
          { url: 'https://field-notes.example.com', visibleText: 'Live demo' },
        ],
      },
      { text: 'Published an accessible research archive.', kind: 'bullet' },
    ]);
    expect(result.projects[0]).toMatchObject({
      name: 'Field Notes Portal',
      startDate: '2022-01',
      endDate: '2023-03',
      repositoryUrl: 'https://github.com/example/field-notes',
      liveUrl: 'https://field-notes.example.com',
    });
  });

  it('reads an independently linked project embedded in experience', () => {
    const sections = sectionDocument(document([
      { text: 'Experience', kind: 'heading', style: { headingLevel: 2 } },
      {
        text: 'Customer Evidence Hub',
        kind: 'paragraph',
        style: { bold: true },
        linkDetails: [{ url: 'https://github.com/example/evidence-hub', visibleText: 'Repository' }],
      },
      { text: 'Consolidated research evidence for six teams.', kind: 'bullet' },
    ]));
    expect(readProjectSections(sections).projects).toEqual([
      expect.objectContaining({ name: 'Customer Evidence Hub', repositoryUrl: 'https://github.com/example/evidence-hub' }),
    ]);
  });

  it('reports a cross-column detail instead of attaching it to a nearby project', () => {
    const result = projectResult([
      { text: 'Operations Review', kind: 'paragraph', style: { bold: true }, layout: { column: 1 } },
      { text: 'Reduced queue time by 20%.', kind: 'bullet', layout: { column: 0 } },
    ]);
    expect(result.projects[0].achievements).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'AMBIGUOUS_ENTITY_OWNERSHIP', blockIds: ['b2'] }),
    ]);
  });
});

describe('interpreter skills', () => {
  it('keeps slash compounds atomic while splitting explicit list separators', () => {
    const sections = sectionDocument(document([
      { text: 'Skills', kind: 'heading', style: { headingLevel: 2 } },
      { text: 'Testing: API/Integration Testing, CI/CD · OAuth/OIDC', kind: 'paragraph' },
    ]));
    expect(readSkillSections(sections, [])).toEqual([
      expect.objectContaining({ name: 'API/Integration Testing', category: 'Testing' }),
      expect.objectContaining({ name: 'CI/CD', category: 'Testing' }),
      expect.objectContaining({ name: 'OAuth/OIDC', category: 'Testing' }),
    ]);
  });

  it('normalizes Additional labels and preserves unknown explicit categories', () => {
    const sections = sectionDocument(document([
      { text: 'Skills', kind: 'heading', style: { headingLevel: 2 } },
      { text: 'Additional: Mentoring', kind: 'paragraph' },
      { text: 'Additional Skills: Facilitation', kind: 'paragraph' },
      { text: 'Fieldcraft: Route planning', kind: 'paragraph' },
    ]));
    expect(readSkillSections(sections, []).map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'Mentoring', category: 'Additional' },
      { name: 'Facilitation', category: 'Additional' },
      { name: 'Route planning', category: 'Fieldcraft' },
    ]);
  });

  it('uses list and table-cell boundaries without losing categories', () => {
    const sections = sectionDocument(document([
      { text: 'Skills', kind: 'heading', style: { headingLevel: 2 } },
      { text: 'Clinical', kind: 'table-cell', table: { table: 0, row: 0, column: 0 } },
      { text: 'Cannulation, Venepuncture', kind: 'table-cell', table: { table: 0, row: 0, column: 1 } },
      { text: 'Mentoring', kind: 'bullet', list: { level: 0, ordered: false } },
    ]));
    expect(readSkillSections(sections, []).map(({ name, category }) => ({ name, category }))).toEqual([
      { name: 'Cannulation', category: 'Clinical' },
      { name: 'Venepuncture', category: 'Clinical' },
      { name: 'Mentoring', category: undefined },
    ]);
  });

  it('preserves project and Skills-section representations until reconciliation', () => {
    const sections = sectionDocument(document([
      { text: 'Skills', kind: 'heading', style: { headingLevel: 2 } },
      { text: 'Languages: TypeScript', kind: 'paragraph' },
    ]));
    const projectRepresentations = [{
      name: 'TypeScript',
      excerpt: 'Align · TypeScript',
      sourceLocation: { line: 8, section: 'Projects' },
    }];
    expect(readSkillSections(sections, projectRepresentations)).toEqual([
      expect.objectContaining({ name: 'TypeScript', category: 'Languages' }),
      projectRepresentations[0],
    ]);
  });
});
