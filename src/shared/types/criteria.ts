// A selection criterion extracted from a job description or person
// specification (NHS-style "essential/desirable" lists, council and
// civil-service specs). Reused by the job-match extraction schema and the
// criterion-evidence mapping UI.

export type SelectionCriterionType = 'essential' | 'desirable' | 'unknown';

export type SelectionCriterionCategory =
  | 'qualification'
  | 'experience'
  | 'skill'
  | 'knowledge'
  | 'value'
  | 'credential'
  | 'availability'
  | 'other';

export interface SelectionCriterion {
  /** Stable within one extraction, e.g. "essential-3". */
  id: string;
  /** The criterion as the spec states it. */
  text: string;
  type: SelectionCriterionType;
  category: SelectionCriterionCategory;
  /** True when the spec expects the candidate to evidence this explicitly. */
  evidenceRequired: boolean;
}
