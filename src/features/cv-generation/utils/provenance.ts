export type CvProvenance = 'job_match' | 'career_profile';

export function cvProvenance(cv: { jobMatchId?: string | null }): CvProvenance {
  return cv.jobMatchId ? 'job_match' : 'career_profile';
}
