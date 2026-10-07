import { describe, expect, it } from 'vitest';
import { groupSectionBlocks } from '../interpreter/grouping';
import { readExperienceSections } from '../interpreter/experience';
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
