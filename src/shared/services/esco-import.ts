import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Papa from 'papaparse';
import type { PrismaClient } from '../../generated/prisma/client.ts';
import { cleanSkillDisplayName, normaliseSkillName } from '../utils/skill-normalization.ts';

export const ESCO_SOURCE = 'ESCO';
export const ESCO_VERSION = 'v1.2.1';

export type EscoImportCounts = { inserted: number; updated: number; skipped: number; invalid: number };
export type EscoSkillRow = Record<string, string | undefined>;

export function resolveEscoSkillsFile(datasetPath: string): string {
  const supplied = resolve(datasetPath);
  if (!existsSync(supplied)) throw new Error('ESCO dataset path does not exist. Set ESCO_DATASET_PATH or pass --path to the extracted English Classification CSV directory.');
  if (!statSync(supplied).isDirectory()) throw new Error('ESCO imports require the extracted Classification CSV directory; unpack the supplied archive first.');
  const skillsFile = join(supplied, 'skills_en.csv');
  if (!existsSync(skillsFile)) throw new Error('Unsupported ESCO package: skills_en.csv was not found. Expected the English Classification CSV package.');
  return skillsFile;
}

export function escoSkillFromRow(row: EscoSkillRow) {
  const externalUri = row.conceptUri?.trim() ?? '';
  const preferredLabel = cleanSkillDisplayName(row.preferredLabel ?? '');
  if (!externalUri || !preferredLabel) return null;
  const alternativeLabels = [...new Set((row.altLabels ?? '').split(/\r?\n/u).map(cleanSkillDisplayName).filter(Boolean))];
  const description = cleanSkillDisplayName(row.description || row.definition || '');
  const conceptType = cleanSkillDisplayName(row.conceptType ?? '');
  return {
    externalUri,
    preferredLabel,
    normalizedLabel: normaliseSkillName(preferredLabel),
    alternativeLabels,
    description: description || null,
    conceptType: conceptType || null,
    searchText: [preferredLabel, ...alternativeLabels].map(normaliseSkillName).join(' '),
  };
}

/** Streaming, idempotent importer. It does not touch user-owned Skill rows. */
export async function importEscoSkills(prisma: PrismaClient, datasetPath: string, batchSize = 250): Promise<EscoImportCounts> {
  const skillsFile = resolveEscoSkillsFile(datasetPath);
  const counts: EscoImportCounts = { inserted: 0, updated: 0, skipped: 0, invalid: 0 };
  let batch: NonNullable<ReturnType<typeof escoSkillFromRow>>[] = [];

  const flush = async () => {
    const rows = batch;
    batch = [];
    for (const row of rows) {
      const existing = await prisma.skillTaxonomyTerm.findUnique({ where: { externalUri: row.externalUri }, select: { id: true } });
      await prisma.skillTaxonomyTerm.upsert({
        where: { externalUri: row.externalUri },
        create: { ...row, source: ESCO_SOURCE, sourceVersion: ESCO_VERSION },
        update: { ...row, source: ESCO_SOURCE, sourceVersion: ESCO_VERSION },
      });
      if (existing) counts.updated += 1; else counts.inserted += 1;
    }
  };

  await new Promise<void>((resolveImport, rejectImport) => {
    let chain = Promise.resolve();
    Papa.parse<EscoSkillRow>(createReadStream(skillsFile), {
      header: true,
      skipEmptyLines: 'greedy',
      step: (result, parser) => {
        parser.pause();
        chain = chain.then(async () => {
          const row = escoSkillFromRow(result.data);
          if (!row) { counts.invalid += 1; return; }
          batch.push(row);
          if (batch.length >= batchSize) await flush();
        }).then(() => parser.resume());
      },
      complete: () => { chain.then(async () => { if (batch.length) await flush(); resolveImport(); }).catch(rejectImport); },
      error: rejectImport,
    });
  });
  return counts;
}
