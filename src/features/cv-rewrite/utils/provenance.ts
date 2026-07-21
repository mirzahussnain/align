/**
 * Where a generated CV came from, derived purely from what was persisted on the
 * row. A CV linked to an analysis is analysis-derived (tailored to a job); one
 * with no analysis link was built straight from the structured profile.
 *
 * The rule lives here rather than inline in the CV history card so the label and
 * the routes that set `analysisId` can be reasoned about — and tested — together.
 */
export type CvProvenance = 'analysis' | 'profile';

export function cvProvenance(cv: { analysisId?: string | null }): CvProvenance {
  return cv.analysisId ? 'analysis' : 'profile';
}
