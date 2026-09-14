/**
 * Every user-facing sponsorship phrase the Job Board is permitted to render.
 *
 * Sponsorship language is a compliance surface, not copy. Two facts are
 * routinely conflated and must never be:
 *
 *   Company-level — the employer's LEGAL ENTITY appears on the Home Office
 *                   register of licensed sponsors. Evidence about a licence.
 *   Vacancy-level — THIS ADVERT's own wording about sponsorship. Evidence about
 *                   one role.
 *
 * Neither implies the other. An employer on the register may advertise a role it
 * will not sponsor, and an advert mentioning sponsorship does not prove a
 * licence. Because the two are stored and displayed separately, the strings are
 * centralised here so a component cannot invent a phrase that merges them, and
 * so {@link BANNED_SPONSORSHIP_PHRASES} can be asserted against the whole set.
 */

import type { JobSponsorshipWording, SponsorRegisterMatchStatus } from '@/shared/types/job';

/** Compact company-level badges. About the employer's licence, never the role. */
export const SPONSOR_REGISTER_LABELS: Record<SponsorRegisterMatchStatus, string> = {
  EXACT: 'Appears on sponsor register',
  LIKELY: 'Possible sponsor-register match',
  AMBIGUOUS: 'Employer identity needs verification',
  NONE: 'No register match found',
};

/** Longer company-level explanations, for detail panels. */
export const SPONSOR_REGISTER_EXPLANATIONS: Record<SponsorRegisterMatchStatus, string> = {
  EXACT:
    'This employer name matches an organisation on the UK register of licensed sponsors.',
  LIKELY:
    'A similar organisation name appears on the sponsor register. Confirm the employer’s legal entity before relying on this.',
  AMBIGUOUS:
    'Several organisations on the sponsor register have similar names, so the employer could not be identified confidently.',
  NONE:
    'This employer name was not matched to an organisation on the sponsor register.',
};

/** Vacancy-level labels. About this advert's wording, never the employer. */
export const VACANCY_SPONSORSHIP_LABELS: Record<JobSponsorshipWording, string> = {
  EXPLICITLY_AVAILABLE: 'Sponsorship available',
  POSSIBLY_AVAILABLE: 'Sponsorship may be considered',
  EXPLICITLY_UNAVAILABLE: 'No sponsorship stated',
  RIGHT_TO_WORK_REQUIRED: 'Existing right to work required',
  NOT_MENTIONED: 'No sponsorship wording detected',
};

export const VACANCY_SPONSORSHIP_EXPLANATIONS: Record<JobSponsorshipWording, string> = {
  EXPLICITLY_AVAILABLE: 'This listing includes wording that sponsorship is available.',
  POSSIBLY_AVAILABLE: 'This listing suggests sponsorship may be considered. Confirm with the employer.',
  EXPLICITLY_UNAVAILABLE: 'This listing states that sponsorship is not available.',
  RIGHT_TO_WORK_REQUIRED: 'This listing asks applicants to already hold the right to work in the UK.',
  NOT_MENTIONED: 'This listing does not mention sponsorship.',
};

/**
 * Shown wherever register evidence appears. This is the sentence that keeps a
 * register match from reading as a promise about the role.
 */
export const SPONSOR_REGISTER_DISCLAIMER =
  'Appearing on the sponsor register means the employer holds a licence. It does not mean this vacancy offers sponsorship.';

/**
 * Phrases the product must never show, because each asserts something the
 * evidence cannot support. Asserted against the exported strings by test.
 */
export const BANNED_SPONSORSHIP_PHRASES = [
  'visa-friendly',
  'visa friendly',
  'guaranteed sponsorship',
  'sponsorship guaranteed',
  'sponsoring vacancy',
  'will sponsor',
  'definitely sponsors',
  'sponsorship available because',
] as const;
