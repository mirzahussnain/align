import { prisma } from '@/shared/lib/prisma';
import {
  estimateAiCostUsd,
  type AiUsageCapability,
  type SupportedAiProvider,
} from '@/shared/config/ai-runtime';

export type AiAttemptErrorCode =
  | 'TIMEOUT'
  | 'PROVIDER_ERROR'
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION_FAILED';

export interface AiUsageAttemptEvent {
  userId?: string;
  operationId?: string;
  capability: AiUsageCapability;
  provider: SupportedAiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  success: boolean;
  errorCode: AiAttemptErrorCode | null;
  fallbackUsed: boolean;
  attemptNumber: number;
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
        latencyMs: event.latencyMs,
        success: event.success,
        errorCode: event.errorCode,
        fallbackUsed: event.fallbackUsed,
        attemptNumber: event.attemptNumber,
        estimatedCostUsd: estimateAiCostUsd(
          event.provider,
          event.model,
          event.inputTokens,
          event.outputTokens
        ),
      },
    });
  } catch {
    console.warn('[ai-usage-telemetry] Failed to persist AI usage event.');
  }
}
