import type {
  ProvenancedEducationEntry,
  ProvenancedExperienceEntry,
  ProvenancedProjectEntry,
  ProvenancedSkillGroup,
  ProvenancedSkillItem,
  RewriteSourceRef,
  StructuredCvRewriteOutput,
} from '@/shared/types/cv-rewrite';

export const sourceCvRef = (
  evidenceText?: string
): Extract<RewriteSourceRef, { source: 'source_cv' }> => ({
  source: 'source_cv',
  section: 'source_cv',
  ...(evidenceText ? { evidenceText } : {}),
});

export const ledgerEvidenceRef = (
  requirementId = 'requirement-001',
  evidenceIndex = 0
): Extract<RewriteSourceRef, { source: 'ledger_evidence' }> => ({
  source: 'ledger_evidence',
  requirementId,
  evidenceIndex,
});

export const approvedProfileRef = (
  requirementId = 'requirement-001',
  type = 'skill',
  id = 'skill-1'
): Extract<RewriteSourceRef, { source: 'approved_profile' }> => ({
  source: 'approved_profile',
  requirementId,
  evidenceRef: { type, id },
});

export const applicationContextRef = (
  requirementId = 'requirement-001',
  contextId = 'context-1'
): Extract<RewriteSourceRef, { source: 'application_context' }> => ({
  source: 'application_context',
  requirementId,
  contextId,
});

export function makeStructuredRewriteOutput(
  overrides: Partial<StructuredCvRewriteOutput> = {}
): StructuredCvRewriteOutput {
  return {
    identity: {
      name: 'A. Candidate',
      professionalTitle: 'Data Engineer',
      contact: {},
      sourceRefs: [sourceCvRef()],
    },
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    generationNotes: { unsupportedRequirementsNotAdded: [] },
    ...overrides,
  };
}

export function makeExperience(
  overrides: Partial<ProvenancedExperienceEntry> = {}
): ProvenancedExperienceEntry {
  return {
    jobTitle: 'Data Engineer',
    company: 'Acme Corp',
    achievements: [],
    sourceRefs: [sourceCvRef()],
    ...overrides,
  };
}

export function makeProject(
  overrides: Partial<ProvenancedProjectEntry> = {}
): ProvenancedProjectEntry {
  return {
    name: 'Data Platform',
    achievements: [],
    sourceRefs: [sourceCvRef()],
    ...overrides,
  };
}

export function makeEducation(
  overrides: Partial<ProvenancedEducationEntry> = {}
): ProvenancedEducationEntry {
  return {
    degree: 'BSc Computer Science',
    university: 'University of Leeds',
    sourceRefs: [sourceCvRef()],
    ...overrides,
  };
}

export function makeSkillGroup(
  overrides: Partial<ProvenancedSkillGroup> = {}
): ProvenancedSkillGroup {
  return {
    category: 'Data',
    text: 'SQL, Python',
    sourceRefs: [sourceCvRef()],
    ...overrides,
  };
}

export function makeSkillItem(
  skill: string,
  sourceRefs: RewriteSourceRef[] = [sourceCvRef(skill)]
): ProvenancedSkillItem {
  return { skill, sourceRefs };
}

export const invalidStructuredVariants = {
  missingProvenance(): unknown {
    return makeStructuredRewriteOutput({
      identity: {
        name: 'A. Candidate',
        professionalTitle: 'Data Engineer',
        sourceRefs: [],
      },
    });
  },
  unknownRequirement(): StructuredCvRewriteOutput {
    return makeStructuredRewriteOutput({
      skills: [
        makeSkillGroup({
          text: 'Kafka',
          sourceRefs: [ledgerEvidenceRef('unknown-requirement')],
        }),
      ],
    });
  },
  unapprovedProfile(): StructuredCvRewriteOutput {
    return makeStructuredRewriteOutput({
      skills: [
        makeSkillGroup({
          text: 'Kafka',
          sourceRefs: [approvedProfileRef('requirement-001', 'skill', 'unapproved-skill')],
        }),
      ],
    });
  },
  staleApplicationContext(): StructuredCvRewriteOutput {
    return makeStructuredRewriteOutput({
      skills: [
        makeSkillGroup({
          text: 'Kafka',
          sourceRefs: [applicationContextRef('requirement-001', 'stale-context')],
        }),
      ],
    });
  },
};
