import { prisma } from '../lib/prisma.ts';
import { normaliseEmployerName } from './employer-name.ts';
import type { EmployerDirectorySeed } from '../types/employer-source.ts';

/**
 * Replays only reproducible directory declarations. It never promotes a source,
 * changes a manual company correction, or writes live verification outcomes.
 */
export async function seedEmployerDirectory(entries: readonly EmployerDirectorySeed[], client = prisma) {
  let companies = 0;
  let sources = 0;
  for (const entry of entries) {
    const normalisedName = normaliseEmployerName(entry.normalisedName || entry.displayName);
    if (!normalisedName) throw new Error(`Seed company has no usable identity: ${entry.displayName}`);
    const company = await client.companyRecord.upsert({
      where: { normalisedName },
      create: {
        displayName: entry.displayName,
        normalisedName,
        country: entry.country,
        industry: entry.industry ?? null,
        websiteUrl: entry.websiteUrl ?? null,
        careersUrl: entry.careersUrl ?? null,
      },
      // A curated rerun must not overwrite a manual correction or any sponsor evidence.
      update: {},
    });
    companies += 1;
    for (const candidate of entry.sources) {
      const existing = await client.employerJobSource.findUnique({
        where: { provider_providerIdentifier: { provider: candidate.provider, providerIdentifier: candidate.providerIdentifier } },
        select: { id: true, companyRecordId: true },
      });
      if (existing && existing.companyRecordId !== company.id) {
        throw new Error(`Seed source ${candidate.provider}:${candidate.providerIdentifier} already belongs to another company.`);
      }
      await client.employerJobSource.upsert({
        where: { provider_providerIdentifier: { provider: candidate.provider, providerIdentifier: candidate.providerIdentifier } },
        create: {
          companyRecordId: company.id,
          provider: candidate.provider,
          providerIdentifier: candidate.providerIdentifier,
          providerRegion: candidate.leverRegion ?? null,
          careersUrl: entry.careersUrl ?? null,
          sourceOrigin: candidate.sourceOrigin,
          verificationStatus: 'PENDING',
          enabled: false,
        },
        // Seed is declarative only: preserve verification, errors, enablement, URLs,
        // and any association an administrator has already checked.
        update: {},
      });
      sources += 1;
    }
  }
  return { companies, sources };
}

export async function listEmployerSources(client = prisma) {
  return client.employerJobSource.findMany({
    include: { companyRecord: true },
    orderBy: [{ companyRecord: { displayName: 'asc' } }, { provider: 'asc' }],
  });
}

export async function enableVerifiedEmployerSource(sourceId: string, client = prisma) {
  const source = await client.employerJobSource.findUnique({ where: { id: sourceId } });
  if (!source) return null;
  if (source.verificationStatus !== 'VERIFIED') {
    throw new Error('Only a verified employer source can be enabled.');
  }
  return client.employerJobSource.update({ where: { id: sourceId }, data: { enabled: true } });
}

export async function disableEmployerSource(sourceId: string, client = prisma) {
  return client.employerJobSource.update({ where: { id: sourceId }, data: { enabled: false } });
}

/** Retry is explicit and never silently re-enables or re-verifies a failed board. */
export async function retryFailedEmployerSource(sourceId: string, client = prisma) {
  const source = await client.employerJobSource.findUnique({ where: { id: sourceId } });
  if (!source) return null;
  if (source.verificationStatus !== 'FAILED') throw new Error('Only a failed source can be retried.');
  return client.employerJobSource.update({
    where: { id: sourceId },
    data: { verificationStatus: 'PENDING', enabled: false, lastErrorCode: null, lastErrorAt: null },
  });
}

/** Association changes are deliberately an explicit service operation, never a fuzzy seed merge. */
export async function updateEmployerSourceCompany(sourceId: string, companyRecordId: string, client = prisma) {
  const company = await client.companyRecord.findUnique({ where: { id: companyRecordId }, select: { id: true } });
  if (!company) throw new Error('Target company does not exist.');
  return client.employerJobSource.update({ where: { id: sourceId }, data: { companyRecordId, enabled: false } });
}

/**
 * Sponsor enrichment remains entirely separate from ATS verification.
 *
 * This used to be the only sponsor-writing code in the repository — and it had
 * NO CALLERS, which is why every CompanyRecord sat on its `NOT_CHECKED` default
 * and the board reported "Sponsor-register evidence not checked" for everything.
 * It now delegates to the one service that owns staleness, failure handling and
 * provenance, so there is a single write path rather than two that can disagree.
 */
export async function enrichCompanySponsorEvidence(companyRecordId: string, client = prisma) {
  const { ensureCompanySponsorEvidence } = await import('./company-sponsor-evidence.ts');
  const result = await ensureCompanySponsorEvidence(companyRecordId, { force: true, client });
  if (result.outcome === 'COMPANY_NOT_FOUND') return null;
  return client.companyRecord.findUnique({ where: { id: companyRecordId } });
}

export type EmployerDirectoryReport = {
  totalCompanies: number;
  totalSources: number;
  verified: number;
  pending: number;
  failed: number;
  enabled: number;
  validEmptyBoards: number;
  jobsFound: number;
  providerDistribution: Record<string, number>;
  industryDistribution: Record<string, number>;
};

/** Counts durable source state only; it never performs an expensive network request. */
export async function employerDirectoryReport(client = prisma): Promise<EmployerDirectoryReport> {
  const [companies, sources] = await Promise.all([
    client.companyRecord.findMany({ select: { industry: true } }),
    client.employerJobSource.findMany({ select: { provider: true, verificationStatus: true, enabled: true, lastErrorCode: true, lastVerifiedJobCount: true } }),
  ]);
  const providerDistribution: Record<string, number> = {};
  for (const source of sources) providerDistribution[source.provider] = (providerDistribution[source.provider] ?? 0) + 1;
  const industryDistribution: Record<string, number> = {};
  for (const company of companies) {
    const industry = company.industry ?? 'Unspecified';
    industryDistribution[industry] = (industryDistribution[industry] ?? 0) + 1;
  }
  return {
    totalCompanies: companies.length,
    totalSources: sources.length,
    verified: sources.filter((source) => source.verificationStatus === 'VERIFIED').length,
    pending: sources.filter((source) => source.verificationStatus === 'PENDING').length,
    failed: sources.filter((source) => source.verificationStatus === 'FAILED').length,
    enabled: sources.filter((source) => source.enabled).length,
    // Verification deliberately does not persist volatile job counts. This count
    // is exposed as zero until a future durable, non-catalogue metric is designed.
    validEmptyBoards: sources.filter((source) => source.verificationStatus === 'VERIFIED' && source.lastVerifiedJobCount === 0).length,
    jobsFound: sources.reduce((total, source) => total + (source.lastVerifiedJobCount ?? 0), 0),
    providerDistribution,
    industryDistribution,
  };
}
export { normaliseEmployerName };
