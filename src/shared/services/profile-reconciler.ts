import type { ProfileData } from '@/features/dashboard/data/load-profile';
import type { JobMatchDataV2, JobRequirementLedgerEntry } from '@/shared/types/ai';
import type {
  ApprovedProfileEvidence,
  ApprovedProfileEvidenceOverlay,
  ProfileCandidate,
  ProfileEvidenceRef,
  ProfileEvidenceRequirement,
  ProfileEvidenceSuggestion,
  ProfileReconciliation,
  RawProfileEvidenceSuggestion,
} from '@/shared/types/profile-reasoning';
import {
  ProfileEvidenceValidationError,
  profileEvidenceRefKey,
  requirementEvidencePairKey,
} from '@/shared/types/profile-reasoning';
import { generateJSONFromAI } from './ai-orchestrator';
import { THINKING_BUDGETS } from '@/shared/lib/config';
import { languageProficiencyLabel } from '@/shared/constants/profile-field-options';
import { formatDateRange, formatProfileDate } from '@/shared/utils/date';

/** Shared credential verification phrasing — never upgrades an unverified record. */
function verificationPhrase(verificationStatus: string): string {
  return verificationStatus === 'verified' ? 'verified' : 'user-confirmed, unverified';
}

const SUGGESTIBLE_STATUSES = new Set(['partial', 'not_met', 'contradicted', 'unclear']);

/** Adds an optional display date without ever leaving a dangling separator. */
function withDate(text: string, date: string): string {
  return date ? `${text} — ${date}` : text;
}

/**
 * Flatten complete profile data into database-addressed evidence records.
 * Array order is deliberately irrelevant: identity comes only from row ids.
 */
export function buildProfileCandidates(profile: ProfileData): ProfileCandidate[] {
  const candidates: ProfileCandidate[] = [];

  for (const experience of profile.experience) {
    candidates.push({
      evidenceRef: { type: 'experience', id: experience.id },
      evidenceText: withDate(
        experience.achievements.length > 0
          ? experience.achievements.join('\n')
          : `${experience.jobTitle} at ${experience.company}`,
        formatDateRange(experience.startDate, experience.endDate, experience.current)
      ),
      evidenceLocation: `${experience.jobTitle} at ${experience.company} — Work experience`,
    });
  }

  for (const project of profile.projects) {
    candidates.push({
      evidenceRef: { type: 'project', id: project.id },
      evidenceText: withDate(
        project.achievements.length > 0
          ? project.achievements.join('\n')
          : [project.name, project.skills?.map((skill) => skill.name).join(', ')].filter(Boolean).join(' — '),
        formatDateRange(project.startDate, project.endDate)
      ),
      evidenceLocation: `${project.name} — Project`,
    });
  }

  for (const education of profile.education) {
    candidates.push({
      evidenceRef: { type: 'education', id: education.id },
      evidenceText: [education.degree, education.grade, education.description]
        .filter(Boolean)
        .join('. '),
      evidenceLocation: `${education.university} — Education`,
    });
  }

  for (const group of profile.skills) {
    for (const skill of group.skillItems) {
      candidates.push({
        evidenceRef: { type: 'skill', id: skill.id },
        evidenceText: [
          skill.name,
          skill.level && skill.activity
            ? `${skill.level.replaceAll('_', ' ')}: ${skill.activity}`
            : '',
          skill.outcome,
        ]
          .filter(Boolean)
          .join(' — '),
        evidenceLocation: `${group.category} — Skills`,
      });
    }
  }

  for (const certification of profile.certifications) {
    candidates.push({
      evidenceRef: { type: 'certification', id: certification.id },
      evidenceText: [
        certification.name,
        certification.issuer,
        formatProfileDate(certification.issueDate || certification.year),
        certification.verificationStatus
          ? certification.verificationStatus === 'verified'
            ? 'verified'
            : 'user-confirmed, unverified'
          : '',
      ].filter(Boolean).join(' — '),
      evidenceLocation: `${certification.name} — Certification or licence`,
    });
  }

  for (const item of profile.trainings) candidates.push({ evidenceRef: { type: 'training', id: item.id }, evidenceText: [item.course, item.provider, item.field, item.result].filter(Boolean).join(' — '), evidenceLocation: `${item.course} — Training` });
  for (const item of profile.licences) candidates.push({ evidenceRef: { type: 'licence', id: item.id }, evidenceText: `${[item.officialName, item.issuingBody].filter(Boolean).join(' — ')} (${verificationPhrase(item.verificationStatus)})`, evidenceLocation: `${item.officialName} — Licence` });
  for (const item of profile.professionalRegistrations) candidates.push({ evidenceRef: { type: 'professional_registration', id: item.id }, evidenceText: `${[item.officialName, item.issuingBody].filter(Boolean).join(' — ')} (${verificationPhrase(item.verificationStatus)})`, evidenceLocation: `${item.officialName} — Professional registration` });
  for (const item of profile.languages) { const abilities = ([['speaking', item.speaking], ['reading', item.reading], ['writing', item.writing]] as const).filter(([, level]) => level).map(([ability, level]) => `${ability}: ${languageProficiencyLabel(level)}`).join('; '); candidates.push({ evidenceRef: { type: 'language', id: item.id }, evidenceText: [item.language, abilities].filter(Boolean).join(' — '), evidenceLocation: `${item.language} — Language` }); }
  for (const item of profile.volunteering) candidates.push({ evidenceRef: { type: 'volunteering', id: item.id }, evidenceText: item.contribution ? `${item.role} at ${item.organisation}: ${item.contribution}` : `${item.role} at ${item.organisation}`, evidenceLocation: `${item.organisation} — Volunteering` });
  for (const item of profile.otherEvidence) candidates.push({ evidenceRef: { type: 'other', id: item.id }, evidenceText: `${item.title}: ${item.description}`, evidenceLocation: [item.context, 'Other evidence'].filter(Boolean).join(' — ') });

  return candidates;
}

function requirementView(requirement: JobRequirementLedgerEntry): ProfileEvidenceRequirement {
  return {
    id: requirement.id,
    text: requirement.text,
    importance: requirement.importance,
    status: requirement.status,
  };
}

function parseEvidenceRef(value: unknown): ProfileEvidenceRef {
  if (!value || typeof value !== 'object') {
    throw new ProfileEvidenceValidationError('Suggestion has an unsupported evidence reference.');
  }

  const ref = value as { type?: unknown; id?: unknown };
  if (typeof ref.id !== 'string' || ref.id.trim().length === 0) {
    throw new ProfileEvidenceValidationError('Suggestion has an invalid evidence database id.');
  }

  if (
    ref.type !== 'experience' &&
    ref.type !== 'project' &&
    ref.type !== 'education' &&
    ref.type !== 'skill' &&
    ref.type !== 'certification' &&
    ref.type !== 'training' &&
    ref.type !== 'licence' &&
    ref.type !== 'professional_registration' &&
    ref.type !== 'language' &&
    ref.type !== 'volunteering' &&
    ref.type !== 'other'
  ) {
    throw new ProfileEvidenceValidationError('Suggestion has an unsupported evidence type.');
  }

  return { type: ref.type, id: ref.id.trim() } as ProfileEvidenceRef;
}

/**
 * Validate model relationships and replace all model-supplied source wording
 * with canonical text and location resolved from the current profile snapshot.
 */
export function validateProfileEvidenceSuggestions(
  raw: unknown,
  candidates: ProfileCandidate[],
  requirements: JobRequirementLedgerEntry[]
): ProfileEvidenceSuggestion[] {
  if (!Array.isArray(raw)) {
    throw new ProfileEvidenceValidationError('Profile comparison returned an invalid suggestion list.');
  }

  const candidatesByKey = new Map(
    candidates.map((candidate) => [profileEvidenceRefKey(candidate.evidenceRef), candidate])
  );
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const seen = new Set<string>();

  return (raw as RawProfileEvidenceSuggestion[]).map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new ProfileEvidenceValidationError('Profile comparison returned a malformed suggestion.');
    }

    const requirementId =
      typeof entry.requirementId === 'string' ? entry.requirementId.trim() : '';
    const requirement = requirementsById.get(requirementId);
    if (!requirement) {
      throw new ProfileEvidenceValidationError(`Unknown requirement id: ${requirementId || '(missing)'}.`);
    }
    if (!SUGGESTIBLE_STATUSES.has(requirement.status)) {
      throw new ProfileEvidenceValidationError(
        `Requirement ${requirementId} is already met and cannot receive a profile suggestion.`
      );
    }

    const evidenceRef = parseEvidenceRef(entry.evidenceRef);
    const candidate = candidatesByKey.get(profileEvidenceRefKey(evidenceRef));
    if (!candidate) {
      throw new ProfileEvidenceValidationError(
        `Profile evidence ${profileEvidenceRefKey(evidenceRef)} no longer exists in this profile.`
      );
    }

    const pairKey = requirementEvidencePairKey(requirementId, evidenceRef);
    if (seen.has(pairKey)) {
      throw new ProfileEvidenceValidationError(
        `Duplicate requirement and evidence pair: ${pairKey}.`
      );
    }
    seen.add(pairKey);

    const confidence = Number(entry.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new ProfileEvidenceValidationError(`Suggestion ${pairKey} has invalid confidence.`);
    }

    return {
      requirementId,
      evidenceRef,
      evidenceText: candidate.evidenceText,
      evidenceLocation: candidate.evidenceLocation,
      rationale: typeof entry.rationale === 'string' ? entry.rationale.trim() : '',
      confidence,
    };
  });
}

export interface ReconcileInput {
  profile: ProfileData;
  cvText: string;
  jobDescription: string;
  jobMatch: JobMatchDataV2;
}

export async function reconcileProfileWithCv(
  input: ReconcileInput
): Promise<ProfileReconciliation> {
  const candidates = buildProfileCandidates(input.profile);
  const requirements = input.jobMatch.requirements.filter((requirement) =>
    SUGGESTIBLE_STATUSES.has(requirement.status)
  );
  const requirementViews = requirements.map(requirementView);

  if (candidates.length === 0 || requirements.length === 0) {
    return { suggestions: [], requirements: requirementViews, checked: true, usedAI: false };
  }

  const inventory = candidates
    .map(
      (candidate) =>
        `${JSON.stringify(candidate.evidenceRef)} | ${candidate.evidenceLocation} | ${candidate.evidenceText}`
    )
    .join('\n');
  const requirementInventory = requirements
    .map(
      (requirement) =>
        `[${requirement.id}] ${requirement.importance} | ${requirement.status} | ${requirement.text}`
    )
    .join('\n');

  const prompt = `You are a UK recruiter linking a candidate's stored profile evidence to exact job requirements.

Only suggest a relationship when the stored evidence genuinely supports a requirement. An empty list is correct when nothing qualifies.

Rules:
- Use only exact requirement ids and exact evidence reference objects from the inventories.
- Suggest evidence only for the listed partial or unmet requirements.
- Never invent evidence, credentials, wording, ids, or requirements.
- Treat each skill as individual evidence; never use a whole skill category.
- Do not assume every certification is relevant. Link one only when it supports that specific credential or qualification.
- Confidence is supporting information from 0 to 1. It never implies user approval.
- Return no more than 8 suggestions.

REQUIREMENTS
${requirementInventory}

STORED PROFILE EVIDENCE
${inventory}

JOB DESCRIPTION
${input.jobDescription}

CV SNAPSHOT
${input.cvText}

Return only JSON in this shape:
{
  "suggestions": [
    {
      "requirementId": "exact requirement id",
      "evidenceRef": { "type": "experience | project | education | skill | certification | training | licence | professional_registration | language | volunteering | other", "id": "exact database id" },
      "evidenceText": "optional wording; the server will discard it",
      "evidenceLocation": "optional wording; the server will discard it",
      "rationale": "why this stored evidence supports this exact requirement",
      "confidence": 0.0
    }
  ]
}`;

  const raw = await generateJSONFromAI<{ suggestions?: RawProfileEvidenceSuggestion[] }>({
    capability: 'profile_reconciliation',
    prompt,
    temperature: 0.15,
    thinkingBudget: THINKING_BUDGETS.profileReconcile,
  });

  if (!raw) {
    return { suggestions: [], requirements: requirementViews, checked: false, usedAI: false };
  }

  return {
    suggestions: validateProfileEvidenceSuggestions(raw.suggestions, candidates, input.jobMatch.requirements),
    requirements: requirementViews,
    checked: true,
    usedAI: true,
  };
}

/**
 * Re-resolve every approved pair against the current profile and immutable
 * ledger snapshot. Any stale, cross-profile, duplicate, or mistyped reference
 * rejects the generation request rather than being silently dropped.
 */
function snapshotApprovedEvidence(profile: ProfileData, ref: ProfileEvidenceRef): Record<string, unknown> {
  if (ref.type === 'skill') {
    const group = profile.skills.find((item) => item.skillItems.some((skill) => skill.id === ref.id));
    const skill = group?.skillItems.find((item) => item.id === ref.id);
    if (!skill) return {};
    const projects = profile.projects.filter((project) => project.skillIds?.includes(ref.id)).map((project) => ({
      id: project.id,
      name: project.name,
      evidenceLines: [...project.achievements],
      startDate: project.startDate || null,
      endDate: project.endDate || null,
      liveUrl: project.liveUrl || null,
      repositoryUrl: project.repositoryUrl || null,
    }));
    return {
      kind: 'skill', id: skill.id, name: skill.name,
      skillGroupLabel: group?.id === 'ungrouped' ? null : group?.category ?? null,
      taxonomy: skill.taxonomy ? { ...skill.taxonomy } : null,
      linkedProjects: projects,
    };
  }
  if (ref.type === 'project') {
    const project = profile.projects.find((item) => item.id === ref.id);
    if (!project) return {};
    return {
      kind: 'project', id: project.id, name: project.name,
      evidenceLines: [...project.achievements], startDate: project.startDate || null, endDate: project.endDate || null,
      liveUrl: project.liveUrl || null, repositoryUrl: project.repositoryUrl || null,
      linkedSkills: (project.skills ?? []).map((skill) => ({ id: skill.id, name: skill.name })),
    };
  }
  return { kind: ref.type, id: ref.id };
}
export function resolveApprovedProfileEvidence(
  profile: ProfileData,
  approved: Array<ApprovedProfileEvidence & { rationale?: string }>,
  requirements: JobRequirementLedgerEntry[]
): ApprovedProfileEvidenceOverlay[] {
  const candidatesByKey = new Map(
    buildProfileCandidates(profile).map((candidate) => [
      profileEvidenceRefKey(candidate.evidenceRef),
      candidate,
    ])
  );
  const requirementsById = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const seen = new Set<string>();

  return approved.map((approval) => {
    const requirement = requirementsById.get(approval.requirementId);
    if (!requirement) {
      throw new ProfileEvidenceValidationError(
        `Unknown requirement id: ${approval.requirementId}.`
      );
    }
    if (!SUGGESTIBLE_STATUSES.has(requirement.status)) {
      throw new ProfileEvidenceValidationError(
        `Requirement ${approval.requirementId} is already met and cannot receive approved profile evidence.`
      );
    }

    const pairKey = requirementEvidencePairKey(approval.requirementId, approval.evidenceRef);
    if (seen.has(pairKey)) {
      throw new ProfileEvidenceValidationError(
        `Duplicate requirement and evidence pair: ${pairKey}.`
      );
    }
    seen.add(pairKey);

    const candidate = candidatesByKey.get(profileEvidenceRefKey(approval.evidenceRef));
    if (!candidate) {
      throw new ProfileEvidenceValidationError(
        `Profile evidence ${profileEvidenceRefKey(approval.evidenceRef)} no longer exists in this profile.`
      );
    }

    const rationale = approval.rationale?.trim();
    return {
      requirementId: approval.requirementId,
      evidenceRef: candidate.evidenceRef,
      requirementText: requirement.text,
      sourceProfileId: profile.profileId,
      resolvedEvidenceText: candidate.evidenceText,
      evidenceLocation: candidate.evidenceLocation,
      userApproved: true,
      evidenceSnapshot: snapshotApprovedEvidence(profile, candidate.evidenceRef),
      ...(rationale ? { rationale } : {}),
    };
  });
}
