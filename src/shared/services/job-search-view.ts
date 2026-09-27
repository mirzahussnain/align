import { prisma } from "@/shared/lib/prisma";
import { sponsorSummary } from "@/shared/services/job-board-api";
import { assessDescriptionCompleteness } from "@/shared/services/job-description-completeness";
import { calculateDiscoveryRelevance } from "@/shared/services/job-intelligence";
import { materialiseTrustedProviderSnapshotIds } from "@/shared/services/job-snapshot";
import type { NormalisedJob } from "@/shared/types/job";
import type { CareerTrackDiscoveryInput } from "@/shared/types/job-intelligence";

function projectSearchJobCard(
  job: NormalisedJob,
  id: string,
  saved: boolean,
  careerTrack?: CareerTrackDiscoveryInput,
) {
  const salary =
    job.salaryText || job.salaryMin != null || job.salaryMax != null
      ? {
          ...(job.salaryText ? { text: job.salaryText } : {}),
          ...(job.salaryMin != null ? { min: job.salaryMin } : {}),
          ...(job.salaryMax != null ? { max: job.salaryMax } : {}),
          ...(job.salaryPeriod ? { period: job.salaryPeriod } : {}),
          ...(job.currency ? { currency: job.currency } : {}),
        }
      : undefined;
  const relevance = careerTrack
    ? calculateDiscoveryRelevance(
        {
          title: job.title,
          locationText: job.locationText,
          workStyle: job.remoteType,
          contractType: job.employmentType ?? job.contractType,
          salaryMax: job.salaryMax,
          descriptionAvailability: job.descriptionAvailability,
        },
        careerTrack,
      )
    : undefined;
  const completeness = assessDescriptionCompleteness({
    provider: job.source,
    description: job.description ?? null,
  });
  const externalUrl =
    job.providerReferences.find((reference) => reference.sourceUrl)?.sourceUrl ??
    job.canonicalUrl;

  return {
    id,
    title: job.title,
    company: {
      ...(job.companyRecordId ? { id: job.companyRecordId } : {}),
      displayName: job.company,
    },
    ...(job.locationText ? { location: job.locationText } : {}),
    ...(job.countryCode ? { countryCode: job.countryCode } : {}),
    descriptionAvailability: job.descriptionAvailability,
    hasReadableDescription: completeness.hasReadableText,
    ...(externalUrl ? { fullDescriptionExternalUrl: externalUrl } : {}),
    ...(job.remoteType !== "UNKNOWN" ? { workplaceType: job.remoteType } : {}),
    ...((job.employmentType ?? job.contractType)
      ? { employmentType: job.employmentType ?? job.contractType }
      : {}),
    ...(salary ? { salary } : {}),
    ...(job.postedAt ? { postedAt: job.postedAt } : {}),
    freshness: "FRESH" as const,
    sourceSummary: {
      preferredProvider: job.source,
      providerCount: job.providerReferences.length,
      employerDirect: Boolean(job.employerSourceId),
    },
    sponsorEvidenceSummary: sponsorSummary(job.sponsorSignal.registerMatchStatus),
    saved,
    ...(relevance ? { careerTrackRelevance: relevance.level } : {}),
  };
}

/** Public discovery projection. IDs are cache identities, never JobSnapshot IDs. */
export function projectPublicSearchJobCards(jobs: readonly NormalisedJob[]) {
  return jobs.map((job) => projectSearchJobCard(job, job.canonicalJobId, false));
}

/**
 * Materialise a provider-neutral search page into durable JobSnapshot cards.
 * Selection, details, save state and React identity all share this id.
 *
 * SHARED FIRST, PRIVATE SECOND. Everything above the per-card mapping is
 * user-independent; saved state and Career Track relevance are the only
 * user-specific fields and are merged in here, after the shared work. That
 * ordering is what allows the search and employer-ATS layers underneath to be
 * cached publicly at all.
 */
export async function materialiseSearchJobCards(
  jobs: NormalisedJob[],
  userId: string | null,
  careerTrack?: CareerTrackDiscoveryInput,
) {
  // One batched existence check for the whole page instead of one round trip per
  // card, and no re-read of what was just written.
  const snapshotIds = await materialiseTrustedProviderSnapshotIds(jobs);
  const materialised = jobs.map((job) => {
    const id = snapshotIds.get(job.canonicalJobId);
    if (!id) throw new Error("Unable to materialise a durable job snapshot.");
    return { job, id };
  });

  const ids = materialised.map(({ id }) => id);
  const savedIds =
    userId && ids.length
      ? new Set(
          (
            await prisma.savedJob.findMany({
              where: { userId, jobSnapshotId: { in: ids } },
              select: { jobSnapshotId: true },
            })
          ).map((item) => item.jobSnapshotId),
        )
      : new Set<string>();

  return materialised.map(({ job, id }) =>
    projectSearchJobCard(job, id, savedIds.has(id), careerTrack),
  );
}
