import { describe, expect, it } from 'vitest';
import type { JobRequirementLedgerEntry } from '@/shared/types/ai';
import { resolveApprovedProfileEvidence } from '@/shared/services/profile-reconciler';
import { makeProfile } from './fixtures/profile';

function requirement(): JobRequirementLedgerEntry {
  return {
    id: 'req-1',
    text: 'Delivered a production project',
    importance: 'mandatory',
    category: 'experience',
    sourceSection: 'job_description',
    evidenceRequired: true,
    status: 'partial',
    evidence: [],
    confidence: 0.9,
    deduction: { points: 0, reasons: [] },
  } as unknown as JobRequirementLedgerEntry;
}

/**
 * Historical integrity: an evidence snapshot produced at approval time is a value
 * copy, not a live view. Editing or deleting the underlying Profile record later
 * must never retroactively rewrite a snapshot that was already captured — the
 * property that keeps prior analyses and generated-CV provenance stable.
 */
describe('approval snapshot immutability', () => {
  it('does not mutate an already-resolved snapshot when the live profile changes', () => {
    const profile = makeProfile({
      projects: [
        {
          id: 'p1', name: 'Ledger', achievements: ['Built the ledger'],
          startDate: '2023-01', endDate: '2023-06', skillIds: [], skills: [],
          liveUrl: '', repositoryUrl: '',
        },
      ],
    });

    const [overlay] = resolveApprovedProfileEvidence(
      profile,
      [{ requirementId: 'req-1', evidenceRef: { type: 'project', id: 'p1' } }],
      [requirement()]
    );
    const historical = structuredClone(overlay.evidenceSnapshot);

    // Simulate a later live edit and a deletion of an evidence line.
    profile.projects[0].achievements.push('Added much later');
    profile.projects[0].achievements.shift();
    profile.projects[0].startDate = '2020-01';
    profile.projects[0].name = 'Renamed';

    expect(overlay.evidenceSnapshot).toEqual(historical);
  });

  it('re-resolving after an edit reflects the live value, leaving the old snapshot intact', () => {
    const profile = makeProfile({
      projects: [
        {
          id: 'p1', name: 'Ledger', achievements: ['Built the ledger'],
          startDate: '2023-01', endDate: '2023-06', skillIds: [], skills: [],
          liveUrl: '', repositoryUrl: '',
        },
      ],
    });

    const [before] = resolveApprovedProfileEvidence(
      profile, [{ requirementId: 'req-1', evidenceRef: { type: 'project', id: 'p1' } }], [requirement()]
    );
    const beforeSnapshot = structuredClone(before.evidenceSnapshot);

    profile.projects[0].achievements = ['Rewrote the whole thing'];
    const [after] = resolveApprovedProfileEvidence(
      profile, [{ requirementId: 'req-1', evidenceRef: { type: 'project', id: 'p1' } }], [requirement()]
    );

    // The freshly-resolved snapshot tracks the live edit …
    expect(after.evidenceSnapshot).not.toEqual(beforeSnapshot);
    // … while the earlier snapshot remains exactly as first captured.
    expect(before.evidenceSnapshot).toEqual(beforeSnapshot);
  });
});
