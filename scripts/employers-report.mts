import { prisma } from '../src/shared/lib/prisma.ts';
import { employerDirectoryReport } from '../src/shared/services/employer-directory.ts';

try {
  const [summary, rows] = await Promise.all([
    employerDirectoryReport(),
    prisma.employerJobSource.findMany({
      include: { companyRecord: { select: { displayName: true, country: true, industry: true, sponsorMatchStatus: true, sponsorOrganisationName: true } } },
      orderBy: [{ companyRecord: { displayName: 'asc' } }, { provider: 'asc' }],
    }),
  ]);
  console.table(rows.map((row) => ({
    Employer: row.companyRecord.displayName,
    Provider: row.provider,
    Identifier: row.providerIdentifier,
    'UK relevance': row.companyRecord.country === 'GB' ? 'GB candidate' : row.companyRecord.country ?? 'Unspecified',
    Verification: row.verificationStatus,
    'Jobs found': row.lastVerifiedJobCount ?? 'Not verified',
    'Sponsor evidence': row.companyRecord.sponsorMatchStatus === 'NOT_CHECKED' ? 'NOT_CHECKED' : `${row.companyRecord.sponsorMatchStatus}${row.companyRecord.sponsorOrganisationName ? ` (${row.companyRecord.sponsorOrganisationName})` : ''}`,
  })));
  console.log(JSON.stringify(summary, null, 2));
  const failures = rows.filter((row) => row.lastErrorCode).reduce<Record<string, number>>((counts, row) => {
    const code = row.lastErrorCode!;
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
  if (Object.keys(failures).length) console.log(`Failure breakdown: ${JSON.stringify(failures)}`);
} finally {
  await prisma.$disconnect();
}