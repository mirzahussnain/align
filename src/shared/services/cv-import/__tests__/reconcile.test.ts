import { describe, expect, it } from 'vitest';
import { validateFindings } from '../reconcile';

/**
 * Reconciliation output is advice about proposals, and the model is not trusted
 * to produce it correctly. Every id is re-resolved against what actually exists;
 * anything invented, duplicated or pointed elsewhere is dropped.
 *
 * Dropping is the right failure mode here: bad advice should vanish rather than
 * fail an import the user can complete perfectly well by hand.
 */

const CANDIDATES = new Set(['c1', 'c2', 'c3']);
const EXISTING = new Set(['e1', 'e2']);

describe('validateFindings', () => {
  it('keeps well-formed findings', () => {
    const findings = validateFindings(
      [
        { candidateId: 'c1', verdict: 'duplicate_of', existingRecordId: 'e1', rationale: 'Same role.' },
        { candidateId: 'c2', verdict: 'new', rationale: 'Not in the profile.' },
      ],
      CANDIDATES,
      EXISTING
    );
    expect(findings).toEqual([
      { candidateId: 'c1', verdict: 'duplicate_of', existingRecordId: 'e1', rationale: 'Same role.' },
      { candidateId: 'c2', verdict: 'new', rationale: 'Not in the profile.' },
    ]);
  });

  it('drops a finding about a candidate that is not in this session', () => {
    expect(validateFindings([{ candidateId: 'stolen', verdict: 'new' }], CANDIDATES, EXISTING)).toEqual([]);
  });

  it('drops a duplicate verdict that names a record which does not exist', () => {
    // "This duplicates something" is only meaningful if it says what.
    expect(
      validateFindings(
        [{ candidateId: 'c1', verdict: 'duplicate_of', existingRecordId: 'invented' }],
        CANDIDATES,
        EXISTING
      )
    ).toEqual([]);
  });

  it('drops a duplicate verdict with no record named at all', () => {
    expect(
      validateFindings([{ candidateId: 'c1', verdict: 'duplicate_of' }], CANDIDATES, EXISTING)
    ).toEqual([]);
  });

  it('drops an unrecognised verdict', () => {
    expect(
      validateFindings([{ candidateId: 'c1', verdict: 'probably_fine' }], CANDIDATES, EXISTING)
    ).toEqual([]);
  });

  it('keeps only the first verdict per candidate', () => {
    const findings = validateFindings(
      [
        { candidateId: 'c1', verdict: 'new' },
        { candidateId: 'c1', verdict: 'duplicate_of', existingRecordId: 'e1' },
      ],
      CANDIDATES,
      EXISTING
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].verdict).toBe('new');
  });

  it('survives a malformed response entirely', () => {
    expect(validateFindings(null, CANDIDATES, EXISTING)).toEqual([]);
    expect(validateFindings('nonsense', CANDIDATES, EXISTING)).toEqual([]);
    expect(validateFindings([null, 42, 'x'], CANDIDATES, EXISTING)).toEqual([]);
  });

  it('bounds the rationale it will store', () => {
    const [finding] = validateFindings(
      [{ candidateId: 'c1', verdict: 'new', rationale: 'x'.repeat(5000) }],
      CANDIDATES,
      EXISTING
    );
    expect(finding.rationale.length).toBeLessThanOrEqual(400);
  });
});
