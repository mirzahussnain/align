import { prisma } from "@/shared/lib/prisma";
import { sponsorSummary } from "@/shared/services/job-board-api";
import { assessDescriptionCompleteness } from "@/shared/services/job-description-completeness";
import { calculateDiscoveryRelevance } from "@/shared/services/job-intelligence";
import { findExistingJobSnapshots } from "@/shared/services/job-snapshot";
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

/** Shared read-only projection for anonymous and authenticated discovery. */
export async function projectSearchJobCards(
  jobs: readonly NormalisedJob[],
  userId: string | null,
  careerTrack?: CareerTrackDiscoveryInput,
) {
  const snapshots = await findExistingJobSnapshots(jobs);
  const snapshotIds = [...new Set(
    [...snapshots.values()].map((snapshot) => snapshot.id),
  )];
  const savedIds = userId && snapshotIds.length
    ? new Set((await prisma.savedJob.findMany({
        where: { userId, jobSnapshotId: { in: snapshotIds } },
        select: { jobSnapshotId: true },
      })).map((item) => item.jobSnapshotId))
    : new Set<string>();

  return jobs.map((job) => {
    const snapshot = snapshots.get(job.canonicalJobId);
    return {
      ...projectSearchJobCard(
        job,
        job.canonicalJobId,
        snapshot ? savedIds.has(snapshot.id) : false,
        careerTrack,
      ),
      canonicalJobId: job.canonicalJobId,
      ...(snapshot ? { jobSnapshotId: snapshot.id } : {}),
    };
  });
}
