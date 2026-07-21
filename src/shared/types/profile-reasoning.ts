import type {
  RequirementImportance,
  RequirementStatus,
} from '@/shared/types/ai';

export type ProfileEvidenceType =
  | 'experience'
  | 'project'
  | 'education'
  | 'skill'
  | 'certification';

/** Stable database identity for one stored profile record. */
export type ProfileEvidenceRef =
  | { type: 'experience'; id: string }
  | { type: 'project'; id: string }
  | { type: 'education'; id: string }
  | { type: 'skill'; id: string }
  | { type: 'certification'; id: string };

/** Canonical inventory entry supplied to the model and re-resolved by servers. */
export interface ProfileCandidate {
  evidenceRef: ProfileEvidenceRef;
  evidenceText: string;
  evidenceLocation: string;
}

/** One model-proposed relationship after canonical server-side resolution. */
export interface ProfileEvidenceSuggestion {
  requirementId: string;
  evidenceRef: ProfileEvidenceRef;
  evidenceText: string;
  evidenceLocation: string;
  rationale: string;
  confidence: number;
}

/** Explicit generation-time choice. No confidence threshold can create this. */
export interface ApprovedProfileEvidence {
  requirementId: string;
  evidenceRef: ProfileEvidenceRef;
}

/** Small requirement view returned beside suggestions for plain-language UI. */
export interface ProfileEvidenceRequirement {
  id: string;
  text: string;
  importance: RequirementImportance;
  status: RequirementStatus;
}

/** Resolved, generation-time overlay passed through the temporary adapter. */
export interface ApprovedProfileEvidenceOverlay extends ApprovedProfileEvidence {
  requirementText: string;
  sourceProfileId: string;
  resolvedEvidenceText: string;
  evidenceLocation: string;
  userApproved: true;
  rationale?: string;
}

/** Untrusted shape returned by the model. Evidence wording is ignored. */
export interface RawProfileEvidenceSuggestion {
  requirementId?: unknown;
  evidenceRef?: unknown;
  evidenceText?: unknown;
  evidenceLocation?: unknown;
  rationale?: unknown;
  confidence?: unknown;
}

export interface ProfileReconciliation {
  suggestions: ProfileEvidenceSuggestion[];
  requirements: ProfileEvidenceRequirement[];
  checked: boolean;
  usedAI: boolean;
}

export class ProfileEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileEvidenceValidationError';
  }
}

export function profileEvidenceRefKey(ref: ProfileEvidenceRef): string {
  return `${ref.type}:${ref.id}`;
}

export function requirementEvidencePairKey(
  requirementId: string,
  evidenceRef: ProfileEvidenceRef
): string {
  return `${requirementId}:${profileEvidenceRefKey(evidenceRef)}`;
}
