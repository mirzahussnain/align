import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type FixtureCV =
  | 'warehouse-flt-no-projects'
  | 'junior-dev-with-projects'
  | 'hca-no-nmc'
  | 'care-worker-domiciliary'
  | 'registered-nurse-no-nmc'
  | 'paralegal-no-sra'
  | 'admin-office';

/** Load a golden fixture CV as the plain text `analyzeCV` receives after PDF extraction. */
export function loadFixtureCV(name: FixtureCV): string {
  return readFileSync(join(__dirname, 'cvs', `${name}.txt`), 'utf-8');
}
