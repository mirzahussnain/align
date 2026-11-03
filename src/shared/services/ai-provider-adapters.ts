import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import {
  AI_RUNTIME_CONFIG,
  type AiTaskPurpose,
} from '@/shared/config/ai-runtime';
import type {
  AiExecutionCandidate,
  AiStructuredOutputContract,
} from './ai-orchestrator';

interface AdapterOptions<T> {
  task: AiTaskPurpose;
  temperature: number;
  thinkingBudget?: number;
  structuredOutput?: AiStructuredOutputContract<T>;
}

/**
 * Provider transport boundary. Domain serializers and validators never live
 * here; adapters only translate the shared request/usage contract to SDKs.
 */
export function createAiProviderCandidates<T>(
  options: AdapterOptions<T>
): AiExecutionCandidate[] {
  const candidates: AiExecutionCandidate[] = [];

  for (const providerConfig of AI_RUNTIME_CONFIG.providers) {
    if (providerConfig.provider === 'gemini' && providerConfig.apiKey) {
      const client = new GoogleGenAI({ apiKey: providerConfig.apiKey });
      const model = providerConfig.model;
      candidates.push({
        label: `Gemini ${model}`,
        provider: 'gemini',
        model,
        requestBudget: providerConfig.requestBudget,
        run: async (signal, serializedPrompt, maxCompletionTokens) => {
          const response = await client.models.generateContent({
            model,
            contents: serializedPrompt,
            config: {
              responseMimeType: 'application/json',
              ...(options.structuredOutput
                ? { responseJsonSchema: options.structuredOutput.jsonSchema }
                : {}),
              temperature: options.temperature,
              maxOutputTokens: maxCompletionTokens,
              abortSignal: signal,
              ...(options.thinkingBudget !== undefined
                ? { thinkingConfig: { thinkingBudget: options.thinkingBudget } }
                : {}),
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
            totalTokens: response.usageMetadata?.totalTokenCount ?? null,
          };
        },
      });
      continue;
    }

    if (providerConfig.provider === 'groq' && providerConfig.apiKey) {
      const client = new Groq({ apiKey: providerConfig.apiKey });
      const model = providerConfig.model;
      candidates.push({
        label: `Groq ${model}`,
        provider: 'groq',
        model,
        requestBudget: providerConfig.requestBudget,
        run: async (signal, serializedPrompt, maxCompletionTokens) => {
          const response = await client.chat.completions.create({
            messages: [{ role: 'user', content: serializedPrompt }],
            model,
            response_format: options.structuredOutput
              ? {
                  type: 'json_schema',
                  json_schema: {
                    name: options.structuredOutput.name,
                    strict: true,
                    schema: options.structuredOutput.jsonSchema,
                  },
                }
              : { type: 'json_object' },
            ...(providerConfig.reasoningEffortByCapability?.[options.task]
              ? { reasoning_effort: providerConfig.reasoningEffortByCapability[options.task] }
              : {}),
            temperature: options.temperature,
            max_tokens: maxCompletionTokens,
          }, { signal });
          return {
            text: response.choices[0]?.message?.content || '',
            inputTokens: response.usage?.prompt_tokens ?? null,
            outputTokens: response.usage?.completion_tokens ?? null,
            totalTokens: response.usage?.total_tokens ?? null,
          };
        },
      });
    }
  }

  return candidates;
}
