import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { AI_CONFIG } from '@/shared/lib/config';

const geminiClient = AI_CONFIG.gemini.apiKey ? new GoogleGenAI({ apiKey: AI_CONFIG.gemini.apiKey }) : null;
const groqClient = AI_CONFIG.groq.apiKey ? new Groq({ apiKey: AI_CONFIG.groq.apiKey }) : null;

interface AIOrchestratorOptions {
  prompt: string;
  temperature?: number;
}

export async function generateJSONFromAI<T>(options: AIOrchestratorOptions): Promise<T | null> {
  const { prompt, temperature = 0.1 } = options;

  // 1. Try Gemini primary
  if (geminiClient) {
    try {
      console.log(`Querying Google Gemini (${AI_CONFIG.gemini.model})...`);
      const response = await geminiClient.models.generateContent({
        model: AI_CONFIG.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature,
        },
      });
      return parseJSONContent<T>(response.text || '');
    } catch (err) {
      console.warn(`Gemini analysis failed, trying fallback model...`, err instanceof Error ? err.message : err);
      try {
        const responseFallback = await geminiClient.models.generateContent({
          model: AI_CONFIG.gemini.fallbackModel,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            temperature,
          },
        });
        return parseJSONContent<T>(responseFallback.text || '');
      } catch (errFallback) {
        console.warn('Gemini fallback failed completely, falling back to Groq...', errFallback instanceof Error ? errFallback.message : errFallback);
      }
    }
  }

  // 2. Try Groq fallback
  if (groqClient) {
    try {
      console.log(`Querying Groq (${AI_CONFIG.groq.model})...`);
      const chatCompletion = await groqClient.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: AI_CONFIG.groq.model,
        response_format: { type: 'json_object' },
        temperature,
      });

      return parseJSONContent<T>(chatCompletion.choices[0]?.message?.content || '');
    } catch (err) {
      console.error('Groq analysis failed:', err instanceof Error ? err.message : err);
    }
  }

  return null;
}

function parseJSONContent<T>(rawText: string): T | null {
  try {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    }
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error('Failed to parse AI JSON response (Payload omitted for privacy). Error:', e instanceof Error ? e.message : e);
    return null;
  }
}
