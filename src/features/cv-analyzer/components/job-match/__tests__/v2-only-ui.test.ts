import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JOB_MATCH_UI = join(process.cwd(), 'src/features/cv-analyzer/components/job-match');
const WIZARDS = [
  join(process.cwd(), 'src/features/cv-rewrite/components/RewriteWizardModal.tsx'),
  join(process.cwd(), 'src/features/cv-rewrite/components/GenerateCvWizardModal.tsx'),
];

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(path, files);
    } else if (/\.tsx?$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe('job-match UI contract', () => {
  it('contains no legacy job-match type, adapter, or rendering branch', () => {
    const forbidden = [
      /LegacyAIJobMatchOutput/,
      /AIJobMatchOutput/,
      /\bJobMatchData\b/,
      /mandatorySkills/,
      /desirableSkills/,
      /selectionCriteria/,
      /toLegacyJobMatchOutput/,
      /isJobMatchDataV2/,
    ];
    const offenders = [...sourceFiles(JOB_MATCH_UI), ...WIZARDS].filter((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden.some((pattern) => pattern.test(source));
    });

    expect(offenders).toEqual([]);
  });
});
