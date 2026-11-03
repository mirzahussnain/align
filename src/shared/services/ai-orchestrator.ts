import type { ZodType } from 'zod';
import {
  AI_RUNTIME_CONFIG,
  type AiExecutionPolicy,
  type AiModelRequestBudget,
  type AiNormalizedFailureReason,
  type AiTaskPurpose,
  type AiUsageCapability,
  type SupportedAiProvider,
} from '@/shared/config/ai-runtime';
import {
  recordAiUsageAttempt,
  type AiAttemptErrorCode,
  type AiProviderFailureReason,
} from './ai-usage-telemetry';
import {
  estimateSerializedInputTokens,
  preflightAiRequest,
  type AiRequestPreflight,
} from './ai-request-budget';
import { createAiProviderCandidates } from './ai-provider-adapters';

export interface AIOrchestratorOptions {
  /** Prefer task for new call sites; capability remains source-compatible. */
  task?: AiTaskPurpose;
  capability?: AiUsageCapability;
  userId?: string;
  operationId?: string;
  prompt?: string;
  serializePrompt?: (attempt: AiAttemptDescriptor) => string;
  temperature?: number;
  /**
   * Gemini thinking budget in tokens. These are billed reasoning tokens that
   * never appear in the prompt or the output, and on this model they measure at
   * roughly two thirds of total token spend — the single largest cost in the app.
   *
   *   0        disables thinking entirely (~78% fewer total tokens, ~3.7x faster)
   *   n        caps it at n tokens
   *   omitted  leaves the model's default (unbounded) thinking on
   *
   * Set 0 for extraction and transformation prompts, where the work is reading
   * the input rather than reasoning about it. Leave unset for genuinely
   * multi-step prompts — the job matcher's deduction arithmetic needs it.
   */
  thinkingBudget?: number;
  timeoutMs?: number;
  executionPolicy?: Partial<AiExecutionPolicy>;
}

/** One provider-neutral output contract, translated only at provider boundaries. */
export interface AiStructuredOutputContract<T> {
  name: string;
  runtimeSchema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
}

export interface AiAttemptDescriptor {
  provider: SupportedAiProvider;
  model: string;
  attempt: number;
  fallbackUsed: boolean;
  requestBudget: AiModelRequestBudget;
  /** Request tokens consumed outside the prompt, such as a native JSON Schema. */
  requestOverheadTokens?: number;
}

export interface AIOrchestratorOptionsWithSchema<T> extends AIOrchestratorOptions {
  /**
   * When set, a response that parses as JSON but fails validation counts as a
   * provider failure and falls through the chain, exactly like unparseable
   * output. Schemas should validate strictly only the fields the code reads
   * and pass unknown fields through — over-strictness here discards usable
   * results.
   */
  schema?: ZodType<T>;
  /** Native provider schema plus the application-side validator for the same contract. */
  structuredOutput?: AiStructuredOutputContract<T>;
}

/**
 * Coarse, non-sensitive provenance for the provider attempt that actually
 * produced a result. Contains only labels — never a key, prompt, or output.
 * Threaded up so a successful AI-backed operation can persist WHICH provider and
 * model produced it, and whether a fallback was needed, for observability and
 * audit. One logical operation still consumes exactly one user unit regardless of
 * how many attempts the chain made.
 */
export interface ProviderProvenance {
  /** Coarse provider family: "gemini" | "groq". */
  provider: string;
  /** Model label of the winning attempt. */
  model: string;
  /** 1-based index of the winning attempt within the fallback chain. */
  attempt: number;
  /** True when the primary attempt failed and a later provider/model won. */
  fallbackUsed: boolean;
}

export interface AIResultWithProvenance<T> {
  data: T;
  provenance: ProviderProvenance;
  requestDiagnostics: AiRequestPreflight;
}

export interface AiCandidateFailure {
  provider: SupportedAiProvider;
  model: string;
  candidateNumber: number;
  reason: AiProviderFailureReason;
  upstreamStatusCode: number | null;
  providerAttemptCount: number;
}

export interface AiProviderAttemptResponse {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AiExecutionCandidate {
  label: string;
  provider: SupportedAiProvider;
  model: string;
  requestBudget: AiModelRequestBudget;
  run: (
    signal: AbortSignal,
    serializedPrompt: string,
    maxCompletionTokens: number
  ) => Promise<AiProviderAttemptResponse>;
}

const DEFAULT_RETRYABLE_REASONS: readonly AiNormalizedFailureReason[] = [
  'SERVICE_UNAVAILABLE',
  'RATE_LIMITED',
  'NETWORK',
];

function executionPolicy(
  totalDeadlineMs: number,
  override?: Partial<AiExecutionPolicy>
): AiExecutionPolicy {
  return {
    ...AI_RUNTIME_CONFIG.executionPolicy,
    maxAttempts: override?.maxAttempts ?? AI_RUNTIME_CONFIG.executionPolicy.maxAttempts,
    retryableReasons: override?.retryableReasons ?? DEFAULT_RETRYABLE_REASONS,
    totalDeadlineMs: override?.totalDeadlineMs ?? totalDeadlineMs,
    minimumAttemptWindowMs: override?.minimumAttemptWindowMs ??
      AI_RUNTIME_CONFIG.executionPolicy.minimumAttemptWindowMs,
    backoff: override?.backoff ?? AI_RUNTIME_CONFIG.executionPolicy.backoff,
  };
}

function equalJitterBackoff(policy: AiExecutionPolicy, retryNumber: number): number {
  const floor = Math.min(
    policy.backoff.maximumMs,
    policy.backoff.initialMs * 2 ** Math.max(0, retryNumber - 1)
  );
  return Math.floor(floor + Math.random() * floor);
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * Ask every configured provider in turn until one returns parseable JSON.
 *
 * An unparseable response counts as a FAILURE and falls through to the next
 * provider, exactly like a thrown error. This matters more than it looks: these
 * are thinking models, and on a long prompt they intermittently return prose or
 * a truncated payload with no JSON in it at all. Previously a parse failure
 * returned null straight out of the first attempt, so the fallback chain never
 * ran for by far the most common failure mode.
 */
export async function generateJSONFromAI<T>(options: AIOrchestratorOptionsWithSchema<T>): Promise<T | null> {
  const result = await generateJSONFromAIWithProvenance(options);
  return result ? result.data : null;
}

/**
 * As {@link generateJSONFromAI}, but also returns coarse {@link ProviderProvenance}
 * for the attempt that succeeded, so callers that persist audit/provenance can
 * record the ACTUAL winning provider/model (not the configured primary) and
 * whether a fallback was used. Returns null when every provider is exhausted.
 */
export async function generateJSONFromAIWithProvenance<T>(
  options: AIOrchestratorOptionsWithSchema<T>,
  candidateFailures: AiCandidateFailure[] = []
): Promise<AIResultWithProvenance<T> | null> {
  const {
    prompt,
    serializePrompt,
    temperature = 0.1,
    thinkingBudget,
    schema,
    structuredOutput,
    capability,
    userId,
    operationId,
    timeoutMs = AI_RUNTIME_CONFIG.timeoutMs,
  } = options;
  const task = options.task ?? capability;
  if (!task) {
    throw new Error('An AI task purpose is required.');
  }
  const policy = executionPolicy(timeoutMs, options.executionPolicy);
  const runtimeSchema = structuredOutput?.runtimeSchema ?? schema;
  const attempts = createAiProviderCandidates({
    task,
    temperature,
    thinkingBudget,
    structuredOutput,
  });

  if (attempts.length === 0) {
    console.error('[ai-orchestrator] No AI provider is configured.');
    return null;
  }

  for (const [index, attempt] of attempts.entries()) {
    const isLast = index === attempts.length - 1;
    const provenance: ProviderProvenance = {
      provider: attempt.provider,
      model: attempt.model,
      attempt: index + 1,
      fallbackUsed: index > 0,
    };
    const descriptor: AiAttemptDescriptor = {
      ...provenance,
      provider: attempt.provider,
      model: attempt.model,
      requestBudget: attempt.requestBudget,
      requestOverheadTokens: structuredOutput
        ? estimateSerializedInputTokens(JSON.stringify(structuredOutput.jsonSchema))
        : 0,
    };
    const serializedPrompt = serializePrompt ? serializePrompt(descriptor) : prompt;
    if (serializedPrompt === undefined) {
      console.error('[ai-orchestrator] No prompt or prompt serializer was supplied.');
      return null;
    }
    const requestDiagnostics = preflightAiRequest(
      serializedPrompt,
      attempt.requestBudget,
      structuredOutput?.jsonSchema
    );
    console.info('[ai-orchestrator] Request preflight.', {
      provider: attempt.provider,
      model: attempt.model,
      estimatedInputTokens: requestDiagnostics.estimatedInputTokens,
      maxCompletionTokens: requestDiagnostics.maxCompletionTokens,
      safetyMarginTokens: requestDiagnostics.safetyMarginTokens,
      estimatedRequestTokens: requestDiagnostics.estimatedRequestTokens,
      requestBudgetTokens: requestDiagnostics.safeRequestTokens,
      headroomTokens: requestDiagnostics.headroomTokens,
      overflowTokens: requestDiagnostics.overflowTokens,
    });
    const candidateStartedAt = Date.now();
    const providerDeadline = candidateStartedAt + policy.totalDeadlineMs;
    const record = (details: {
      startedAt: number;
      providerAttemptNumber: number;
      success: boolean;
      errorCode: AiAttemptErrorCode | null;
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens?: number | null;
      };
      failure?: ProviderFailureDiagnostic;
      backoffMs?: number;
      outcome: 'SUCCESS' | 'TRANSIENT_FAILURE' | 'NON_RETRYABLE_FAILURE' | 'SKIPPED';
      preflightOutcome?: 'ELIGIBLE' | 'SKIPPED';
    }) => {
      void recordAiUsageAttempt({
        userId,
        operationId,
        capability: task,
        provider: attempt.provider,
        model: attempt.model,
        inputTokens: details.usage.inputTokens,
        outputTokens: details.usage.outputTokens,
        actualTotalTokens: details.usage.totalTokens ?? null,
        latencyMs: Date.now() - details.startedAt,
        success: details.success,
        errorCode: details.errorCode,
        providerFailureReason: details.failure?.normalizedReason ?? null,
        upstreamStatusCode: details.failure?.upstreamStatusCode ?? null,
        fallbackUsed: provenance.fallbackUsed,
        attemptNumber: provenance.attempt,
        providerCandidateNumber: provenance.attempt,
        providerAttemptNumber: details.providerAttemptNumber,
        retryNumber: Math.max(0, details.providerAttemptNumber - 1),
        backoffMs: details.backoffMs ?? 0,
        outcome: details.outcome,
        preflightOutcome: details.preflightOutcome ?? 'ELIGIBLE',
        estimatedInputTokens: requestDiagnostics.estimatedInputTokens,
        maxOutputTokens: requestDiagnostics.maxCompletionTokens,
        estimatedRequestTokens: requestDiagnostics.estimatedRequestTokens,
        requestBudgetTokens: requestDiagnostics.safeRequestTokens,
        safetyMarginTokens: requestDiagnostics.safetyMarginTokens,
        requestHeadroomTokens: requestDiagnostics.headroomTokens,
        requestOverflowTokens: requestDiagnostics.overflowTokens,
      });
    };

    if (!requestDiagnostics.allowed) {
      record({
        startedAt: candidateStartedAt,
        providerAttemptNumber: 0,
        success: false,
        errorCode: 'PAYLOAD_BUDGET_EXCEEDED',
        usage: { inputTokens: null, outputTokens: null },
        failure: {
          errorCode: 'PAYLOAD_BUDGET_EXCEEDED',
          normalizedReason: 'PAYLOAD_BUDGET_EXCEEDED',
          upstreamStatusCode: null,
          retryAfterMs: null,
        },
        outcome: 'SKIPPED',
        preflightOutcome: 'SKIPPED',
      });
      console.warn(
        `[ai-orchestrator] ${attempt.label} skipped because its estimated request exceeds the configured safe budget.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
      );
      candidateFailures.push({
        provider: attempt.provider,
        model: attempt.model,
        candidateNumber: provenance.attempt,
        reason: 'PAYLOAD_BUDGET_EXCEEDED',
        upstreamStatusCode: null,
        providerAttemptCount: 0,
      });
      continue;
    }

    for (
      let providerAttemptNumber = 1;
      providerAttemptNumber <= policy.maxAttempts;
      providerAttemptNumber++
    ) {
      const remainingMs = providerDeadline - Date.now();
      if (providerAttemptNumber > 1 && remainingMs < policy.minimumAttemptWindowMs) break;
      const attemptStartedAt = Date.now();
      let timedOut = false;
      try {
      console.info(`[ai-orchestrator] Querying ${attempt.label} (candidate ${index + 1}/${attempts.length}, provider attempt ${providerAttemptNumber}/${policy.maxAttempts}).`);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, remainingMs);
      let response: AiProviderAttemptResponse;
      try {
        response = await attempt.run(
          controller.signal,
          serializedPrompt,
          requestDiagnostics.maxCompletionTokens
        );
      } finally {
        clearTimeout(timeout);
      }
      const parsed = parseJSONContent<T>(response.text);
      if (parsed !== null) {
        if (!runtimeSchema) {
          record({
            startedAt: attemptStartedAt,
            providerAttemptNumber,
            success: true,
            errorCode: null,
            usage: response,
            outcome: 'SUCCESS',
          });
          return { data: parsed, provenance, requestDiagnostics };
        }

        const validated = runtimeSchema.safeParse(parsed);
        if (validated.success) {
          record({
            startedAt: attemptStartedAt,
            providerAttemptNumber,
            success: true,
            errorCode: null,
            usage: response,
            outcome: 'SUCCESS',
          });
          return { data: validated.data, provenance, requestDiagnostics };
        }

        record({
          startedAt: attemptStartedAt,
          providerAttemptNumber,
          success: false,
          errorCode: 'SCHEMA_VALIDATION_FAILED',
          usage: response,
          failure: {
            errorCode: 'SCHEMA_VALIDATION_FAILED',
            normalizedReason: 'SCHEMA_VALIDATION_FAILED',
            upstreamStatusCode: null,
            retryAfterMs: null,
          },
          outcome: 'NON_RETRYABLE_FAILURE',
        });
        console.warn(
          `[ai-orchestrator] ${attempt.label} returned JSON that failed schema validation: ${validated.error.issues
            .slice(0, 3)
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
        );
        candidateFailures.push({
          provider: attempt.provider,
          model: attempt.model,
          candidateNumber: provenance.attempt,
          reason: 'SCHEMA_VALIDATION_FAILED',
          upstreamStatusCode: null,
          providerAttemptCount: providerAttemptNumber,
        });
        break;
      }

      record({
        startedAt: attemptStartedAt,
        providerAttemptNumber,
        success: false,
        errorCode: 'INVALID_JSON',
        usage: response,
        failure: {
          errorCode: 'INVALID_JSON',
          normalizedReason: 'INVALID_JSON',
          upstreamStatusCode: null,
          retryAfterMs: null,
        },
        outcome: 'NON_RETRYABLE_FAILURE',
      });
      console.warn(
        `[ai-orchestrator] ${attempt.label} returned no usable JSON.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
      );
      candidateFailures.push({
        provider: attempt.provider,
        model: attempt.model,
        candidateNumber: provenance.attempt,
        reason: 'INVALID_JSON',
        upstreamStatusCode: null,
        providerAttemptCount: providerAttemptNumber,
      });
      break;
    } catch (err) {
      const failure = classifyProviderFailure(err, timedOut);
      const retryable =
        policy.retryableReasons.includes(failure.normalizedReason) &&
        providerAttemptNumber < policy.maxAttempts;
      const chosenBackoffMs = failure.retryAfterMs ??
        equalJitterBackoff(policy, providerAttemptNumber);
      const hasExecutionWindow =
        providerDeadline - Date.now() - chosenBackoffMs >= policy.minimumAttemptWindowMs;
      const willRetry = retryable && hasExecutionWindow;
      record({
        startedAt: attemptStartedAt,
        providerAttemptNumber,
        success: false,
        errorCode: failure.errorCode,
        usage: { inputTokens: null, outputTokens: null },
        failure,
        backoffMs: willRetry ? chosenBackoffMs : 0,
        outcome: policy.retryableReasons.includes(failure.normalizedReason)
          ? 'TRANSIENT_FAILURE'
          : 'NON_RETRYABLE_FAILURE',
      });
      console.warn(
        `[ai-orchestrator] ${attempt.label} failed (${failure.normalizedReason}).${willRetry ? ' Retrying within provider deadline…' : isLast ? ' All providers exhausted.' : ' Trying next provider…'}`,
        {
          provider: attempt.provider,
          model: attempt.model,
          upstreamStatusCode: failure.upstreamStatusCode,
          normalizedReason: failure.normalizedReason,
          latencyMs: Date.now() - attemptStartedAt,
          backoffMs: willRetry ? chosenBackoffMs : 0,
        }
      );
      if (!willRetry) {
        candidateFailures.push({
          provider: attempt.provider,
          model: attempt.model,
          candidateNumber: provenance.attempt,
          reason: failure.normalizedReason,
          upstreamStatusCode: failure.upstreamStatusCode,
          providerAttemptCount: providerAttemptNumber,
        });
        break;
      }
      await sleep(chosenBackoffMs);
      }
    }
  }

  return null;
}

export class AiOrchestrationError extends Error {
  readonly code = 'AI_PROVIDERS_EXHAUSTED';

  constructor(
    readonly task: AiTaskPurpose,
    readonly candidateFailures: readonly AiCandidateFailure[]
  ) {
    super('All eligible AI provider candidates were exhausted.');
    this.name = 'AiOrchestrationError';
  }
}

/** Canonical task-oriented interface: returns one result or one normalized failure. */
export async function executeAiTask<T>(
  options: AIOrchestratorOptionsWithSchema<T>
): Promise<AIResultWithProvenance<T>> {
  const task = options.task ?? options.capability;
  if (!task) throw new Error('An AI task purpose is required.');
  const candidateFailures: AiCandidateFailure[] = [];
  const result = await generateJSONFromAIWithProvenance(options, candidateFailures);
  if (!result) throw new AiOrchestrationError(task, candidateFailures);
  return result;
}

interface ProviderFailureDiagnostic {
  errorCode: AiAttemptErrorCode;
  normalizedReason: AiProviderFailureReason;
  upstreamStatusCode: number | null;
  retryAfterMs: number | null;
}

function upstreamStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    error?: { code?: unknown };
  };
  if (typeof candidate.status === 'number') return candidate.status;
  if (typeof candidate.statusCode === 'number') return candidate.statusCode;
  return typeof candidate.error?.code === 'number' ? candidate.error.code : null;
}

function isNetworkError(error: unknown): boolean {
  const networkCodes = new Set([
    'ECONNREFUSED',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
  ]);
  let candidate = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === 'object'; depth++) {
    const shaped = candidate as { code?: unknown; cause?: unknown };
    if (typeof shaped.code === 'string' && networkCodes.has(shaped.code)) return true;
    candidate = shaped.cause;
  }
  return false;
}

function retryAfterMilliseconds(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const shaped = error as {
    headers?: unknown;
    response?: { headers?: unknown };
  };
  const headers = shaped.headers ?? shaped.response?.headers;
  let value: unknown;
  if (headers && typeof headers === 'object' && 'get' in headers) {
    value = (headers as { get(name: string): unknown }).get('retry-after');
  } else if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>;
    value = record['retry-after'] ?? record['Retry-After'];
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.ceil(value * 1_000);
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function classifyProviderFailure(error: unknown, timedOut: boolean): ProviderFailureDiagnostic {
  const status = upstreamStatusCode(error);
  const retryAfterMs = retryAfterMilliseconds(error);
  if (timedOut || status === 408 || status === 504) {
    return {
      errorCode: 'TIMEOUT',
      normalizedReason: 'TIMEOUT',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (status === 429) {
    return {
      errorCode: 'RATE_LIMITED',
      normalizedReason: 'RATE_LIMITED',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (status === 404) {
    return {
      errorCode: 'MODEL_NOT_FOUND',
      normalizedReason: 'MODEL_NOT_FOUND',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (status === 401 || status === 403) {
    return {
      errorCode: 'AUTH',
      normalizedReason: 'AUTH',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (status !== null && [400, 409, 413, 422].includes(status)) {
    return {
      errorCode: 'INVALID_REQUEST',
      normalizedReason: 'INVALID_REQUEST',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (status !== null && status >= 500) {
    return {
      errorCode: 'SERVICE_UNAVAILABLE',
      normalizedReason: 'SERVICE_UNAVAILABLE',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  if (isNetworkError(error)) {
    return {
      errorCode: 'NETWORK',
      normalizedReason: 'NETWORK',
      upstreamStatusCode: status,
      retryAfterMs,
    };
  }
  return {
    errorCode: 'PROVIDER_ERROR',
    normalizedReason: 'PROVIDER_ERROR',
    upstreamStatusCode: status,
    retryAfterMs,
  };
}

/**
 * Strip a leading ``` fence and everything after its closing fence.
 *
 * The previous implementation anchored the closing fence to end-of-string, so a
 * response like "```json\n{...}\n```\nHope this helps!" kept both the fence and
 * the trailing sentence and failed to parse.
 */
function stripCodeFence(text: string): string {
  if (!text.startsWith('```')) return text;

  const afterOpen = text.replace(/^```[a-z]*\s*/i, '');
  const closingFence = afterOpen.indexOf('```');
  return (closingFence === -1 ? afterOpen : afterOpen.slice(0, closingFence)).trim();
}

/**
 * Extract the first complete JSON object or array by walking the text and
 * tracking brace depth, ignoring braces inside strings and escapes.
 *
 * Models intermittently wrap the payload in prose ("Here is the JSON: {...}")
 * or append a trailing note, even with `responseMimeType: application/json`.
 * Depth-matching recovers the payload where a naive slice on the last brace
 * would break on any nested object.
 */
function extractFirstJsonValue(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const opener = text[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === opener) depth++;
    else if (char === closer) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function parseJSONContent<T>(rawText: string): T | null {
  const cleaned = stripCodeFence(rawText.trim());

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall through — the payload is probably wrapped in or followed by prose.
  }

  const extracted = extractFirstJsonValue(cleaned);
  if (extracted) {
    try {
      return JSON.parse(extracted) as T;
    } catch (e) {
      console.error(
        '[ai-orchestrator] Extracted JSON still failed to parse (payload omitted for privacy). Error:',
        e instanceof Error ? e.message : e
      );
      return null;
    }
  }

  console.error(
    `[ai-orchestrator] No JSON value found in AI response (payload omitted for privacy). Length: ${rawText.length}.`
  );
  return null;
}

export const __testing = {
  stripCodeFence,
  extractFirstJsonValue,
  parseJSONContent,
  classifyProviderFailure,
};
