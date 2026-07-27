import { classifyLinkUrl } from '../cv-extraction/links';
import { normalisePhone } from '@/shared/utils/phone';
import type { ExtractedIdentity } from '../cv-extraction/types';

/**
 * The identity fields a CV can propose, one reviewable decision each.
 *
 * A single "contact details" proposal covering name, email, phone, LinkedIn,
 * GitHub and website is one button over six independent facts. Real CVs get some
 * of them right and some of them stale, and a user who wants the LinkedIn URL
 * but not the old phone number had no way to say so. Splitting by field also
 * gives each one its own conflict state, which is what requirement "never
 * silently overwrite a confirmed value" actually needs: the comparison is
 * per-field, so the verdict has to be too.
 *
 * `email` is present but deliberately targets `ProfileIdentity.email`, the
 * contact address shown on a generated CV. The ACCOUNT email is an
 * authentication fact owned by the sign-in provider and is never proposed,
 * never compared and never written from here.
 */

export const IDENTITY_FIELDS = [
  'fullName',
  'email',
  'phone',
  'linkedin',
  'github',
  'website',
] as const;

export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export const IDENTITY_FIELD_LABELS: Record<IdentityField, string> = {
  fullName: 'Name',
  email: 'Contact email',
  phone: 'Phone',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  website: 'Website',
};

/** What the profile currently holds, for the per-field comparison. */
export interface CurrentIdentity {
  fullName?: string | null;
  email?: string | null;
  phoneDialCode?: string | null;
  phoneNumber?: string | null;
  phoneCountry?: string | null;
  linkedin?: string | null;
  github?: string | null;
  website?: string | null;
}

/**
 * One field's proposal: what the CV said, what it normalises to, and the payload
 * that would be applied.
 *
 * `raw` and the normalised value are both carried because they answer different
 * questions. The raw value is what the document wrote and is the provenance the
 * user is shown; the normalised value is what would be stored and is what
 * duplicate detection compares. Keeping only one of them means either showing
 * the user a string their CV does not contain, or comparing "+44 7737-853800"
 * against "7737853800" and calling them different.
 */
export interface IdentityFieldProposal {
  field: IdentityField;
  /** Verbatim, as the CV wrote it. */
  raw: string;
  /** Canonical form, as it would be stored. */
  normalised: string;
  /** The `ProfileIdentity` columns this proposal would write. */
  payload: Record<string, string>;
  /** How sure the parser is, 0–1. Surfaced, never used to auto-apply. */
  confidence: number;
  /** True when the value could not be fully resolved and needs a human. */
  needsReview: boolean;
  /**
   * The address was worked out from a handle the CV wrote as a label, not read
   * from a hyperlink. Distinct from `needsReview` because the user is being
   * asked a different question: not "we could not read this" but "we guessed
   * this from what you wrote — is it right?".
   */
  derivedFromLabel?: boolean;
}

/** Compare identity values the way a person would: case- and spacing-blind. */
function comparable(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Compare URLs on host+path, so http/https and a trailing slash are not a conflict. */
function comparableUrl(value: string): string {
  return comparable(value)
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/**
 * Turn a parsed identity into one proposal per field the CV actually supplied.
 *
 * A field the CV did not state produces nothing at all. There is no "clear this
 * field" proposal, because a CV omitting a phone number is not the document
 * saying the user has no phone.
 */
export function identityProposals(
  identity: ExtractedIdentity,
  /**
   * Fields whose value the parser WORKED OUT from a handle rather than read from
   * a hyperlink. Passed separately because it is a fact about how the value was
   * obtained, not part of the value.
   */
  derived: { field: string; writtenAs: string }[] = []
): IdentityFieldProposal[] {
  const proposals: IdentityFieldProposal[] = [];
  const derivedFrom = new Map(derived.map((entry) => [entry.field, entry.writtenAs]));

  if (identity.fullName) {
    proposals.push({
      field: 'fullName',
      raw: identity.fullName,
      normalised: identity.fullName,
      payload: { fullName: identity.fullName },
      confidence: 0.8,
      needsReview: false,
    });
  }

  if (identity.email) {
    proposals.push({
      field: 'email',
      raw: identity.email,
      normalised: identity.email.toLowerCase(),
      payload: { email: identity.email },
      confidence: 0.95,
      needsReview: false,
    });
  }

  if (identity.phone) {
    // The split may already have been done by the parser, where the CV stated a
    // dial code. Where it did not, one more attempt is made here and a number
    // that still will not resolve is proposed RAW and flagged for review — the
    // one thing that must not happen is the whole international string landing
    // in the national-number column, which is the defect this file exists for.
    const split =
      identity.phoneDialCode && identity.phoneNumber
        ? {
            dialCode: identity.phoneDialCode,
            nationalNumber: identity.phoneNumber,
            country: identity.phoneCountry,
          }
        : normalisePhone(identity.phone);
    proposals.push({
      field: 'phone',
      raw: identity.phone,
      normalised: split ? `${split.dialCode} ${split.nationalNumber}` : identity.phone,
      payload: split
        ? {
            phoneDialCode: split.dialCode,
            phoneNumber: split.nationalNumber,
            ...(split.country ? { phoneCountry: split.country } : {}),
          }
        : // Unresolved: the DIGITS go to the number column and the dial code is
          // left for the user to supply. What must never happen — and is what
          // this whole correction is about — is the full international string
          // "+44 7737-853800" landing in `phoneNumber` with an empty dial code.
          { phoneNumber: identity.phone.replace(/\D/g, '') },
      confidence: split ? 0.95 : 0.4,
      needsReview: !split,
    });
  }

  for (const field of ['linkedin', 'github', 'website'] as const) {
    const value = identity[field];
    if (!value) continue;
    const kind = classifyLinkUrl(value.startsWith('http') ? value : `https://${value}`);
    // A URL the classifier does not agree with is still proposed — it came out of
    // the CV and discarding it is the failure mode this work is correcting — but
    // it is marked for review rather than presented as settled.
    const expected: Record<typeof field, string[]> = {
      linkedin: ['linkedin_profile'],
      github: ['github_profile'],
      website: ['web'],
    };
    const normalised = value.startsWith('http') ? value : `https://${value}`;
    // A value worked out from a handle is always review-required, however well
    // it classifies: `linkedin.com/in/<handle>` is a perfectly valid LinkedIn
    // URL and still the wrong one if the handle is not the slug. The raw value
    // shown to the user is what the CV actually printed, not our derivation.
    const writtenAs = derivedFrom.get(field);
    const classifies = expected[field].includes(kind);
    proposals.push({
      field,
      raw: writtenAs ?? value,
      normalised,
      payload: { [field]: normalised },
      confidence: writtenAs ? 0.4 : classifies ? 0.9 : 0.5,
      needsReview: Boolean(writtenAs) || !classifies,
      ...(writtenAs ? { derivedFromLabel: true } : {}),
    });
  }

  return proposals;
}

/** How a proposal stands against what the profile already holds. */
export type IdentityVerdict = 'addition' | 'duplicate' | 'conflict';

/**
 * Compare one proposal with the current value.
 *
 * Three outcomes and no fourth. An empty field takes an addition; an identical
 * value is a no-op the user is told about rather than asked about; a different
 * value is a conflict that always requires an explicit decision. Nothing is ever
 * overwritten because the CV is newer — a CV is not evidence that it is.
 */
export function compareWithCurrent(
  proposal: IdentityFieldProposal,
  current: CurrentIdentity
): IdentityVerdict {
  if (proposal.field === 'phone') {
    const existing = [current.phoneDialCode, current.phoneNumber].filter(Boolean).join(' ').trim();
    if (!existing) return 'addition';
    const existingDigits = existing.replace(/\D/g, '');
    const proposedDigits = proposal.normalised.replace(/\D/g, '');
    return existingDigits === proposedDigits ? 'duplicate' : 'conflict';
  }

  const existing = current[proposal.field as keyof CurrentIdentity];
  if (!existing) return 'addition';
  const same =
    proposal.field === 'fullName' || proposal.field === 'email'
      ? comparable(String(existing)) === comparable(proposal.normalised)
      : comparableUrl(String(existing)) === comparableUrl(proposal.normalised);
  return same ? 'duplicate' : 'conflict';
}
