import { describe, expect, it } from 'vitest';

import { formatProviderBreakdown, providerLabel } from '../presentation';

describe('admin provider presentation', () => {
  it.each([
    ['gemini', 'Gemini'],
    ['open_router', 'Open Router'],
    ['azure-openai', 'Azure Openai'],
  ])('formats the stable provider ID %s for display', (provider, label) => {
    expect(providerLabel(provider)).toBe(label);
  });

  it('formats every provider returned by the admin DTO', () => {
    expect(formatProviderBreakdown([
      { provider: 'gemini', attempts: 3 },
      { provider: 'groq', attempts: 2 },
      { provider: 'open_router', attempts: 5 },
      { provider: 'anthropic', attempts: 1 },
    ])).toBe('Gemini 3 · Groq 2 · Open Router 5 · Anthropic 1');
  });
});
