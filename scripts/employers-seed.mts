import { prisma } from '../src/shared/lib/prisma.ts';
import { seedEmployerDirectory } from '../src/shared/services/employer-directory.ts';
import { EMPLOYER_DIRECTORY_SEED } from '../src/shared/services/employer-directory-seed.ts';

try {
  const result = await seedEmployerDirectory(EMPLOYER_DIRECTORY_SEED);
  console.log(`Employer directory seed complete: companies=${result.companies} source declarations=${result.sources}. All new sources are PENDING and disabled.`);
} finally {
  await prisma.$disconnect();
}