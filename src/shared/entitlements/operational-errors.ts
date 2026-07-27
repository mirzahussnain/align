// Shared client-side interpretation of operational API errors.
//
// Every metered flow (CV upload/analysis, job match, CV generation, profile
// reconciliation, evidence capture) can fail in the same handful of ways: a plan
// or quota block, an operation already running, a retryable provider/reservation
// failure, an unsafe/invalid result, a missing committed result, stale evidence,
// or a request-validation error. Before this module each flow parsed the
// response and wrote its own copy inline, so the wording — and the crucial "you
// were not charged" reassurance — drifted between screens.
//
// This is the single parser. Given a response status and parsed JSON body, it
// returns ONE typed {@link OperationalClientAction} that the caller acts on:
// open the central upgrade modal, show a retry message, offer a repair, etc.
// User-facing copy never exposes provider names, internal statuses, stack traces
// or schema terminology.
//
// It is framework-agnostic (no React, no server imports) so any client flow can
// use it, and pure so it is trivially unit-testable.

import type { CapabilityDecision, ProductCapability } from './registry';

export type OperationalClientAction =
  /** Genuine plan/quota block — open the central entitlement/upgrade modal. */
  | { type: 'upgrade'; capability: ProductCapability; decision: CapabilityDecision | null }
  /** Retryable provider/reservation failure — the user was NOT charged. */
  | { type: 'retry'; message: string }
  /** The same operation is already being processed — do NOT show upgrade. */
  | { type: 'in_progress'; message: string }
  /** A committed result went missing but a linked, non-double-charged repair can run. */
  | { type: 'repair'; operationId: string; capability: ProductCapability | null; message: string }
  /** The request itself was invalid — the user should correct their input. */
  | { type: 'correct_input'; message: string }
  /** Approved evidence is stale/deleted — the user should re-pick evidence. */
  | { type: 'stale_evidence'; message: string }
  /** A stored result was recovered — silently reopen/download it where possible. */
  | { type: 'recovered'; resultRef?: string }
  /** No recovery is possible — the result was not saved or charged, or is gone. */
  | { type: 'terminal'; message: string };

/** Standard, consistent user-facing copy. No internal detail ever leaks here. */
export const OPERATIONAL_MESSAGES = {
  inProgress: 'This request is already being processed.',
  retry: 'We could not complete this operation right now. You were not charged. Please try again.',
  unsafeResult: 'The result could not be safely verified, so it was not saved or charged.',
  repairAvailable:
    'Your previous result could not be retrieved. You have not been charged again, and you can start a repair attempt.',
  repairUnavailable: 'Your previous result is no longer available. Please start a new analysis.',
  staleEvidence: 'Some of the evidence you selected is no longer available. Please review your selections and try again.',
  correctInput: 'Some details were missing or invalid. Please check your input and try again.',
  terminal: 'We could not complete this operation. Please start a new request.',
} as const;

interface OperationalBody {
  code?: string;
  error?: string;
  message?: string;
  capability?: ProductCapability;
  operationId?: string;
  reason?: string;
  retryable?: boolean;
  charged?: boolean;
  repairable?: boolean;
  // Entitlement fields (ENTITLEMENT_REQUIRED).
  plan?: string;
  upgradeTarget?: string;
  limit?: number;
  used?: number;
  remaining?: number;
  period?: string;
}

/**
 * Rebuild a best-effort {@link CapabilityDecision} from an ENTITLEMENT_REQUIRED
 * body, so a caller without a live entitlements snapshot can still open the
 * upgrade modal. Callers that DO have a snapshot should prefer their own
 * `decisionFor(capability)` and use only the `capability` from the action.
 */
function decisionFromBody(body: OperationalBody): CapabilityDecision | null {
  if (!body.capability) return null;
  return {
    capability: body.capability,
    allowed: false,
    plan: (body.plan as CapabilityDecision['plan']) ?? 'FREE',
    mode: 'quota',
    reason: (body.reason as CapabilityDecision['reason']) ?? 'quota_exhausted',
    ...(body.limit !== undefined ? { limit: body.limit } : {}),
    ...(body.used !== undefined ? { used: body.used } : {}),
    ...(body.remaining !== undefined ? { remaining: body.remaining } : {}),
    ...(body.period ? { period: body.period as CapabilityDecision['period'] } : {}),
    ...(body.upgradeTarget ? { upgradeTarget: body.upgradeTarget as CapabilityDecision['upgradeTarget'] } : {}),
  };
}

/** True for a truthfulness/safety rejection reason on an AI_OPERATION_FAILED body. */
function isUnsafeResultReason(reason?: string): boolean {
  return reason === 'truthfulness_failure' || reason === 'safety_rejection';
}

/**
 * Interpret an operational API error into a single typed client action.
 *
 * `status` is the HTTP status; `body` is the already-parsed JSON (or an empty
 * object if the response had no JSON). The mapping prefers the structured `code`
 * and, only as a fallback for legacy bare-message errors, uses the status.
 */
export function interpretOperationalError(
  status: number,
  body: unknown
): OperationalClientAction {
  const b: OperationalBody = body && typeof body === 'object' ? (body as OperationalBody) : {};
  const message = typeof b.error === 'string' ? b.error : typeof b.message === 'string' ? b.message : '';

  switch (b.code) {
    case 'ENTITLEMENT_REQUIRED':
      return {
        type: 'upgrade',
        capability: b.capability as ProductCapability,
        decision: decisionFromBody(b),
      };

    case 'OPERATION_IN_PROGRESS':
      return { type: 'in_progress', message: OPERATIONAL_MESSAGES.inProgress };

    case 'OPERATION_CONFLICT':
      // A replayed/mismatched operation id — the fix is a fresh request, not a
      // same-id retry, so this is terminal for this operation (never an upgrade).
      return { type: 'terminal', message: OPERATIONAL_MESSAGES.terminal };

    case 'RESULT_UNAVAILABLE':
      return b.repairable !== false && b.operationId
        ? {
            type: 'repair',
            operationId: b.operationId,
            capability: b.capability ?? null,
            message: OPERATIONAL_MESSAGES.repairAvailable,
          }
        : { type: 'terminal', message: OPERATIONAL_MESSAGES.repairUnavailable };

    case 'AI_OPERATION_FAILED': {
      if (isUnsafeResultReason(b.reason)) {
        return { type: 'terminal', message: OPERATIONAL_MESSAGES.unsafeResult };
      }
      if (b.reason === 'result_unavailable') {
        // Committed but unrecoverable; the failure body carries no repair id, so
        // this surfaces as a repairable result-unavailable at the reserve step.
        return b.operationId
          ? {
              type: 'repair',
              operationId: b.operationId,
              capability: b.capability ?? null,
              message: OPERATIONAL_MESSAGES.repairAvailable,
            }
          : { type: 'terminal', message: OPERATIONAL_MESSAGES.repairUnavailable };
      }
      // Provider/reservation/persistence hiccups — retryable, and never charged.
      return { type: 'retry', message: OPERATIONAL_MESSAGES.retry };
    }
  }

  // Legacy/bare-message fallback by status, for errors that carry no code.
  if (status === 400) return { type: 'correct_input', message: message || OPERATIONAL_MESSAGES.correctInput };
  if (status === 422) return { type: 'terminal', message: message || OPERATIONAL_MESSAGES.unsafeResult };
  if (status === 409) {
    // Uncoded 409s in the generation path are stale approved-evidence snapshots.
    if (/evidence|snapshot|stale/i.test(message)) {
      return { type: 'stale_evidence', message: OPERATIONAL_MESSAGES.staleEvidence };
    }
    return { type: 'terminal', message: message || OPERATIONAL_MESSAGES.terminal };
  }
  if (status === 429) return { type: 'retry', message: message || OPERATIONAL_MESSAGES.retry };
  if (status >= 500) return { type: 'retry', message: OPERATIONAL_MESSAGES.retry };

  return { type: 'terminal', message: message || OPERATIONAL_MESSAGES.terminal };
}
