import { createHash } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/shared/lib/prisma';
import { loadOwnedProfileData } from '@/features/dashboard/data/load-profile';
import { buildConfirmedCandidateFacts } from './practical-compatibility-store';
import { ANALYSIS_VERSIONS } from '@/shared/config/analysis-domain';
import { ANALYSIS_LIMITS } from '@/shared/policies';
import { APIError } from '@/shared/utils/api-error';

export interface CareerProfileSnapshotData {
  profile: NonNullable<Awaited<ReturnType<typeof loadOwnedProfileData>>>;
  practicalFacts: NonNullable<Awaited<ReturnType<typeof buildConfirmedCandidateFacts>>> | null;
}

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function evidenceCount(data: CareerProfileSnapshotData): number {
  const profile = data.profile;
  return profile.experience.length + profile.projects.length + profile.education.length +
    profile.skills.reduce((count, group) => count + group.skillItems.length, 0) +
    profile.certifications.length + profile.trainings.length + profile.licences.length +
    profile.professionalRegistrations.length + profile.languages.length +
    profile.volunteering.length + profile.otherEvidence.length;
}

export async function createCareerProfileSnapshot(args: {
  userId: string;
  profileId: string;
}) {
  const profile = await loadOwnedProfileData(args.userId, args.profileId);
  if (!profile) throw new APIError('Career Profile not found.', 404);
  const practicalFacts = await buildConfirmedCandidateFacts(args.userId, args.profileId);
  const snapshot: CareerProfileSnapshotData = { profile, practicalFacts };
  if (evidenceCount(snapshot) > ANALYSIS_LIMITS.maxEvidenceItems) {
    throw new APIError('This Career Profile contains too many evidence items for one match.', 413);
  }
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized, 'utf8') > ANALYSIS_LIMITS.maxProfileSnapshotBytes) {
    throw new APIError('This Career Profile is too large for one match.', 413);
  }

  return prisma.careerProfileSnapshot.create({
    data: {
      userId: args.userId,
      sourceProfileId: profile.profileId,
      profileLabel: profile.label,
      targetRole: profile.personal.targetRoleTitle || null,
      targetOccupation: profile.personal.targetOccupation || null,
      targetSeniority: profile.personal.targetSeniority || null,
      targetIndustry: profile.personal.targetIndustry || null,
      snapshotJson: JSON.parse(serialized) as Prisma.InputJsonValue,
      schemaVersion: ANALYSIS_VERSIONS.profileSnapshotSchema,
      contentHash: hash(serialized),
    },
  });
}
