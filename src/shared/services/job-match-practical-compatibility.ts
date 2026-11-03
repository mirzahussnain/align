import { extractVacancyRequirements } from '@/shared/services/job-intelligence';
import { comparePracticalCompatibility } from '@/shared/services/practical-compatibility';
import type { ConfirmedCandidateFacts } from '@/shared/types/practical-compatibility';

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const stringValue = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined;

const WORK_STYLES = new Set(['REMOTE', 'HYBRID', 'ONSITE']);
const SPONSORSHIP_SIGNALS = new Set([
  'AVAILABLE',
  'MAY_BE_CONSIDERED',
  'NOT_AVAILABLE',
  'RIGHT_TO_WORK_REQUIRED',
  'NOT_MENTIONED',
]);

export function buildMatchPracticalCompatibility(input: {
  jobRevision: {
    description: string;
    providerMetadataJson: unknown;
    sponsorshipMetadataJson: unknown;
  };
  practicalFacts: ConfirmedCandidateFacts | null;
}) {
  const provider = record(input.jobRevision.providerMetadataJson);
  const sponsorship = record(input.jobRevision.sponsorshipMetadataJson);
  const workStyleValue = stringValue(provider.workStyle)?.toUpperCase();
  const workStyle = workStyleValue && WORK_STYLES.has(workStyleValue) ? workStyleValue : undefined;
  const sponsorshipValue = stringValue(sponsorship.vacancySponsorshipSignal)?.toUpperCase();
  const sponsorshipSignal = sponsorshipValue && SPONSORSHIP_SIGNALS.has(sponsorshipValue)
    ? sponsorshipValue
    : undefined;
  const facts = input.practicalFacts ?? { professionalRegistrations: [] };

  return comparePracticalCompatibility(
    extractVacancyRequirements(input.jobRevision.description, workStyle as 'REMOTE' | 'HYBRID' | 'ONSITE' | undefined),
    facts,
    {
      city: stringValue(provider.city),
      region: stringValue(provider.region),
      country: stringValue(provider.country),
      locationText: stringValue(provider.locationText),
      workStyle,
      sponsorshipSignal: sponsorshipSignal as
        | 'AVAILABLE'
        | 'MAY_BE_CONSIDERED'
        | 'NOT_AVAILABLE'
        | 'RIGHT_TO_WORK_REQUIRED'
        | 'NOT_MENTIONED'
        | undefined,
    },
  );
}
