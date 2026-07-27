import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import type { ZodType } from 'zod';
import { AI_CONFIG } from '@/shared/lib/config';

const geminiClient = AI_CONFIG.gemini.apiKey ? new GoogleGenAI({ apiKey: AI_CONFIG.gemini.apiKey }) : null;
const groqClient = AI_CONFIG.groq.apiKey ? new Groq({ apiKey: AI_CONFIG.groq.apiKey }) : null;

interface AIOrchestratorOptions {
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
  const { prompt, temperature = 0.1, thinkingBudget, schema } = options;

  const attempts: { label: string; provider: string; model: string; run: () => Promise<string> }[] = [];

  if (geminiClient) {
    for (const model of [AI_CONFIG.gemini.model, AI_CONFIG.gemini.fallbackModel]) {
      attempts.push({
        label: `Gemini ${model}`,
        provider: 'gemini',
        model,
        run: async () => {
          const response = await geminiClient.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature,
              ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
            },
          });
          return response.text || '';
        },
      });
    }
  }

  if (groqClient) {
    attempts.push({
      label: `Groq ${AI_CONFIG.groq.model}`,
      provider: 'groq',
      model: AI_CONFIG.groq.model,
      run: async () => {
        const chatCompletion = await groqClient.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: AI_CONFIG.groq.model,
          response_format: { type: 'json_object' },
          temperature,
        });
        return chatCompletion.choices[0]?.message?.content || '';
      },
    });
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

    try {
      console.info(`[ai-orchestrator] Querying ${attempt.label} (attempt ${index + 1}/${attempts.length}).`);
      const parsed = parseJSONContent<T>(await attempt.run());
      if (parsed !== null) {
        if (!schema) return { data: parsed, provenance };

        const validated = schema.safeParse(parsed);
        if (validated.success) return { data: validated.data, provenance };

        console.warn(
          `[ai-orchestrator] ${attempt.label} returned JSON that failed schema validation: ${validated.error.issues
            .slice(0, 3)
            .map(i => `${i.path.join('.')}: ${i.message}`)
            .join('; ')}.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
        );
        continue;
      }

      console.warn(
        `[ai-orchestrator] ${attempt.label} returned no usable JSON.${isLast ? ' All providers exhausted.' : ' Trying next provider…'}`
      );
    } catch (err) {
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
