import { describe, it, expect } from 'vitest';
import { cvProvenance } from '../provenance';

describe('cvProvenance', () => {
  it('labels a CV linked to an analysis as analysis-derived', () => {
    expect(cvProvenance({ analysisId: 'an-1' })).toBe('analysis');
  });

  it('labels a CV with no analysis link as profile-derived', () => {
    expect(cvProvenance({ analysisId: null })).toBe('profile');
    expect(cvProvenance({})).toBe('profile');
    expect(cvProvenance({ analysisId: undefined })).toBe('profile');
  });
});
