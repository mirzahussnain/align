import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../ai-orchestrator', () => ({
  generateJSONFromAI: mocks.generate,
  generateJSONFromAIWithProvenance: mocks.generate,
}));
vi.mock('../prompt-composer', () => ({
  composeSemanticPrompt: vi.fn(() => 'semantic prompt'),
  composeJobMatchPrompt: vi.fn(() => 'job match prompt'),
}));
vi.mock('../cv-rewrite-prompt', () => ({
  composeRewritePrompt: vi.fn(() => 'rewrite prompt'),
}));

import { getSemanticCVFeedbackWithProvenance } from '../ai-analyser';
import { rewriteCVWithProvenance } from '../cv-rewriter';

describe('AI telemetry context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generate.mockResolvedValue(null);
  });

  it('threads the user and operation identifiers through ATS provider attempts', async () => {
    await (getSemanticCVFeedbackWithProvenance as CallableFunction)(
      'CV text', {}, {}, {}, { userId: 'user-1', operationId: 'operation-1' }
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', operationId: 'operation-1' })
    );
  });

  it('threads the user and operation identifiers through CV regeneration attempts', async () => {
    await (rewriteCVWithProvenance as CallableFunction)(
      {}, { userId: 'user-2', operationId: 'operation-2' }
    );

    expect(mocks.generate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-2', operationId: 'operation-2' })
    );
  });
});
