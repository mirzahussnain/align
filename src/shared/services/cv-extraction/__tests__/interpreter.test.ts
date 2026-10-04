import { describe, expect, it } from 'vitest';
import { groupSectionBlocks } from '../interpreter/grouping';
import { sectionDocument } from '../interpreter/sections';
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
