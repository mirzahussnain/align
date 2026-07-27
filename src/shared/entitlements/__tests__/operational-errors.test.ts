import { describe, expect, it } from 'vitest';
import {
  interpretOperationalError,
  OPERATIONAL_MESSAGES,
} from '../operational-errors';

describe('interpretOperationalError — coded errors', () => {
  it('maps ENTITLEMENT_REQUIRED to an upgrade action carrying a reconstructed decision', () => {
    const action = interpretOperationalError(429, {
      code: 'ENTITLEMENT_REQUIRED',
      capability: 'cv_regeneration',
      reason: 'quota_exhausted',
      plan: 'FREE',
      upgradeTarget: 'PRO',
      limit: 1,
      used: 1,
      remaining: 0,
      period: 'month',
    });
    expect(action.type).toBe('upgrade');
    if (action.type === 'upgrade') {
      expect(action.capability).toBe('cv_regeneration');
      expect(action.decision).toMatchObject({ capability: 'cv_regeneration', reason: 'quota_exhausted', upgradeTarget: 'PRO', limit: 1 });
    }
  });

  it('maps OPERATION_IN_PROGRESS to in_progress and NEVER upgrade', () => {
    const action = interpretOperationalError(409, { code: 'OPERATION_IN_PROGRESS', capability: 'ai_enhanced_ats_analysis', operationId: 'op-1' });
    expect(action.type).toBe('in_progress');
    if (action.type === 'in_progress') expect(action.message).toBe(OPERATIONAL_MESSAGES.inProgress);
  });

  it('maps a retryable AI_OPERATION_FAILED to a "not charged" retry message', () => {
    const action = interpretOperationalError(502, {
      code: 'AI_OPERATION_FAILED',
      capability: 'job_match_analysis',
      operationId: 'op-1',
      reason: 'provider_unavailable',
      retryable: true,
      charged: false,
    });
    expect(action.type).toBe('retry');
    if (action.type === 'retry') {
      expect(action.message).toBe(OPERATIONAL_MESSAGES.retry);
      expect(action.message).toContain('not charged');
    }
  });

  it('maps a truthfulness/safety failure to a terminal "not saved or charged" message', () => {
    for (const reason of ['truthfulness_failure', 'safety_rejection']) {
      const action = interpretOperationalError(422, { code: 'AI_OPERATION_FAILED', capability: 'cv_regeneration', operationId: 'op-1', reason });
      expect(action.type).toBe('terminal');
      if (action.type === 'terminal') expect(action.message).toBe(OPERATIONAL_MESSAGES.unsafeResult);
    }
  });

  it('maps a repairable RESULT_UNAVAILABLE to a repair action with the original operation id', () => {
    const action = interpretOperationalError(409, {
      code: 'RESULT_UNAVAILABLE',
      capability: 'cv_regeneration',
      operationId: 'op-77',
      charged: true,
      retryable: false,
      repairable: true,
    });
    expect(action.type).toBe('repair');
    if (action.type === 'repair') {
      expect(action.operationId).toBe('op-77');
      expect(action.capability).toBe('cv_regeneration');
      expect(action.message).toBe(OPERATIONAL_MESSAGES.repairAvailable);
    }
  });

  it('maps a non-repairable RESULT_UNAVAILABLE to terminal "start a new analysis"', () => {
    const action = interpretOperationalError(409, { code: 'RESULT_UNAVAILABLE', capability: 'cv_regeneration', operationId: 'op-77', repairable: false });
    expect(action.type).toBe('terminal');
    if (action.type === 'terminal') expect(action.message).toBe(OPERATIONAL_MESSAGES.repairUnavailable);
  });

  it('maps OPERATION_CONFLICT to terminal (a fresh request, never an upgrade)', () => {
    const action = interpretOperationalError(409, { code: 'OPERATION_CONFLICT', capability: 'ai_enhanced_ats_analysis', operationId: 'op-1' });
    expect(action.type).toBe('terminal');
  });
});

describe('interpretOperationalError — uncoded legacy fallbacks', () => {
  it('maps a bare 400 to correct_input', () => {
    const action = interpretOperationalError(400, { error: 'analysisId is required' });
    expect(action.type).toBe('correct_input');
    if (action.type === 'correct_input') expect(action.message).toBe('analysisId is required');
  });

  it('maps an uncoded 409 mentioning evidence to stale_evidence', () => {
    const action = interpretOperationalError(409, { error: 'Approved evidence snapshot is unavailable.' });
    expect(action.type).toBe('stale_evidence');
    if (action.type === 'stale_evidence') expect(action.message).toBe(OPERATIONAL_MESSAGES.staleEvidence);
  });

  it('maps a bare 422 to a terminal unsafe-result message', () => {
    const action = interpretOperationalError(422, { error: 'Generated CV content could not be verified against the supplied evidence.' });
    expect(action.type).toBe('terminal');
  });

  it('maps 5xx to a retryable "not charged" message', () => {
    const action = interpretOperationalError(503, {});
    expect(action.type).toBe('retry');
    if (action.type === 'retry') expect(action.message).toContain('not charged');
  });
});
