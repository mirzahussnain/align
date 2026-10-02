import { prisma } from '@/shared/lib/prisma';
import {
  estimateAiCostUsd,
  type AiNormalizedFailureReason,
  type AiUsageCapability,
  type SupportedAiProvider,
} from '@/shared/config/ai-runtime';

export type AiAttemptErrorCode = AiNormalizedFailureReason;

export type AiProviderFailureReason = AiNormalizedFailureReason;

export type AiAttemptOutcome =
  | 'SUCCESS'
  | 'TRANSIENT_FAILURE'
  | 'NON_RETRYABLE_FAILURE'
  | 'SKIPPED';

export interface AiUsageAttemptEvent {
  userId?: string;
  operationId?: string;
  capability: AiUsageCapability;
  provider: SupportedAiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  actualTotalTokens?: number | null;
  latencyMs: number;
  success: boolean;
  errorCode: AiAttemptErrorCode | null;
  providerFailureReason?: AiProviderFailureReason | null;
  upstreamStatusCode?: number | null;
  fallbackUsed: boolean;
  attemptNumber: number;
  providerCandidateNumber?: number;
  providerAttemptNumber?: number;
  retryNumber?: number;
  backoffMs?: number;
  outcome?: AiAttemptOutcome;
  preflightOutcome?: 'ELIGIBLE' | 'SKIPPED';
  estimatedInputTokens?: number;
  maxOutputTokens?: number;
  estimatedRequestTokens?: number;
  requestBudgetTokens?: number;
  safetyMarginTokens?: number;
  requestHeadroomTokens?: number;
  requestOverflowTokens?: number;
}

export interface AiUsagePersistenceDiagnostic {
  errorClass: string;
  prismaCode: string | null;
  model: 'AiUsageEvent';
  fields?: string[];
  constraint?: string;
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/;

function safeIdentifier(value: unknown): string | null {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value) ? value : null;
}

/** Extract only non-sensitive Prisma metadata suitable for operational logs. */
export function safeAiUsagePersistenceDiagnostic(
  error: unknown
): AiUsagePersistenceDiagnostic {
  const shaped = error && typeof error === 'object'
    ? error as {
        name?: unknown;
        code?: unknown;
        meta?: {
          target?: unknown;
          field_name?: unknown;
          column_name?: unknown;
          constraint?: unknown;
          constraint_name?: unknown;
        };
      }
    : {};
  const errorClass = safeIdentifier(shaped.name) ?? 'UnknownError';
  const prismaCode =
    typeof shaped.code === 'string' && /^P\d{4}$/.test(shaped.code)
      ? shaped.code
      : null;
  const targetFields = Array.isArray(shaped.meta?.target)
    ? shaped.meta.target.map(safeIdentifier).filter((value): value is string => value !== null)
    : [];
  const singleField =
    safeIdentifier(shaped.meta?.field_name) ?? safeIdentifier(shaped.meta?.column_name);
  const fields = [...new Set([...targetFields, ...(singleField ? [singleField] : [])])];
  const constraint =
    safeIdentifier(shaped.meta?.constraint) ?? safeIdentifier(shaped.meta?.constraint_name);

  return {
    errorClass,
    prismaCode,
    model: 'AiUsageEvent',
    ...(fields.length > 0 ? { fields } : {}),
    ...(constraint ? { constraint } : {}),
  };
}

/** Persist safe operational metadata only. Telemetry must never affect AI work. */
export async function recordAiUsageAttempt(event: AiUsageAttemptEvent): Promise<void> {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        userId: event.userId ?? null,
        operationId: event.operationId ?? null,
        capability: event.capability,
        provider: event.provider,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        actualTotalTokens: event.actualTotalTokens ?? null,
        latencyMs: event.latencyMs,
        success: event.success,
        errorCode: event.errorCode,
        providerFailureReason: event.providerFailureReason ?? null,
        upstreamStatusCode: event.upstreamStatusCode ?? null,
        fallbackUsed: event.fallbackUsed,
        attemptNumber: event.attemptNumber,
        providerCandidateNumber: event.providerCandidateNumber ?? event.attemptNumber,
        providerAttemptNumber: event.providerAttemptNumber ?? 1,
        retryNumber: event.retryNumber ?? 0,
        backoffMs: event.backoffMs ?? 0,
        outcome: event.outcome ?? (event.success ? 'SUCCESS' : 'NON_RETRYABLE_FAILURE'),
        preflightOutcome: event.preflightOutcome ?? 'ELIGIBLE',
        estimatedInputTokens: event.estimatedInputTokens ?? null,
        maxOutputTokens: event.maxOutputTokens ?? null,
        estimatedRequestTokens: event.estimatedRequestTokens ?? null,
        requestBudgetTokens: event.requestBudgetTokens ?? null,
        safetyMarginTokens: event.safetyMarginTokens ?? null,
        requestHeadroomTokens: event.requestHeadroomTokens ?? null,
        requestOverflowTokens: event.requestOverflowTokens ?? null,
        estimatedCostUsd: estimateAiCostUsd(
          event.provider,
          event.model,
          event.inputTokens,
          event.outputTokens
        ),
      },
    });
  } catch (error) {
    console.warn(
      '[ai-usage-telemetry] Failed to persist AI usage event.',
      safeAiUsagePersistenceDiagnostic(error)
    );
  }
}
