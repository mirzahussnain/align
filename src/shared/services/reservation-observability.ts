// PII-safe structured logging for the reservation / metered-operation lifecycle.
//
// Every metered AI operation moves through a fixed lifecycle (reserve → run →
// validate → persist → commit, with release/recover/repair branches). This
// module is the single place those transitions are logged, as one structured
// line per event, so operational behaviour can be traced without ever leaking
// user content.
//
// PRIVACY CONTRACT: a log record may ONLY carry the fields on {@link SafeLogMeta}.
// The emitter runs every record through {@link sanitizeMeta}, which allow-lists
// those keys and drops everything else, so a caller cannot accidentally attach a
// CV, a job description, a prompt, an evidence body, a registration number, a
// credential, a file's contents or raw AI output. User ids are hashed to a short
// stable token by default (see `hashUserId`) rather than logged in the clear.

import { createHash } from 'node:crypto';
import type { ProductCapability } from '@/shared/entitlements/registry';
import type { AiFailureReason } from '@/shared/services/ai-failure';

/**
 * The fixed set of lifecycle events. Keeping them an enumerated union (not free
 * strings) means a dashboard can rely on the vocabulary and a typo is a compile
 * error rather than a silently-different event.
 */
export type ReservationEvent =
  | 'operation_started'
  | 'reservation_created'
  | 'reservation_reused'
  | 'operation_running'
  | 'provider_attempted'
  | 'provider_fallback_attempted'
  | 'provider_succeeded'
  | 'validation_failed'
  | 'deterministic_repair_started'
  | 'deterministic_repair_completed'
  | 'generation_rejected'
  | 'persistence_succeeded'
  | 'persistence_failed'
  | 'reservation_released'
  | 'reservation_committed'
  | 'committed_result_recovered'
  | 'result_unavailable'
  | 'repair_started'
  | 'repair_committed'
  | 'duplicate_operation_detected'
  | 'fingerprint_conflict'
  | 'reservation_expired'
  | 'finalisation_failed';

/**
 * The ONLY metadata a reservation log line may carry. Every field here is
 * non-sensitive by construction — an id, a status code, a label, a duration or a
 * boolean. There is deliberately no field for text, content, prompts or bodies.
 */
export interface SafeLogMeta {
  /** Quota-controlled capability, e.g. `ai_enhanced_ats_analysis`. */
  capability?: ProductCapability | string;
  /** Public-safe, client-supplied operation id (a UUID, never derived from content). */
  operationId?: string;
  /** For a linked repair: the original committed operation being repaired. */
  originalOperationId?: string;
  /** Reservation lifecycle status (RESERVED / COMMITTED / RELEASED / EXPIRED). */
  reservationStatus?: string;
  /** Diagnostic operation status (PENDING / RUNNING / SUCCEEDED / FAILED_*). */
  operationStatus?: string;
  /** Coarse provider label, e.g. "gemini" or "groq" — never a key or secret. */
  provider?: string;
  /** Coarse model label, e.g. a model name — never a key or secret. */
  model?: string;
  /** 1-based provider attempt index within the fallback chain. */
  attempt?: number;
  /** Whether a fallback provider (not the primary) produced the result. */
  fallbackUsed?: boolean;
  /** Wall-clock duration of the step in milliseconds. */
  durationMs?: number;
  /** Safe {@link AiFailureReason}-style code — never a raw error message. */
  reason?: AiFailureReason | string;
  /** Whether the failure class is worth retrying. */
  retryable?: boolean;
  /** Whether the user's quota was consumed. */
  charged?: boolean;
  /** Coarse result classification, e.g. "analysis" | "generated_cv" | "evidence" | "context". */
  resultType?: string;
  /** Hashed, non-reversible user token. Prefer this over a raw user id. */
  userHash?: string;
  /** Count of provenance defects on a rejected/repaired draft — never their content. */
  defectCount?: number;
  /** Coarse repair mode, e.g. "deterministic" — never a claim fragment. */
  repairMode?: string;
}

/** Keys allowed on a sanitized record. Anything else is dropped before emit. */
const ALLOWED_KEYS: ReadonlyArray<keyof SafeLogMeta> = [
  'capability',
  'operationId',
  'originalOperationId',
  'reservationStatus',
  'operationStatus',
  'provider',
  'model',
  'attempt',
  'fallbackUsed',
  'durationMs',
  'reason',
  'retryable',
  'charged',
  'resultType',
  'userHash',
  'defectCount',
  'repairMode',
];

/**
 * Short, stable, non-reversible token for a user id. A hash (not the raw id)
 * keeps logs correlatable per user without persisting a personal identifier into
 * the logging pipeline. 12 hex chars is ample to correlate within a session.
 */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

/**
 * Drop every key that is not on the allow-list, and coerce the survivors to
 * primitive-safe values. This is the privacy backstop: even if a caller passes a
 * forbidden field (a CV, a prompt, an error object), it never reaches the sink.
 */
export function sanitizeMeta(meta: Record<string, unknown>): SafeLogMeta {
  const safe: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    const value = meta[key];
    if (value === undefined || value === null) continue;
    // Only ever emit primitives; an object/array in a "safe" slot is discarded.
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    }
  }
  return safe as SafeLogMeta;
}

/** Where a log record goes. Overridable in tests to capture emitted records. */
export type LogSink = (record: Record<string, unknown>) => void;

const defaultSink: LogSink = (record) => {
  // A structured single-line record, on the existing console transport (the
  // project's logging convention). A metrics/observability backend can parse the
  // `evt` discriminator and the flat, typed fields directly.
  const level = record.severity === 'error' ? 'error' : record.severity === 'warn' ? 'warn' : 'info';
  console[level](`[reservation] ${JSON.stringify(record)}`);
};

let sink: LogSink = defaultSink;

/** Swap the sink (tests). Returns a restore function. */
export function __setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

/** Events that represent a genuine failure/degradation, logged at a higher level. */
const WARN_EVENTS = new Set<ReservationEvent>([
  'validation_failed',
  'generation_rejected',
  'persistence_failed',
  'reservation_released',
  'result_unavailable',
  'duplicate_operation_detected',
  'fingerprint_conflict',
  'reservation_expired',
  'finalisation_failed',
]);

/**
 * Emit one lifecycle event. Accepts a possibly-unsafe metadata bag and sanitizes
 * it; a caller can pass `userId` and it is hashed and dropped in favour of
 * `userHash`, so no raw user id is ever emitted.
 */
export function logReservationEvent(
  event: ReservationEvent,
  meta: (SafeLogMeta & { userId?: string }) = {}
): void {
  const { userId, ...rest } = meta;
  const safe = sanitizeMeta(rest as Record<string, unknown>);
  if (userId && !safe.userHash) safe.userHash = hashUserId(userId);
  sink({
    evt: event,
    severity: WARN_EVENTS.has(event) ? 'warn' : 'info',
    ...safe,
  });
}

/**
 * A small helper that measures elapsed time for a step, so `durationMs` is
 * consistent across events. `const done = startTimer(); …; done()` → ms elapsed.
 */
export function startTimer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
