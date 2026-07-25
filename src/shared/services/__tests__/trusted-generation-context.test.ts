import { describe, expect, it } from 'vitest';
import { buildTrustedGenerationContext } from '@/shared/services/trusted-generation-context';
import { makeProfile } from './fixtures/profile';

describe('buildTrustedGenerationContext', () => {
  it('tags the profile snapshot as a canonical source class', () => {
    const ctx = buildTrustedGenerationContext({
      profile: makeProfile(),
      approvedEvidence: [],
      now: new Date('2025-06-15T00:00:00Z'),
    });
    expect(ctx.profileSnapshot.sourceClass).toBe('profile_user_entered');
    expect(ctx.profileSnapshot.profileId).toBe('profile-a');
  });

  it('includes a deterministic derived duration fact', () => {
    const ctx = buildTrustedGenerationContext({
      profile: makeProfile({
        experience: [
          {
            id: 'a', jobTitle: 'Engineer', company: 'Acme', location: '', type: 'FULL_TIME',
            startDate: '2022-01', endDate: '2023-12', current: false, achievements: [],
          },
        ],
      }),
      approvedEvidence: [],
      now: new Date('2025-06-15T00:00:00Z'),
    });
    const duration = ctx.derivedFacts.find((fact) => fact.key === 'professional_experience_duration');
    expect(duration?.confidence).toBe('deterministic');
  });

  it('tags approval snapshots as approval_snapshot', () => {
    const ctx = buildTrustedGenerationContext({
      profile: makeProfile(),
      approvedEvidence: [
        {
          requirementId: 'req-1',
          evidenceRef: { type: 'skill', id: 'skill-1' },
          requirementText: 'Node.js',
          sourceProfileId: 'profile-a',
          resolvedEvidenceText: 'Node.js — professional',
          evidenceLocation: 'Skills',
          userApproved: true,
        },
      ],
      now: new Date('2025-06-15T00:00:00Z'),
    });
    expect(ctx.approvedEvidenceSnapshots).toHaveLength(1);
    expect(ctx.approvedEvidenceSnapshots[0].sourceClass).toBe('approval_snapshot');
  });

  it('passes unresolved conflicts through explicitly rather than resolving them', () => {
    const conflicts = [
      { key: 'education:e1:endDate', entityType: 'education', field: 'endDate', reason: 'CV says 2024, profile says 2025' },
    ];
    const ctx = buildTrustedGenerationContext({
      profile: makeProfile(),
      approvedEvidence: [],
      unresolvedConflicts: conflicts,
      now: new Date('2025-06-15T00:00:00Z'),
    });
    expect(ctx.unresolvedConflicts).toEqual(conflicts);
  });
});
