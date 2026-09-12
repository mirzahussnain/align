import { JobMatchDataV2Schema } from '@/shared/schemas/ai-output';
import type { JobMatchDataV2, RequirementEvidence } from '@/shared/types/ai';
import type { CareerProfileSnapshotData } from './career-profile-snapshot';

const normalise = (value: string) => value.toLocaleLowerCase('en-GB').replace(/[^a-z0-9+#.]+/g, ' ').trim();
const contains = (haystack: string, needle: string) => {
  const term = normalise(needle);
  return term.length >= 3 && normalise(haystack).includes(term);
};

type CandidateEvidence = RequirementEvidence & { strength: 'exact' | 'contextual' };

function profileEvidence(data: CareerProfileSnapshotData, requirement: string): CandidateEvidence[] {
  const p = data.profile;
  const evidence: CandidateEvidence[] = [];
  const add = (sourceRef: string, text: string, location: string, strength: CandidateEvidence['strength']) => {
    if (!evidence.some((item) => item.sourceRef === sourceRef)) {
      evidence.push({ source: 'profile', sourceRef, text, location, strength });
    }
  };

  for (const group of p.skills) for (const skill of group.skillItems) {
    if (contains(requirement, skill.name)) add(`skill:${skill.id}`, skill.name, group.category, 'exact');
  }
  for (const item of p.certifications) {
    if (contains(requirement, item.name)) add(`certification:${item.id}`, item.name, 'Certification', 'exact');
  }
  for (const item of p.licences) {
    if (contains(requirement, item.officialName)) add(`licence:${item.id}`, item.officialName, 'Licence', 'exact');
  }
  for (const item of p.professionalRegistrations) {
    if (contains(requirement, item.officialName) || contains(requirement, item.issuingBody)) {
      add(`registration:${item.id}`, `${item.officialName} — ${item.issuingBody}`, 'Professional registration', 'exact');
    }
  }
  for (const item of p.education) {
    if (contains(requirement, item.degree)) add(`education:${item.id}`, item.degree, item.university, 'exact');
  }
  for (const item of p.languages) {
    if (contains(requirement, item.language)) add(`language:${item.id}`, item.language, 'Language', 'exact');
  }
  for (const item of [...p.experience, ...p.projects]) {
    const label = 'jobTitle' in item ? item.jobTitle : item.name;
    const details = [label, ...item.achievements].join(' ');
    const significant = normalise(requirement).split(' ').filter((word) => word.length >= 5);
    if (significant.filter((word) => normalise(details).includes(word)).length >= 2) {
      add(`${'jobTitle' in item ? 'experience' : 'project'}:${item.id}`, details.slice(0, 500), label, 'contextual');
    }
  }
  return evidence.slice(0, 5);
}

function practicalEvidence(data: CareerProfileSnapshotData, requirement: string): {
  evidence?: RequirementEvidence;
  outcome?: 'met' | 'contradicted';
} {
  const facts = data.practicalFacts;
  if (!facts) return {};
  const text = normalise(requirement);
  const fact = (sourceRef: string, value: boolean, yes: string, no: string) => ({
    evidence: { source: 'practical_fact' as const, sourceRef, text: value ? yes : no, location: 'Confirmed practical facts' },
    outcome: value ? 'met' as const : 'contradicted' as const,
  });
  if (/driving licen[cs]e/.test(text) && facts.drivingLicenceHeld !== undefined) {
    return fact('drivingLicenceHeld', facts.drivingLicenceHeld, 'Driving licence held', 'Driving licence not held');
  }
  if (/night shift/.test(text) && facts.availableForNightShifts !== undefined) {
    return fact('availableForNightShifts', facts.availableForNightShifts, 'Available for night shifts', 'Not available for night shifts');
  }
  if (/weekend/.test(text) && facts.availableForWeekendShifts !== undefined) {
    return fact('availableForWeekendShifts', facts.availableForWeekendShifts, 'Available for weekend shifts', 'Not available for weekend shifts');
  }
  if (/sponsor|right to work|work authori[sz]ation/.test(text) && facts.requiresSponsorshipNow !== undefined) {
    const requirementRejectsSponsorship = /no sponsorship|without sponsorship|must have.*right to work/.test(text);
    if (requirementRejectsSponsorship) {
      return fact('requiresSponsorshipNow', !facts.requiresSponsorshipNow, 'Does not currently require sponsorship', 'Currently requires sponsorship');
    }
    return { evidence: { source: 'practical_fact', sourceRef: 'requiresSponsorshipNow', text: facts.requiresSponsorshipNow ? 'Currently requires sponsorship' : 'Does not currently require sponsorship', location: 'Confirmed practical facts' } };
  }
  return {};
}

export function applyStructuredCandidateEvidence(
  match: JobMatchDataV2,
  data: CareerProfileSnapshotData,
): JobMatchDataV2 {
  const requirements = match.requirements.map((requirement) => {
    const profile = profileEvidence(data, requirement.text);
    const practical = practicalEvidence(data, requirement.text);
    const additions = [...profile.map(({ strength: _strength, ...item }) => item), ...(practical.evidence ? [practical.evidence] : [])];
    if (!additions.length) return requirement;

    const exactProfile = profile.some((item) => item.strength === 'exact');
    const status = practical.outcome ?? (exactProfile ? 'met' : requirement.status === 'not_met' ? 'partial' : requirement.status);
    const points = status === 'met' ? 0 : status === 'contradicted'
      ? Math.max(requirement.deduction.points, 6)
      : status === 'partial' ? Math.min(requirement.deduction.points, 5) : requirement.deduction.points;
    return {
      ...requirement,
      status,
      evidence: [...requirement.evidence, ...additions],
      deduction: {
        ...requirement.deduction,
        points,
        reason: `${requirement.deduction.reason} Structured candidate evidence was evaluated separately from the CV.`,
      },
    };
  });
  const deductions = requirements.reduce((sum, item) => sum + item.deduction.points, 0);
  return JobMatchDataV2Schema.parse({
    ...match,
    requirements,
    matchScore: Math.max(0, Math.min(100, 100 - deductions - match.domainFit.deduction.points)),
  });
}
