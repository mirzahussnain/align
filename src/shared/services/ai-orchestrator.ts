import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import type { ZodType } from 'zod';
import {
  AI_RUNTIME_CONFIG,
  type AiUsageCapability,
  type SupportedAiProvider,
} from '@/shared/config/ai-runtime';
import {
  recordAiUsageAttempt,
  type AiAttemptErrorCode,
} from './ai-usage-telemetry';

const geminiConfig = AI_RUNTIME_CONFIG.providers.find(({ provider }) => provider === 'gemini');
const groqConfig = AI_RUNTIME_CONFIG.providers.find(({ provider }) => provider === 'groq');
const geminiClient = geminiConfig?.apiKey ? new GoogleGenAI({ apiKey: geminiConfig.apiKey }) : null;
const groqClient = groqConfig?.apiKey ? new Groq({ apiKey: groqConfig.apiKey }) : null;

interface AIOrchestratorOptions {
  capability: AiUsageCapability;
  userId?: string;
  operationId?: string;
  prompt: string;
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
  maxOutputTokens?: number;
}

interface AIOrchestratorOptionsWithSchema<T> extends AIOrchestratorOptions {
  /**
   * When set, a response that parses as JSON but fails validation counts as a
   * provider failure and falls through the chain, exactly like unparseable
   * output. Schemas should validate strictly only the fields the code reads
   * and pass unknown fields through — over-strictness here discards usable
   * results.
   */
  schema?: ZodType<T>;
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
}

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
  options: AIOrchestratorOptionsWithSchema<T>
): Promise<AIResultWithProvenance<T> | null> {
  const {
    prompt,
    temperature = 0.1,
    thinkingBudget,
    schema,
    capability,
    userId,
    operationId,
    timeoutMs = AI_RUNTIME_CONFIG.timeoutMs,
    maxOutputTokens = AI_RUNTIME_CONFIG.maxOutputTokens,
  } = options;

  interface AttemptResponse {
    text: string;
    inputTokens: number | null;
    outputTokens: number | null;
  }
  const attempts: {
    label: string;
    provider: SupportedAiProvider;
    model: string;
    run: (signal: AbortSignal) => Promise<AttemptResponse>;
  }[] = [];

  for (const providerConfig of AI_RUNTIME_CONFIG.providers) {
    if (providerConfig.provider === 'gemini' && geminiClient) {
      const model = providerConfig.model;
      attempts.push({
        label: `Gemini ${model}`,
        provider: 'gemini',
        model,
        run: async (signal) => {
          const response = await geminiClient.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature,
              maxOutputTokens,
              abortSignal: signal,
              ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
            },
          });
          const candidateTokens = response.usageMetadata?.candidatesTokenCount;
          const thinkingTokens = response.usageMetadata?.thoughtsTokenCount;
          return {
            text: response.text || '',
            inputTokens: response.usageMetadata?.promptTokenCount ?? null,
            outputTokens:
              candidateTokens === undefined && thinkingTokens === undefined
                ? null
                : (candidateTokens ?? 0) + (thinkingTokens ?? 0),
          };
        },
      });
      continue;
    }

    if (providerConfig.provider === 'groq' && groqClient) {
      const model = providerConfig.model;
      attempts.push({
        label: `Groq ${model}`,
        provider: 'groq',
        model,
        run: async (signal) => {
          const chatCompletion = await groqClient.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model,
            response_format: { type: 'json_object' },
            temperature,
            max_tokens: maxOutputTokens,
          }, { signal });
          return {
            text: chatCompletion.choices[0]?.message?.content || '',
            inputTokens: chatCompletion.usage?.prompt_tokens ?? null,
            outputTokens: chatCompletion.usage?.completion_tokens ?? null,
          };
        },
      });
    }
  }

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
    const startedAt = Date.now();
    let timedOut = false;
    const record = (
      success: boolean,
      errorCode: AiAttemptErrorCode | null,
      usage: { inputTokens: number | null; outputTokens: number | null }
    ) => {
      void recordAiUsageAttempt({
        userId,
        operationId,
        capability,
        provider: attempt.provider,
        model: attempt.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs: Date.now() - startedAt,
        success,
        errorCode,
        fallbackUsed: provenance.fallbackUsed,
        attemptNumber: provenance.attempt,
      });
    };

    try {
      console.info(`[ai-orchestrator] Querying ${attempt.label} (attempt ${index + 1}/${attempts.length}).`);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      let response: AttemptResponse;
      try {
        response = await attempt.run(controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      const parsed = parseJSONContent<T>(response.text);
      if (parsed !== null) {
        if (!schema) {
          record(true, null, response);
          return { data: parsed, provenance };
        }

        const validated = schema.safeParse(parsed);
        if (validated.success) {
          record(true, null, response);
          return { data: validated.data, provenance };
        }

        record(false, 'SCHEMA_VALIDATION_FAILED', response);
        console.warn(
          `[ai-orchestrator] ${attempt.label} returned JSON that failed schema validation: ${validated.error.issues
            .slice(0, 3)
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
        );
        continue;
      }

      record(false, 'INVALID_JSON', response);
      console.warn(
        `[ai-orchestrator] ${attempt.label} returned no usable JSON.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
      );
    } catch (err) {
      record(false, timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR', {
        inputTokens: null,
        outputTokens: null,
      });
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[ai-orchestrator] ${attempt.label} failed: ${message}.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
      );
    }
  }

  return null;
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

export const __testing = { stripCodeFence, extractFirstJsonValue, parseJSONContent };
