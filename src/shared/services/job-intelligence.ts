import type {
  CandidatePracticalProfile,
  CareerTrackDiscoveryInput,
  DescriptionAssessment,
  DiscoveryRelevance,
  PracticalVacancyAssessment,
  VacancyRequirementCategory,
  VacancyRequirementEvidence,
  VacancySponsorshipAssessment,
} from '@/shared/types/job-intelligence';
import type { JobDescriptionAvailability, JobRemoteType } from '@/shared/types/job';

export const VACANCY_INTELLIGENCE_DISCLAIMER =
  'This is a practical comparison of stated vacancy wording and confirmed profile information, not legal immigration advice. Confirm requirements directly with the employer.';
export const SPONSOR_REGISTER_DISCLAIMER =
  'Appearing on the sponsor register does not mean this particular vacancy offers sponsorship. Confirm directly with the employer.';

const compact = (text: string) => text.replace(/\s+/g, ' ').trim();
const sentence = (text: string, start: number, end: number) => compact(text.slice(Math.max(0, text.lastIndexOf('.', start) + 1), Math.min(text.length, text.indexOf('.', end) === -1 ? text.length : text.indexOf('.', end) + 1))).slice(0, 300);
const matchEvidence = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((match) => ({ text: sentence(text, match.index ?? 0, (match.index ?? 0) + match[0].length), start: match.index, end: (match.index ?? 0) + match[0].length }));

export function assessDescription(input: {
  providerAvailability: JobDescriptionAvailability;
  providerText?: string | null;
  userText?: string | null;
  providerSemantics?: 'FULL' | 'PARTIAL' | 'SNIPPET' | 'UNKNOWN';
  detailsReturnedRicherContent?: boolean;
}): DescriptionAssessment {
  const userText = compact(input.userText ?? '');
  const providerText = compact(input.providerText ?? '');
  const text = userText || providerText;
  const source = userText ? 'USER_PASTED' as const : providerText ? input.providerAvailability === 'FULL' ? 'PROVIDER_FULL' as const : 'PROVIDER_PARTIAL' as const : null;
  if (!text) return { availability: 'EXTERNAL_ONLY', confidence: 'HIGH', reasons: ['No vacancy description was supplied; only an external listing may contain it.'], source: null };
  const terminalEllipsis = /(?:\.\.\.|…)(?:\s*)$/.test(text) || /(?:\.\.\.|…)\s*(?:more|read more)$/i.test(text);
  const incompleteEnd = /[\p{L}\p{N},;:]$/u.test(text) && !/[.!?]$/.test(text);
  const sections = ['responsibilit', 'requirement', 'essential', 'desirable', 'benefit', 'about (?:the )?(?:role|team|you)', 'person specification'].filter((term) => new RegExp(term, 'i').test(text));
  const reasons: string[] = [];
  let availability: JobDescriptionAvailability = input.providerAvailability;
  let confidence: DescriptionAssessment['confidence'] = 'MEDIUM';
  if (userText) {
    availability = terminalEllipsis || incompleteEnd ? 'PARTIAL' : 'FULL';
    confidence = terminalEllipsis || incompleteEnd ? 'MEDIUM' : sections.length >= 2 || text.length < 500 ? 'MEDIUM' : 'HIGH';
    reasons.push('User-pasted description was assessed separately from the provider description.');
  } else if (input.providerAvailability === 'EXTERNAL_ONLY') {
    availability = 'EXTERNAL_ONLY'; confidence = 'HIGH'; reasons.push('The provider did not supply description text.');
  } else if (input.providerSemantics === 'SNIPPET' || input.providerSemantics === 'PARTIAL') {
    availability = 'PARTIAL'; confidence = 'HIGH'; reasons.push('The provider adapter declares this field as a snippet or partial description.');
  } else if (terminalEllipsis || incompleteEnd) {
    availability = 'PARTIAL'; confidence = 'HIGH'; reasons.push('The description ends with a truncation marker or incomplete sentence.');
  } else if (input.detailsReturnedRicherContent) {
    availability = 'PARTIAL'; confidence = 'HIGH'; reasons.push('A provider details endpoint returned richer content than this description.');
  } else if (input.providerAvailability === 'FULL' && sections.length >= 2) {
    availability = 'FULL'; confidence = 'HIGH'; reasons.push('Provider-declared full text contains multiple meaningful vacancy sections.');
  } else {
    availability = input.providerAvailability === 'FULL' ? 'FULL' : 'PARTIAL';
    confidence = input.providerAvailability === 'FULL' ? 'LOW' : 'MEDIUM';
    reasons.push(input.providerAvailability === 'FULL' ? 'The adapter declared full text, but completeness signals are limited.' : 'The provider did not establish this as a complete advert.');
  }
  if (terminalEllipsis && !reasons.some((reason) => reason.includes('truncation'))) reasons.push('Terminal ellipsis indicates the text may be truncated.');
  return { availability, confidence, reasons, source };
}

export function assessVacancySponsorship(text: string): VacancySponsorshipAssessment {
  const patterns = {
    unavailable: /\b(?:no|not|unable to|cannot|can(?:not|'t))\s+(?:offer|provide|support)?\s*(?:skilled worker |visa )?sponsorship\b|\bno visa support\b/gi,
    rightToWork: /\b(?:must|need to|applicants? must|you must|already)\s+(?:already\s+)?(?:have|hold)\s+(?:an?\s+)?(?:the\s+)?(?:existing\s+)?(?:right[- ]to[- ]work|right to work in (?:the\s+)?uk)\b/gi,
    available: /\b(?:skilled worker |visa )?sponsorship\s+(?:is )?(?:available|provided|offered)\b|\bcertificate of sponsorship\b/gi,
    maybe: /\b(?:skilled worker |visa )?sponsorship\s+(?:may|might|can|will)?\s*(?:be )?(?:considered|possible|supported)\b/gi,
  };
  const restrictive = [...matchEvidence(text, patterns.unavailable), ...matchEvidence(text, patterns.rightToWork)];
  const positive = [...matchEvidence(text, patterns.available), ...matchEvidence(text, patterns.maybe)];
  if (restrictive.length && positive.length) return { signal: restrictive.some((item) => /sponsor|visa support/i.test(item.text)) ? 'NOT_AVAILABLE' : 'RIGHT_TO_WORK_REQUIRED', evidence: [...restrictive, ...positive], confidence: 'LOW', reasons: ['Contradictory sponsorship wording was found. The restrictive interpretation is shown; confirm manually with the employer.'] };
  if (restrictive.length) {
    const noSponsorship = restrictive.some((item) => /sponsor|visa support/i.test(item.text));
    return { signal: noSponsorship ? 'NOT_AVAILABLE' : 'RIGHT_TO_WORK_REQUIRED', evidence: restrictive, confidence: 'HIGH', reasons: [noSponsorship ? 'The vacancy explicitly says sponsorship is not available.' : 'The vacancy explicitly requires an existing right to work.'] };
  }
  if (positive.length) {
    const available = positive.some((item) => /available|provided|offered|certificate of sponsorship/i.test(item.text));
    return { signal: available ? 'AVAILABLE' : 'MAY_BE_CONSIDERED', evidence: positive, confidence: available ? 'HIGH' : 'MEDIUM', reasons: [available ? 'The vacancy explicitly mentions sponsorship being available.' : 'The vacancy says sponsorship may be considered.'] };
  }
  return { signal: 'NOT_MENTIONED', evidence: [], confidence: 'HIGH', reasons: ['No sponsorship wording was found in the selected description.'] };
}

type RequirementRule = { category: VacancyRequirementCategory; pattern: RegExp; value?: (match: RegExpMatchArray) => string; requirement?: VacancyRequirementEvidence['requirement'] };
const requirementRules: RequirementRule[] = [
  { category: 'RIGHT_TO_WORK', pattern: /\b(?:must|need to|applicants? must|you must|already)\s+(?:already\s+)?(?:have|hold)\s+(?:an?\s+)?(?:the\s+)?(?:existing\s+)?(?:right[- ]to[- ]work|right to work in (?:the\s+)?uk)\b/gi, requirement: 'REQUIRED' },
  { category: 'SPONSORSHIP', pattern: /\b(?:no|not|unable to|cannot)\s+(?:offer|provide|support)?\s*(?:skilled worker |visa )?sponsorship\b/gi, requirement: 'REQUIRED' },
  { category: 'UK_RESIDENCY', pattern: /\b(?:must have lived|(?:three|four|five|\d+) years?(?:'|’)?\s+(?:continuous )?uk residency|residency required for vetting)\b[^.]{0,80}/gi, value: (match) => match[0], requirement: 'REQUIRED' },
  { category: 'SECURITY_CLEARANCE', pattern: /\b(?:must (?:already )?(?:hold|have)|existing)\s+(?:an? )?(SC|DV|BPSS|CTC|security clearance)\b/gi, value: (match) => match[1]?.toUpperCase(), requirement: 'REQUIRED' },
  { category: 'SECURITY_CLEARANCE', pattern: /\b(?:eligible to obtain|able to obtain|willing to undergo)\s+(?:an? )?(SC|DV|BPSS|CTC|security clearance)\b/gi, value: (match) => `Eligible to obtain ${match[1]?.toUpperCase() ?? 'clearance'}`, requirement: 'MENTIONED' },
  { category: 'DBS', pattern: /\b(Basic|Standard|Enhanced)\s+DBS(?:\s+(?:check|clearance))?(?:[^.]{0,80})/gi, value: (match) => match[1].toUpperCase(), requirement: 'REQUIRED' },
  { category: 'DBS', pattern: /\bDBS\s+Update Service\b/gi, value: () => 'Update Service', requirement: 'REQUIRED' },
  { category: 'PROFESSIONAL_REGISTRATION', pattern: /\b(NMC|GPhC|HCPC|GMC|SRA|ACCA)\s+(?:registration|registered|registrant)\b/gi, value: (match) => match[1].toUpperCase(), requirement: 'REQUIRED' },
  { category: 'DRIVING_LICENCE', pattern: /\b(?:full |valid )?(?:uk )?driving licen[cs]e\s+(?:is )?(?:required|essential|preferred)\b/gi, requirement: 'REQUIRED' },
  { category: 'OWN_VEHICLE', pattern: /\b(?:own vehicle|access to (?:your )?own (?:car|vehicle))\s+(?:is )?(?:required|essential|preferred)\b/gi, requirement: 'REQUIRED' },
  { category: 'ONSITE', pattern: /\b(?:fully onsite|on[- ]site|hybrid\s+(?:\d+|one|two|three|four|five)\s+days?(?:\s+per\s+week)?)\b/gi, requirement: 'MENTIONED' },
  { category: 'TRAVEL', pattern: /\b(?:occasional |regular )?(?:uk |regional |international )?travel(?:\s+(?:across|to))?[^.]{0,80}\b/gi, requirement: 'MENTIONED' },
];

export function extractVacancyRequirements(text: string, remoteType?: JobRemoteType): VacancyRequirementEvidence[] {
  const extracted: VacancyRequirementEvidence[] = [];
  for (const rule of requirementRules) {
    for (const match of text.matchAll(rule.pattern)) {
      extracted.push({ category: rule.category, requirement: /preferred/i.test(match[0]) ? 'PREFERRED' : rule.requirement ?? 'MENTIONED', ...(rule.value ? { value: rule.value(match) } : {}), evidenceText: sentence(text, match.index ?? 0, (match.index ?? 0) + match[0].length), confidence: 'HIGH' });
    }
  }
  if (remoteType === 'ONSITE' && !extracted.some((item) => item.category === 'ONSITE')) extracted.push({ category: 'ONSITE', requirement: 'MENTIONED', value: 'Onsite location metadata', evidenceText: 'The vacancy location is marked onsite.', confidence: 'MEDIUM' });
  return extracted;
}

export function compareCandidateToVacancy(requirements: VacancyRequirementEvidence[], candidate: CandidatePracticalProfile): PracticalVacancyAssessment {
  const findings: PracticalVacancyAssessment['findings'] = [];
  const add = (category: VacancyRequirementCategory, status: PracticalVacancyAssessment['findings'][number]['status'], title: string, explanation: string, vacancyEvidence?: string, candidateEvidence?: string) => findings.push({ category, status, title, explanation, ...(vacancyEvidence ? { vacancyEvidence } : {}), ...(candidateEvidence ? { candidateEvidence } : {}) });
  for (const requirement of requirements) {
    if (requirement.requirement === 'NOT_DETECTED') continue;
    if (requirement.category === 'SPONSORSHIP') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.requiresSponsorshipNow === true ? add('SPONSORSHIP', 'POTENTIAL_ISSUE', 'Potential sponsorship issue', 'The vacancy says sponsorship is unavailable and your profile says sponsorship is currently required.', requirement.evidenceText, 'Requires sponsorship now') : candidate.requiresSponsorshipNow === false ? add('SPONSORSHIP', 'ALIGNED', 'No obvious blocker found', 'Your confirmed profile does not say sponsorship is currently required.', requirement.evidenceText, 'Does not require sponsorship now') : add('SPONSORSHIP', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy mentions sponsorship, but your confirmed sponsorship status is unknown.', requirement.evidenceText);
    } else if (requirement.category === 'RIGHT_TO_WORK') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.hasConfirmedRightToWork === true ? add('RIGHT_TO_WORK', 'ALIGNED', 'No obvious blocker found', 'Your profile confirms right to work.', requirement.evidenceText, 'Confirmed right to work') : add('RIGHT_TO_WORK', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy requires right to work, but the profile does not confirm it.', requirement.evidenceText);
    } else if (requirement.category === 'DRIVING_LICENCE') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.drivingLicenceHeld === true ? add('DRIVING_LICENCE', 'ALIGNED', 'No obvious blocker found', 'Your profile confirms a driving licence.', requirement.evidenceText) : candidate.drivingLicenceHeld === false ? add('DRIVING_LICENCE', 'POTENTIAL_ISSUE', 'Potential issue', 'The vacancy requires a driving licence and your profile says one is not held.', requirement.evidenceText) : add('DRIVING_LICENCE', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy requires a driving licence, but this is not confirmed in your profile.', requirement.evidenceText);
    } else if (requirement.category === 'OWN_VEHICLE') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.ownVehicleAvailable === true ? add('OWN_VEHICLE', 'ALIGNED', 'No obvious blocker found', 'Your profile confirms own-vehicle availability.', requirement.evidenceText) : candidate.ownVehicleAvailable === false ? add('OWN_VEHICLE', 'POTENTIAL_ISSUE', 'Potential issue', 'The vacancy requires an own vehicle and your profile says one is unavailable.', requirement.evidenceText) : add('OWN_VEHICLE', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy requires an own vehicle, but this is not confirmed in your profile.', requirement.evidenceText);
    } else if (requirement.category === 'ONSITE') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.willingToWorkOnsite === true ? add('ONSITE', 'ALIGNED', 'No obvious blocker found', 'Your profile indicates onsite work is acceptable.', requirement.evidenceText) : candidate.willingToWorkOnsite === false ? add('ONSITE', 'POTENTIAL_ISSUE', 'Potential issue', 'The vacancy includes onsite work and your profile says it is not acceptable.', requirement.evidenceText) : add('ONSITE', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy includes onsite work, but this preference is unknown.', requirement.evidenceText);
    } else if (requirement.category === 'TRAVEL') {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      candidate.willingToTravel === true ? add('TRAVEL', 'ALIGNED', 'No obvious blocker found', 'Your profile indicates travel is acceptable.', requirement.evidenceText) : candidate.willingToTravel === false ? add('TRAVEL', 'POTENTIAL_ISSUE', 'Potential issue', 'The vacancy mentions travel and your profile says it is not acceptable.', requirement.evidenceText) : add('TRAVEL', 'MISSING_INFORMATION', 'Not enough information to assess', 'The vacancy mentions travel, but this preference is unknown.', requirement.evidenceText);
    } else if (requirement.category === 'PROFESSIONAL_REGISTRATION') {
      const registration = candidate.professionalRegistrations.find((item) => item.body.toUpperCase() === requirement.value?.toUpperCase());
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      registration?.status === 'ACTIVE' ? add('PROFESSIONAL_REGISTRATION', 'ALIGNED', 'No obvious blocker found', `Your profile confirms active ${registration.body} registration.`, requirement.evidenceText, `${registration.body} active`) : add('PROFESSIONAL_REGISTRATION', 'MISSING_INFORMATION', 'Manual confirmation needed', `The vacancy mentions ${requirement.value ?? 'professional'} registration, but an active matching registration is not confirmed.`, requirement.evidenceText);
    } else if (requirement.category === 'SECURITY_CLEARANCE' || requirement.category === 'DBS' || requirement.category === 'UK_RESIDENCY') {
      add(requirement.category, 'MISSING_INFORMATION', 'Manual confirmation needed', 'This stated requirement needs direct confirmation; the profile does not provide sufficient confirmed structured evidence.', requirement.evidenceText);
    }
  }
  const statuses = findings.map((finding) => finding.status);
  const overall = statuses.includes('POTENTIAL_ISSUE') ? 'POTENTIAL_ISSUE' : statuses.includes('MISSING_INFORMATION') ? 'INSUFFICIENT_INFORMATION' : findings.length ? 'NO_OBVIOUS_BLOCKER' : 'MANUAL_CONFIRMATION_NEEDED';
  return { overall, findings, disclaimer: VACANCY_INTELLIGENCE_DISCLAIMER };
}

export function calculateDiscoveryRelevance(job: { title: string; locationText?: string | null; workStyle?: JobRemoteType | string | null; seniority?: string | null; contractType?: string | null; salaryMax?: number | null; descriptionAvailability?: JobDescriptionAvailability }, track?: CareerTrackDiscoveryInput | null): DiscoveryRelevance {
  if (!track || ![track.targetRoleTitle, track.occupationFamily, track.industry, ...(track.titleAliases ?? [])].some(Boolean)) return { level: 'LOW', reasons: ['Career Track preferences are not yet detailed enough to assess discovery relevance.'] };
  const title = job.title.toLowerCase(); const targets = [track.targetRoleTitle, track.occupationFamily, ...(track.titleAliases ?? [])].filter(Boolean).map((value) => value!.toLowerCase());
  const titleMatch = targets.some((target) => title.includes(target) || target.includes(title));
  const reasons: string[] = []; let positive = 0; let conflict = false;
  if (titleMatch) { positive += 2; reasons.push('Strong target-role title alignment'); } else reasons.push('Limited target-role title alignment');
  if (track.preferredLocation && job.locationText?.toLowerCase().includes(track.preferredLocation.toLowerCase())) { positive += 1; reasons.push(`Matches your ${track.preferredLocation} preference`); }
  if (track.workStyle && job.workStyle === track.workStyle) { positive += 1; reasons.push(`Matches your preferred ${track.workStyle.toLowerCase()} work style`); }
  if (track.seniority && job.seniority) { if (job.seniority.toLowerCase().includes(track.seniority.toLowerCase())) { positive += 1; reasons.push('Matches your preferred seniority'); } else { conflict = true; reasons.push('Seniority differs from your stated preference'); } }
  if (track.contractPreference && job.contractType && job.contractType.toLowerCase().includes(track.contractPreference.toLowerCase())) { positive += 1; reasons.push('Matches your contract preference'); }
  if (track.salaryMinimum && job.salaryMax !== null && job.salaryMax !== undefined && job.salaryMax < track.salaryMinimum) { conflict = true; reasons.push('Salary appears below your stated preference'); }
  return { level: !conflict && positive >= 3 ? 'HIGH' : positive >= 1 ? 'MEDIUM' : 'LOW', reasons };
}
