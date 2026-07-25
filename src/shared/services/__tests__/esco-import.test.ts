import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { escoSkillFromRow, importEscoSkills } from '@/shared/services/esco-import';
import { normaliseSkillName } from '@/shared/utils/skill-normalization';

describe('ESCO import parsing', () => {
  it('preserves labels, punctuation, alternatives, descriptions and URI', () => {
    const parsed = escoSkillFromRow({
      conceptUri: 'http://data.europa.eu/esco/skill/example',
      preferredLabel: ' C++ developer ',
      altLabels: 'C plus plus developer\nC++ programmer',
      description: 'Build software with C++.',
      conceptType: 'KnowledgeSkillCompetence',
    });
    expect(parsed).toEqual({
      externalUri: 'http://data.europa.eu/esco/skill/example',
      preferredLabel: 'C++ developer',
      normalizedLabel: 'c++ developer',
      alternativeLabels: ['C plus plus developer', 'C++ programmer'],
      description: 'Build software with C++.',
      conceptType: 'KnowledgeSkillCompetence',
      searchText: 'c++ developer c plus plus developer c++ programmer',
    });
  });

  it('rejects malformed rows without creating a user skill', () => {
    expect(escoSkillFromRow({ preferredLabel: 'Python' })).toBeNull();
    expect(escoSkillFromRow({ conceptUri: 'uri' })).toBeNull();
  });

  it('normalises whitespace and case without erasing meaningful symbols', () => {
    expect(normaliseSkillName('  Node.js\t')).toBe('node.js');
    expect(normaliseSkillName('C#')).not.toBe(normaliseSkillName('C++'));
  });
});

describe('ESCO import persistence contract', () => {
  it('upserts fixture rows idempotently without touching user Skills', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'align-esco-fixture-'));
    writeFileSync(join(directory, 'skills_en.csv'), [
      'conceptUri,preferredLabel,altLabels,description,conceptType',
      'http://data.europa.eu/esco/skill/python,Python,"Python programming",Programming language,KnowledgeSkillCompetence',
      'http://data.europa.eu/esco/skill/warehouse,warehouse operations,"warehouse work",Warehouse process,Skill',
      ',Missing URI,,,'
    ].join('\n'));

    const rows = new Map<string, Record<string, unknown>>();
    const taxonomy = {
      findUnique: async ({ where }: { where: { externalUri: string } }) => rows.get(where.externalUri) ? { id: where.externalUri } : null,
      upsert: async ({ where, create }: { where: { externalUri: string }; create: Record<string, unknown> }) => {
        rows.set(where.externalUri, { ...create });
      },
    };
    const fakePrisma = { skillTaxonomyTerm: taxonomy } as never;
    try {
      await expect(importEscoSkills(fakePrisma, directory, 1)).resolves.toEqual({ inserted: 2, updated: 0, skipped: 0, invalid: 1 });
      await expect(importEscoSkills(fakePrisma, directory, 5)).resolves.toEqual({ inserted: 0, updated: 2, skipped: 0, invalid: 1 });
      expect(rows.get('http://data.europa.eu/esco/skill/python')).toMatchObject({ source: 'ESCO', sourceVersion: 'v1.2.1', preferredLabel: 'Python', alternativeLabels: ['Python programming'] });
      expect(rows.size).toBe(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});