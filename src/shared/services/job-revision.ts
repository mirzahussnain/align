import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { APIError } from '@/shared/utils/api-error';
import { resolveMatchRequest } from './job-snapshot';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

export async function createJobRevisionFromRequest(args: {
  userId: string;
  requestId: string;
}) {
  const resolved = await resolveMatchRequest(args.userId, args.requestId);
  if (!resolved) throw new APIError('This Job Match request is invalid or has expired.', 404);
  const { request, selected } = resolved;
  const snapshot = request.jobSnapshot;

  return prisma.jobRevision.create({
    data: {
      // Shared provider input has no private owner. A user override or imported
      // vacancy is private and can never be resolved by another account.
      userId: selected.source === 'USER_PASTED' || snapshot.importedByUserId ? args.userId : null,
      jobSnapshotId: snapshot.id,
      title: snapshot.title,
      company: snapshot.employerName,
      location: snapshot.locationText,
      description: selected.text,
      descriptionSource: selected.source,
      descriptionHash: selected.hash,
      providerMetadataJson: json({
        canonicalJobId: snapshot.canonicalJobId,
        providerReferences: snapshot.providerReferences.map((item) => ({
          provider: item.provider,
          providerJobId: item.providerJobId,
          providerUrl: item.providerUrl,
        })),
        descriptionAvailability: selected.availability,
        capturedAt: new Date().toISOString(),
      }),
      sponsorshipMetadataJson: json({
        employerSponsorEvidence: snapshot.employerSponsorEvidence,
        vacancySponsorshipSignal: snapshot.vacancySponsorshipSignal,
        requirementEvidence: snapshot.requirementEvidence,
      }),
    },
  });
}
