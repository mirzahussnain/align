import { describe, expect, it } from 'vitest';
import {
  GeneratedEvidenceQuarantineError,
  SOURCE_PRIORITY,
  assertGenerationTrusted,
  canBecomeCanonical,
  compareSourcePriority,
  isGeneratedOrInferred,
  isTrustedForGeneration,
  outranks,
  type EvidenceSourceClass,
} from '@/shared/services/evidence-provenance';

describe('source priority', () => {
  it('ranks explicit user confirmation above everything', () => {
    const sorted = [...SOURCE_PRIORITY].sort(() => Math.random() - 0.5).sort(compareSourcePriority);
    expect(sorted[0]).toBe('profile_user_confirmed');
  });

  it('always ranks generated output last', () => {
    for (const other of SOURCE_PRIORITY) {
      if (other === 'generated_output') continue;
      expect(outranks(other, 'generated_output')).toBe(true);
    }
  });

  it('user-entered outranks any extraction', () => {
    expect(outranks('profile_user_entered', 'cv_extracted')).toBe(true);
    expect(outranks('cv_extracted', 'profile_user_entered')).toBe(false);
  });

  it('system derivation outranks model inference and generated output', () => {
    expect(outranks('system_derived', 'model_inferred')).toBe(true);
    expect(outranks('system_derived', 'generated_output')).toBe(true);
  });
});

describe('canonical eligibility', () => {
  it('only user-entered and user-confirmed can become canonical', () => {
    expect(canBecomeCanonical('profile_user_entered')).toBe(true);
    expect(canBecomeCanonical('profile_user_confirmed')).toBe(true);
  });

  it('extraction, inference, and generated output can never become canonical', () => {
    for (const cls of ['cv_extracted', 'document_extracted', 'model_inferred', 'generated_output'] as const) {
      expect(canBecomeCanonical(cls)).toBe(false);
    }
  });
});

describe('generation trust', () => {
  it('trusts canonical, approval snapshots, and system derivations', () => {
    for (const cls of ['profile_user_entered', 'profile_user_confirmed', 'approval_snapshot', 'system_derived'] as const) {
      expect(isTrustedForGeneration(cls)).toBe(true);
    }
  });

  it('never trusts extraction, inference, or generated output', () => {
    for (const cls of ['cv_extracted', 'document_extracted', 'model_inferred', 'generated_output'] as const) {
      expect(isTrustedForGeneration(cls)).toBe(false);
    }
  });

  it('flags generated and inferred content', () => {
    expect(isGeneratedOrInferred('generated_output')).toBe(true);
    expect(isGeneratedOrInferred('model_inferred')).toBe(true);
    expect(isGeneratedOrInferred('profile_user_entered')).toBe(false);
  });
});

describe('quarantine guard', () => {
  it('passes when every item is generation-trusted', () => {
    expect(() =>
      assertGenerationTrusted([
        { sourceClass: 'profile_user_confirmed' },
        { sourceClass: 'approval_snapshot' },
      ])
    ).not.toThrow();
  });

  it('throws when generated output is smuggled in', () => {
    expect(() =>
      assertGenerationTrusted([
        { sourceClass: 'profile_user_entered' },
        { sourceClass: 'generated_output' as EvidenceSourceClass },
      ])
    ).toThrow(GeneratedEvidenceQuarantineError);
  });

  it('throws when model inference is smuggled in', () => {
    expect(() =>
      assertGenerationTrusted([{ sourceClass: 'model_inferred' as EvidenceSourceClass }])
    ).toThrow(GeneratedEvidenceQuarantineError);
  });
});
