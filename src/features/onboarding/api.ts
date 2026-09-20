'use client';

import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { UPLOAD_POLICY } from '@/shared/policies';

/**
 * The onboarding client's single door to the server.
 *
 * Two rules hold everywhere in here:
 *
 *   - errors arrive as stable codes and are turned into copy by ONE map, so a
 *     raw provider, database or storage message can never reach the screen;
 *   - plan limits are never computed here. Every number the UI shows about a
 *     plan comes from a `CapabilityDecision` in a response, because a hard-coded
 *     "3 of 3" is wrong the moment pricing changes and invisible when it does.
 */

export type OnboardingGoal = 'CHECK_CV' | 'MATCH_JOB' | 'BUILD_PROFILE' | 'NO_CV';

export type OnboardingStage =
  | 'GOAL'
  | 'CV_SOURCE'
  | 'UPLOAD'
  | 'EXTRACTION'
  | 'PROFILE_SELECTION'
  | 'CAREER_DIRECTION'
  | 'IMPORT_REVIEW'
  | 'ELIGIBILITY_BASICS'
  | 'FIRST_ACTION'
  | 'COMPLETE';

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'DISMISSED';

export type FirstValueType = 'DETERMINISTIC_ATS' | 'AI_ATS' | 'JOB_MATCH' | 'PROFILE_CREATED';

export interface OnboardingState {
  goal: OnboardingGoal | null;
  stage: OnboardingStage;
  status: OnboardingStatus;
  selectedProfileId: string | null;
  storedCvId: string | null;
  extractionId: string | null;
  importSessionId: string | null;
  firstValueType: FirstValueType | null;
  firstValueRef: string | null;
  firstValueCompletedAt: string | null;
  lastErrorCode: string | null;
  progress: { stageIndex: number; totalStages: number; percentage: number };
  stages: OnboardingStage[];
}

export interface StoredCvSummary {
  id: string;
  originalFilename: string;
  sizeBytes: number;
  sourceFormat: string;
  status: string;
  checksum: string;
  createdAt: string;
  retentionEndsAt: string | null;
  objectAvailable: boolean;
}

export type ImportEntityType =
  | 'IDENTITY_UPDATE'
  | 'PROFILE_SUMMARY_UPDATE'
  | 'EXPERIENCE'
  | 'PROJECT'
  | 'EDUCATION'
  | 'SKILL'
  | 'CERTIFICATION'
  | 'TRAINING'
  | 'LICENCE'
  | 'PROFESSIONAL_REGISTRATION'
  | 'LANGUAGE'
  | 'VOLUNTEERING'
  | 'OTHER_EVIDENCE';

export type ImportReviewStatus =
  | 'PROPOSED'
  | 'CONFIRMED'
  | 'EDITED'
  | 'REJECTED'
  | 'DUPLICATE'
  | 'CONFLICT';

/**
 * The identity fields the review screen can show and add.
 *
 * Mirrors `IDENTITY_FIELDS` on the server. Declared here rather than imported so
 * the client bundle does not pull in the parser and phone library through the
 * import-service barrel; the server validates the value it receives regardless.
 */
export const IDENTITY_FIELD_NAMES = ['fullName', 'email', 'phone', 'linkedin', 'github', 'website'] as const;
export type IdentityFieldName = (typeof IDENTITY_FIELD_NAMES)[number];

export interface ImportCandidate {
  id: string;
  entityType: ImportEntityType;
  reviewStatus: ImportReviewStatus;
  conflictCode: string | null;
  structuredData: Record<string, unknown>;
  sourceExcerpt: string;
  confidence: number | null;
  bulkConfirmable: boolean;
  createdEntityId: string | null;
}

export interface ImportSession {
  id: string;
  storedCvId: string;
  extractionId: string;
  profileId: string;
  status: string;
  reconciliationStatus: string | null;
  candidates: ImportCandidate[];
  summary: {
    entityType: ImportEntityType;
    label: string;
    proposed: number;
    duplicate: number;
    conflict: number;
    confirmed: number;
  }[];
}

/**
 * User-facing copy for every stable pipeline code.
 *
 * The server sends the same sentences, but a client that renders whatever text
 * arrives would happily print an unexpected server message; mapping here means
 * the UI only ever shows wording we wrote.
 */
const ERROR_COPY: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'That file type is not supported. Upload a PDF or a Word document (.docx).',
  SIGNATURE_MISMATCH: 'That file does not look like the format its name suggests. Try re-saving it as a PDF.',
  FILE_TOO_LARGE: 'That file is too large. The maximum size is 10MB.',
  FILE_EMPTY: 'That file is empty.',
  STORAGE_FAILED: 'We could not store your CV securely. Please try again.',
  STORED_CV_LIMIT_REACHED: 'You have reached the number of stored CVs your plan allows.',
  DUPLICATE_STORED_CV: 'You have already uploaded this CV.',
  UPLOAD_INTENT_EXPIRED: 'This upload expired. Please start the upload again.',
  UPLOAD_ALREADY_FINALIZED: 'This upload has already been completed.',
  UPLOAD_INCOMPLETE: 'The uploaded file is not available yet. Please try the upload again.',
  UPLOAD_SIZE_MISMATCH: 'The uploaded file size did not match the reserved upload.',
  CORRUPT_DOCUMENT: 'We could not read that file. It may be damaged or password protected.',
  EMPTY_TEXT: 'We could not find any text in that CV. It may be a scan rather than a text document.',
  EXTRACTOR_FAILED: 'We could not read your CV. You can try again, or enter your details manually.',
  EXTRACTION_NOT_READY: 'Your CV is still being read. Give it a moment and try again.',
  INVALID_PARSER_OUTPUT: 'We could not turn that CV into profile details. You can still enter them manually.',
  SOURCE_UNAVAILABLE: 'The original file for this import is no longer available.',
  CANDIDATE_NOT_FOUND: 'That imported detail is no longer available.',
  CANDIDATE_CONFLICT: 'Some details need your decision before they can be saved.',
  IMPORT_FAILED: 'We could not save those details. Please try again.',
  INVALID_TRANSITION: 'That step is not available yet.',
  ONBOARDING_STATE_MISSING: 'We could not find your progress. Starting again from the beginning.',
  NOT_FOUND: 'We could not find that.',
  FORBIDDEN: 'You do not have access to that.',
  ENTITLEMENT_REQUIRED: 'Your plan does not allow that right now.',
};

export class OnboardingRequestError extends Error {
  readonly code: string;
  readonly decision?: CapabilityDecision;

  constructor(code: string, decision?: CapabilityDecision) {
    super(ERROR_COPY[code] ?? 'Something went wrong. Please try again.');
    this.name = 'OnboardingRequestError';
    this.code = code;
    this.decision = decision;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof body?.code === 'string' ? body.code : 'IMPORT_FAILED';
    throw new OnboardingRequestError(
      code,
      body?.code === 'ENTITLEMENT_REQUIRED' ? (body as CapabilityDecision) : undefined
    );
  }
  return body as T;
}

const json = (payload: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

export const onboardingApi = {
  state: () => request<OnboardingState>('/api/onboarding'),

  chooseGoal: (goal: OnboardingGoal) =>
    request<OnboardingState>('/api/onboarding', json({ action: 'choose_goal', goal })),

  advance: (input: {
    stage: OnboardingStage;
    manualPath?: boolean;
    selectedProfileId?: string;
    storedCvId?: string;
    extractionId?: string;
    importSessionId?: string;
  }) => request<OnboardingState>('/api/onboarding', json({ action: 'advance', ...input })),

  dismiss: () => request<OnboardingState>('/api/onboarding', json({ action: 'dismiss' })),

  storedCvs: () =>
    request<{ storedCvs: StoredCvSummary[]; capacity: CapabilityDecision; maxBytes: number }>(
      '/api/stored-cvs'
    ),

  upload: async (file: File) => {
    const lowerFilename = file.name.toLowerCase();
    const format = UPLOAD_POLICY.cv.formats.find((candidate) =>
      lowerFilename.endsWith(UPLOAD_POLICY.cv.extensions[candidate])
    );
    if (!format) throw new OnboardingRequestError('UNSUPPORTED_FORMAT');
    const contentType = UPLOAD_POLICY.cv.canonicalMimeTypes[format];
    const intent = await request<{
      intentId: string;
      uploadUrl: string;
      contentType: string;
      expiresAt: string;
    }>('/api/stored-cvs/upload-intent', json({
      filename: file.name,
      mimeType: contentType,
      sizeBytes: file.size,
    }));

    const uploaded = await fetch(intent.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': intent.contentType },
      body: file,
    });
    if (!uploaded.ok) throw new OnboardingRequestError('STORAGE_FAILED');

    return request<{ duplicate: boolean; storedCv: StoredCvSummary }>(
      '/api/stored-cvs/upload-complete',
      json({ intentId: intent.intentId })
    );
  },

  extract: (storedCvId: string, force = false) =>
    request<{ extractionId: string; status: string; parserVersion: string }>(
      '/api/stored-cvs',
      { ...json({ storedCvId, force }), method: 'PUT' }
    ),

  deleteStoredCv: (storedCvId: string) =>
    request<{ ok: true }>(`/api/stored-cvs/${storedCvId}`, { method: 'DELETE' }),

  openImport: (input: { storedCvId: string; extractionId: string; profileId: string }) =>
    request<{ session: ImportSession; evidenceCapacity: CapabilityDecision }>(
      '/api/cv-import',
      json(input)
    ),

  confirmImport: (
    sessionId: string,
    decisions: { candidateId: string; action: 'confirm' | 'reject'; edited?: unknown }[]
  ) =>
    request<{
      imported: number;
      pendingCapacity: number;
      failed: number;
      outcomes: { candidateId: string; outcome: string }[];
      session: ImportSession;
      evidenceCapacity: CapabilityDecision;
    }>('/api/cv-import/confirm', json({ sessionId, decisions })),

  /**
   * Add a contact detail the CV did not carry. Creates a proposal the user then
   * confirms like any other — never a direct write.
   */
  addIdentityDetail: (sessionId: string, field: IdentityFieldName, value: string) =>
    request<{ session: ImportSession; evidenceCapacity: CapabilityDecision }>(
      '/api/cv-import/identity',
      json({ sessionId, field, value })
    ),

  reconcileImport: (sessionId: string, operationId: string) =>
    request<
      | { status: 'completed'; summary: { duplicates: number; updates: number; fresh: number } }
      | { status: 'skipped_empty_profile' }
      | { status: 'unavailable'; decision: CapabilityDecision }
    >('/api/cv-import/reconcile', {
      ...json({ sessionId }),
      headers: { 'Content-Type': 'application/json', 'x-operation-id': operationId },
    }),
};

/** Format a plan allowance from a server decision — never from a constant. */
export function describeCapacity(decision: CapabilityDecision | undefined): string {
  if (!decision || decision.limit === undefined) return '';
  return `${decision.used ?? 0} of ${decision.limit} used`;
}
