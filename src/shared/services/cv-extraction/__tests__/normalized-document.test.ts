import { describe, expect, it } from 'vitest';
import { projectNormalizedDocument } from '../document/projection';
import type { NormalizedDocument } from '../document/types';

describe('normalized document projection', () => {
  it('projects atomic blocks in deterministic order with stable line provenance', () => {
    const document: NormalizedDocument = {
      sourceType: 'pdf',
      pageCount: 1,
      blocks: [
        {
          id: 'pdf-p1-b2',
          order: 2,
          text: 'CI/CD',
          kind: 'table-cell',
          page: 1,
          table: { table: 0, row: 0, column: 1 },
        },
        {
          id: 'pdf-p1-b0',
          order: 0,
          text: '  Ｔｅｃｈｎｉｃａｌ\u00a0Ｓｋｉｌｌｓ  ',
          kind: 'heading',
          page: 1,
          style: { headingLevel: 2 },
        },
        {
          id: 'pdf-p1-empty',
          order: 3,
          text: ' \t ',
          kind: 'paragraph',
          page: 1,
        },
        {
          id: 'pdf-p1-b1',
          order: 1,
          text: '  API/Integration\t Testing ',
          kind: 'bullet',
          page: 1,
          list: { level: 0, ordered: false },
          links: ['HTTPS://Example.COM/profile/'],
        },
      ],
    };

    const projection = projectNormalizedDocument(document);

    expect(projection.text).toBe('Technical Skills\nAPI/Integration Testing\nCI/CD');
    expect([...projection.lineByBlockId.entries()]).toEqual([
      ['pdf-p1-b0', 0],
      ['pdf-p1-b1', 1],
      ['pdf-p1-b2', 2],
    ]);
    expect(projection.links).toEqual([
      {
        url: 'https://example.com/profile',
        page: 1,
        line: 1,
        visibleText: 'API/Integration Testing',
        surroundingText: 'API/Integration Testing',
      },
    ]);
  });

  it('is byte-stable across repeated projections', () => {
    const document: NormalizedDocument = {
      sourceType: 'docx',
      pageCount: null,
      blocks: [
        { id: 'docx-b0', order: 0, text: 'Résumé', kind: 'paragraph' },
        { id: 'docx-b1', order: 1, text: 'OAuth/OIDC', kind: 'link', links: ['https://example.com'] },
      ],
    };

    const serialize = () => {
      const projected = projectNormalizedDocument(document);
      return JSON.stringify({
        text: projected.text,
        lines: [...projected.lineByBlockId.entries()],
        links: projected.links,
      });
    };

    expect(serialize()).toBe(serialize());
  });
});
