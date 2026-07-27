// Canonical operational-failure contract for quota-controlled AI operations.
//
// Stage 2 wires every metered route through the reservation ledger:
//   reserve → run provider → validate → persist → commit, releasing on any
//   failure in between. This module is the single place that turns those
//   failures into a consistent, safe-to-expose response, and that maps the
//   reservation lifecycle onto route control flow (fail-closed on ledger errors,
//   429 on exhaustion, 409 on conflict / in-progress, recovery on a committed
//   operation).
//
// Nothing here ever exposes a prompt, provider secret, raw stack trace, CV or JD
// text, or an evidence body — only a stable reason code and a generic message.

import { APIError } from '@/shared/utils/api-error';
import type { ProductCapability } from '@/shared/entitlements/registry';
import { EntitlementRequiredError } from '@/shared/entitlements/server';
import {
  markOperation,
  reserveCapability,
  type ReserveArgs,
  type ReserveResult,
} from '@/shared/services/capability-reservation';
import {
  CapabilityOperationStatus,
  type CapabilityReservation,
} from '../../generated/prisma/client';

export type AiFailureReason =
  | 'provider_unavailable'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_response'
  | 'schema_failure'
  | 'safety_rejection'
  | 'truthfulness_failure'
  | 'configuration_error'
  | 'persistence_failure'
  | 'render_failure'
  | 'result_unavailable'
  | 'reservation_failure'
  | 'unknown';

/**
 * Whether a reason is worth retrying. Provider/transport/persistence hiccups are
 * transient; a safety, truthfulness, configuration or already-charged
 * result-unavailable failure is not — retrying the same request reproduces it.
 */
const RETRYABLE: Record<AiFailureReason, boolean> = {
  provider_unavailable: true,
  timeout: true,
  rate_limited: true,
  invalid_response: true,
  schema_failure: true,
  persistence_failure: true,
  render_failure: true,
  reservation_failure: true,
  unknown: true,
  safety_rejection: false,
  truthfulness_failure: false,
  configuration_error: false,
  result_unavailable: false,
};

/** HTTP status for each reason; kept out of routes so it stays consistent. */
const STATUS: Record<AiFailureReason, number> = {
  provider_unavailable: 502,
  timeout: 504,
  rate_limited: 429,
  invalid_response: 502,
  schema_failure: 502,
  persistence_failure: 500,
  render_failure: 500,
  reservation_failure: 503,
  unknown: 500,
  safety_rejection: 422,
  truthfulness_failure: 422,
  configuration_error: 500,
  result_unavailable: 409,
};

/** Generic, non-sensitive user-facing message per reason. */
const MESSAGE: Record<AiFailureReason, string> = {
  provider_unavailable: 'The AI service is temporarily unavailable. Please try again.',
  timeout: 'The AI service took too long to respond. Please try again.',
  rate_limited: 'Too many requests right now. Please try again shortly.',
  invalid_response: 'The AI service returned an unusable response. Please try again.',
  schema_failure: 'The AI service returned an unusable response. Please try again.',
  persistence_failure: 'We could not save the result. Please try again.',
  render_failure: 'We could not produce the document. Please try again.',
  reservation_failure: 'We could not verify your remaining allowance. Please try again.',
  unknown: 'Something went wrong. Please try again.',
  safety_rejection: 'The generated content did not pass our safety checks.',
  truthfulness_failure: 'The generated content did not pass our truthfulness checks.',
  configuration_error: 'This feature is temporarily misconfigured. Please try again later.',
  result_unavailable: 'This result is no longer available. Retry to regenerate it.',
};

export interface AiOperationErrorBody extends Record<string, unknown> {
  code: 'AI_OPERATION_FAILED';
  capability: ProductCapability;
  operationId: string;
  reason: AiFailureReason;
  retryable: boolean;
  /** Whether the user's quota was consumed for this failed operation. */
  charged: boolean;
}

/**
 * The canonical operational error for a metered AI operation. Almost always
 * `charged: false` — a failure between reservation and commit releases the held
 * unit — but the flag is explicit so a caller can never assume either way.
 */
export class AiOperationError extends APIError {
  readonly reason: AiFailureReason;
  readonly charged: boolean;

  constructor(args: {
    capability: ProductCapability;
    operationId: string;
    reason: AiFailureReason;
    charged?: boolean;
    message?: string;
    status?: number;
  }) {
    const reason = args.reason;
    const charged = args.charged ?? false;
    const body: AiOperationErrorBody = {
      code: 'AI_OPERATION_FAILED',
      capability: args.capability,
      operationId: args.operationId,
      reason,
      retryable: RETRYABLE[reason],
      charged,
    };
    super(args.message ?? MESSAGE[reason], args.status ?? STATUS[reason], body);
    this.name = 'AiOperationError';
    this.reason = reason;
    this.charged = charged;
  }
}

export interface ResultUnavailableBody extends Record<string, unknown> {
  code: 'RESULT_UNAVAILABLE';
  capability: ProductCapability;
  operationId: string;
  /** A committed operation is immutable consumed usage — recovery cost nothing extra. */
  charged: true;
  retryable: false;
  /** Whether an explicit retry can run a linked, non-double-charged repair. */
  repairable: boolean;
}

/**
 * A committed operation's persisted result (analysis row / generated document)
 * is missing. The reservation stays committed and charged — it is never reset —
 * and the user is told recovery failed. An explicit retry may run a linked
 * repair (see the route's repair path) without consuming a second unit.
 */
export class ResultUnavailableError extends APIError {
  constructor(args: {
    capability: ProductCapability;
    operationId: string;
    repairable?: boolean;
    message?: string;
  }) {
    const body: ResultUnavailableBody = {
      code: 'RESULT_UNAVAILABLE',
      capability: args.capability,
      operationId: args.operationId,
      charged: true,
      retryable: false,
      repairable: args.repairable ?? true,
    };
    super(
      args.message ??
        'This result could not be recovered. Retry to regenerate it — you will not be charged again.',
      409,
      body
    );
    this.name = 'ResultUnavailableError';
  }
}

export interface OperationConflictBody extends Record<string, unknown> {
  code: 'OPERATION_CONFLICT' | 'OPERATION_IN_PROGRESS';
  capability: ProductCapability;
  operationId: string;
}

/**
 * The same operation id arrived with materially different request content — a
 * client bug or a replay. Rejected rather than silently reusing the first
 * result. 409 so a retry with a fresh id is the obvious fix.
 */
export class OperationConflictError extends APIError {
  constructor(capability: ProductCapability, operationId: string) {
    super('This request conflicts with an earlier one. Please start a new request.', 409, {
      code: 'OPERATION_CONFLICT',
      capability,
      operationId,
    } satisfies OperationConflictBody);
    this.name = 'OperationConflictError';
  }
}

/**
 * The same operation is already reserved and running. We do not start a second
 * provider request; the client should wait for the first to finish.
 */
export class OperationInProgressError extends APIError {
  constructor(capability: ProductCapability, operationId: string) {
    super('This request is already being processed.', 409, {
      code: 'OPERATION_IN_PROGRESS',
      capability,
      operationId,
    } satisfies OperationConflictBody);
    this.name = 'OperationInProgressError';
  }
}

/**
 * Atomically hold a unit for the canonical ordering, mapping every non-success
 * outcome onto the right operational error:
 *
 *  - `exhausted`  → EntitlementRequiredError (429), no work done
 *  - `conflict`   → OperationConflictError (409)
 *  - active + RUNNING → OperationInProgressError (409): a live duplicate, never
 *                   read as quota exhaustion
 *  - ledger throw → AiOperationError(reservation_failure) (503), FAIL CLOSED:
 *                   a failure to read/reserve is never treated as zero usage and
 *                   no provider call is made
 *
 * Returns the ReserveResult for the success outcomes (`reserved`, `recovered`,
 * `unmetered`). On a fresh `reserved`, the operation is marked RUNNING before
 * returning so a concurrent duplicate is detected as in-progress.
 */
export async function reserveForOperation(
  args: ReserveArgs & { capability: ProductCapability }
): Promise<Extract<ReserveResult, { status: 'reserved' | 'recovered' | 'unmetered' }>> {
  const { userId, capability, operationId } = args;

  let result: ReserveResult;
  try {
    result = await reserveCapability(args);
  } catch (error) {
    // Authoritative enforcement failure: the ledger could not be read/written.
    // Fail closed — do not proceed to the provider, do not treat as zero usage.
    console.error(
      '[ai-failure] Reservation ledger unavailable; failing closed:',
      error instanceof Error ? error.message : error
    );
    throw new AiOperationError({ capability, operationId, reason: 'reservation_failure' });
  }

  if (result.status === 'exhausted') throw new EntitlementRequiredError(result.decision);
  if (result.status === 'conflict') throw new OperationConflictError(capability, operationId);

  if (result.status === 'reserved') {
    if (result.reservation.operationStatus === CapabilityOperationStatus.RUNNING) {
      throw new OperationInProgressError(capability, operationId);
    }
    // Advance PENDING → RUNNING so a later duplicate is caught as in-progress.
    await markOperation({
      userId,
      capability,
      operationId,
      operationStatus: CapabilityOperationStatus.RUNNING,
    });
  }

  return result;
}

/** Whether an active reservation's diagnostic status is RUNNING (a live duplicate). */
export function reservationIsRunning(reservation: CapabilityReservation): boolean {
  return reservation.operationStatus === CapabilityOperationStatus.RUNNING;
}

/**
 * Advance a freshly-held reservation PENDING → RUNNING, so a concurrent duplicate
 * of the same operation is detected as in-progress rather than starting a second
 * provider request. A no-op if the reservation is no longer held.
 */
export async function markOperationRunning(
  userId: string,
  capability: ProductCapability,
  operationId: string
): Promise<void> {
  await markOperation({
    userId,
    capability,
    operationId,
    operationStatus: CapabilityOperationStatus.RUNNING,
  });
}
