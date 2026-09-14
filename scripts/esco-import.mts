import { prisma } from '../src/shared/lib/prisma.ts';
import { importEscoSkills } from '../src/shared/services/esco-import.ts';

const args = process.argv.slice(2);
const position = args.indexOf('--path');
const datasetPath = position >= 0 ? args[position + 1] : process.env.ESCO_DATASET_PATH;

if (!datasetPath) {
  console.error('Missing ESCO dataset path. Use npm run esco:import -- --path "/path/to/extracted-esco-classification-en-csv" or set ESCO_DATASET_PATH.');
  process.exitCode = 1;
} else {
  try {
    const counts = await importEscoSkills(prisma, datasetPath);
    console.log(`ESCO import complete: inserted=${counts.inserted} updated=${counts.updated} skipped=${counts.skipped} invalid=${counts.invalid}`);
  } catch (error) {
    console.error(error instanceof Error ? `ESCO import failed: ${error.message}` : 'ESCO import failed.');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
