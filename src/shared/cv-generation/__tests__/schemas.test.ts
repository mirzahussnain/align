import { describe, expect, it } from 'vitest';
import { UnifiedCandidateEvidenceSchema } from '../schemas';

describe('UnifiedCandidateEvidenceSchema', () => {
  it('rejects a snapshot whose evidence map key differs from its stable id', () => {
    const parsed = UnifiedCandidateEvidenceSchema.safeParse({
      schemaVersion: 1,
      identity: {}, contact: {}, professionalLinks: [], employment: [], projects: [], education: [],
      certifications: [], training: [], volunteerExperience: [], openSource: [], skills: [], achievements: [], otherEvidence: [],
      evidenceById: {
        wrong: {
          id: 'right', kind: 'SKILL', field: 'skill', canonicalText: 'TypeScript', provenance: 'SOURCE_CV',
          preservationTier: 1, requirementIds: [], sourceRefs: [{ sourceType: 'SOURCE_CV', entityType: 'CvRevision', entityId: 'cv-1', fieldPath: 'skills[0]' }],
        },
      },
      sourceRefs: [], conflicts: [],
    });
    expect(parsed.success).toBe(false);
  });
});
