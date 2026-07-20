import { describe, it, expect } from 'vitest';
import { suggestCareerTrackLabel } from '../track-label';
import { OCCUPATION_IDS } from '../registry';

describe('suggestCareerTrackLabel', () => {
  it('names the track from occupation alone', () => {
    expect(suggestCareerTrackLabel({ occupation: 'software_engineer' })).toBe('Software Engineering');
  });

  it('appends the declared industry when it adds information', () => {
    expect(suggestCareerTrackLabel({ occupation: 'administrator', industry: 'healthcare_nhs' })).toBe(
      'Administration · Healthcare / NHS'
    );
  });

  it('falls back to the free-text role title when occupation is unset', () => {
    expect(suggestCareerTrackLabel({ targetRoleTitle: 'Warehouse Administrator' })).toBe(
      'Warehouse Administrator'
    );
  });

  it('falls back to the industry when neither occupation nor role title is set', () => {
    expect(suggestCareerTrackLabel({ industry: 'retail' })).toBe('Retail');
  });

  it('falls back to a generic name with nothing to go on', () => {
    expect(suggestCareerTrackLabel({})).toBe('My Career Track');
  });

  it('ignores an unknown occupation or industry string', () => {
    expect(suggestCareerTrackLabel({ occupation: 'astronaut', industry: 'space' })).toBe('My Career Track');
  });

  it('treats the generic occupation as unset, not a named track', () => {
    expect(suggestCareerTrackLabel({ occupation: 'generic', targetRoleTitle: 'Odd-job specialist' })).toBe(
      'Odd-job specialist'
    );
  });

  it('has a track name for every non-generic occupation', () => {
    for (const id of OCCUPATION_IDS.filter((o) => o !== 'generic')) {
      expect(suggestCareerTrackLabel({ occupation: id })).not.toBe('My Career Track');
    }
  });
});
