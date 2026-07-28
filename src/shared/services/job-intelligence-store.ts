import { getCacheStore } from '@/shared/lib/cache/cache-provider';
import { prisma } from '@/shared/lib/prisma';
import { getProviderCapabilities } from '@/shared/services/job-providers/capabilities';
import { logJobBoardEvent } from '@/shared/services/job-board-observability';
import {
  SPONSOR_REGISTER_DISCLAIMER,
  assessDescription,
  assessVacancySponsorship,
  calculateDiscoveryRelevance,
  compareCandidateToVacancy,
  extractVacancyRequirements,
} from '@/shared/services/job-intelligence';
import { descriptionHash, resolveSelectedDescription } from '@/shared/services/job-snapshot';
import { matchSponsorCompaniesCached } from '@/shared/services/sponsor-match-cache';
import { getSponsorRegisterVersion } from '@/shared/services/sponsor-registry';
import type {
  CandidatePracticalProfile,
  CareerTrackDiscoveryInput,
  EmployerSponsorEvidence,
  JobIntelligenceViewModel,
} from '@/shared/types/job-intelligence';
import type { JobProvider } from '@/shared/types/job';

const asJson = <T>(value: T) => JSON.parse(JSON.stringify(value));

function meaningfulEmployerName(name: string): boolean {
  const compact = name.replace(/\s+/g, ' ').trim();
  return compact.length >= 2 && compact.length <= 256 && /[\p{L}\p{N}]/u.test(compact) && !/^(unknown|n\/?a|not supplied)$/i.test(compact);
}

export async function getEmployerSponsorEvidence(employerName: string): Promise<EmployerSponsorEvidence> {
  const queriedEmployerName = employerName.trim();
  if (!meaningfulEmployerName(queriedEmployerName)) {
    return { status: 'NOT_CHECKED', queriedEmployerName, reasons: ['The employer name is missing or malformed, so it was not sent to the sponsor register matcher.'] };
  }
  try {
    const [registerVersion, matches] = await Promise.all([
      getSponsorRegisterVersion(),
      matchSponsorCompaniesCached(getCacheStore(), [queriedEmployerName]),
    ]);
    const match = matches.get(queriedEmployerName);
    const status = match?.status ?? 'NONE';
    return {
      status,
      queriedEmployerName,
      ...(match?.organisationName ? { matchedOrganisationName: match.organisationName } : {}),
      registerVersion,
      checkedAt: new Date().toISOString(),
      reasons: [
        status === 'EXACT'
          ? 'The employer name exactly matches an organisation on the sponsor register.'
          : status === 'LIKELY'
            ? 'A similar organisation name was found on the sponsor register.'
            : status === 'AMBIGUOUS'
              ? 'More than one similar organisation was found on the sponsor register.'
              : 'No matching organisation was found on the sponsor register.',
      ],
    };
  } catch {
    return { status: 'NOT_CHECKED', queriedEmployerName, reasons: ['Sponsor-register evidence could not be checked at this time.'] };
  }
}

export async function buildCandidatePracticalProfile(userId: string, profileId: string): Promise<CandidatePracticalProfile | null> {
  const [identity, profile] = await Promise.all([
    prisma.profileIdentity.findUnique({ where: { userId }, select: { visaStatus: true } }),
    prisma.profile.findFirst({
      where: { id: profileId, userId },
      select: {
        licences: { select: { officialName: true, status: true } },
        professionalRegistrations: { select: { issuingBody: true, status: true } },
      },
    }),
  ]);
  if (!profile) return null;
  const registrations = profile.professionalRegistrations.map((registration) => ({
    body: registration.issuingBody,
    status: /active|current|valid/i.test(registration.status ?? '') ? 'ACTIVE' as const : /pending/i.test(registration.status ?? '') ? 'PENDING' as const : 'EXPIRED' as const,
  }));
  const driving = profile.licences.find((licence) => /driving licen[cs]e/i.test(licence.officialName));
  // `visaStatus` is structured but does not have a universal legal mapping.
  // Only an explicit profile value is used; every other case stays unknown.
  const visa = String(identity?.visaStatus ?? '');
  return {
    ...(visa === 'REQUIRES_SPONSORSHIP' ? { requiresSponsorshipNow: true } : {}),
    ...(visa === 'RIGHT_TO_WORK_CONFIRMED' ? { hasConfirmedRightToWork: true } : {}),
    ...(driving ? { drivingLicenceHeld: !/expired|not held/i.test(driving.status ?? '') } : {}),
    professionalRegistrations: registrations,
  };
}

export async function assessAndPersistJobIntelligence(input: {
  jobSnapshotId: string;
  careerTrack?: CareerTrackDiscoveryInput | null;
  candidate?: CandidatePracticalProfile | null;
}): Promise<JobIntelligenceViewModel | null> {
  const snapshot = await prisma.jobSnapshot.findUnique({
    where: { id: input.jobSnapshotId },
    include: { providerReferences: { orderBy: { firstSeenAt: 'asc' } } },
  });
  if (!snapshot) return null;
  const selected = resolveSelectedDescription(snapshot);
  const sourceProvider = snapshot.providerReferences[0]?.provider as JobProvider | undefined;
  const description = assessDescription({
    providerAvailability: snapshot.descriptionAvailability,
    providerText: snapshot.providerDescription,
    userText: snapshot.userSuppliedDescription,
    ...(sourceProvider ? { providerSemantics: getProviderCapabilities(sourceProvider).descriptionSemantics } : {}),
  });
  const startedAt = Date.now();
  const selectedText = selected?.text ?? '';
  const descriptionStartedAt = Date.now();
  const employerPromise = getEmployerSponsorEvidence(snapshot.employerName);
  const vacancy = assessVacancySponsorship(selectedText);
  logJobBoardEvent('vacancy_intelligence_stage', { cacheLayer: 'sponsorship-wording', durationMs: Date.now() - descriptionStartedAt });
  const requirements = extractVacancyRequirements(selectedText, (snapshot.workStyle ?? undefined) as 'ONSITE' | 'HYBRID' | 'REMOTE' | 'UNKNOWN' | undefined);
  logJobBoardEvent('vacancy_intelligence_stage', { cacheLayer: 'requirements', durationMs: Date.now() - descriptionStartedAt });
  const employer = await employerPromise;
  logJobBoardEvent('vacancy_intelligence_stage', { cacheLayer: 'sponsor-evidence', durationMs: Date.now() - descriptionStartedAt });
  const practicalStartedAt = Date.now();
  const practicalAssessment = input.candidate ? compareCandidateToVacancy(requirements, input.candidate) : undefined;
  logJobBoardEvent('vacancy_intelligence_stage', { cacheLayer: 'candidate-comparison', durationMs: Date.now() - practicalStartedAt });
  const relevance = input.careerTrack ? calculateDiscoveryRelevance({ title: snapshot.title, locationText: snapshot.locationText, workStyle: snapshot.workStyle, seniority: snapshot.seniority, contractType: snapshot.contractType, salaryMax: snapshot.salaryMax ? Number(snapshot.salaryMax) : null, descriptionAvailability: snapshot.descriptionAvailability }, input.careerTrack) : undefined;
  logJobBoardEvent('vacancy_intelligence_stage', { cacheLayer: 'relevance', durationMs: Date.now() - practicalStartedAt });
  const assessedAt = new Date().toISOString();
  await prisma.jobSnapshot.update({
    where: { id: snapshot.id },
    data: {
      selectedDescriptionSource: selected?.source ?? null,
      selectedDescriptionHash: selected ? descriptionHash(selected.text) : null,
      descriptionAssessment: asJson(description),
      employerSponsorEvidence: asJson(employer),
      vacancySponsorshipSignal: asJson(vacancy),
      requirementEvidence: asJson(requirements),
      intelligenceAssessedAt: new Date(assessedAt),
    },
  });
  logJobBoardEvent('vacancy_intelligence_completed', { durationMs: Date.now() - startedAt });
  return {
    description,
    sponsorship: { employer, vacancy, disclaimer: SPONSOR_REGISTER_DISCLAIMER },
    requirements,
    ...(practicalAssessment ? { practicalAssessment } : {}),
    ...(relevance ? { relevance } : {}),
    assessedAt,
  };
}
