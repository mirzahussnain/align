import { describe, expect, it } from 'vitest';
import { RegenerateSchema } from '@/app/api/cv/regenerate/schema';
import { REGENERATION_CONTEXT_LIMITS as limits } from '@/shared/config/analysis-domain';

const base = { analysisId: 'analysis-1', templateId: 'architect' };
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

function hitlWithBytes(target: number) {
  const context = Object.fromEntries(
    Array.from({ length: limits.maxHitlEntries }, (_, index) => [`k${index}`, 'x'.repeat(limits.maxHitlValueCharacters)])
  );
  const excess = bytes(context) - target;
  context.k0 = context.k0.slice(0, -excess);
  expect(bytes(context)).toBe(target);
  return context;
}

function approved(index: number, rationale = '') {
  return {
    requirementId: `requirement-${index}`,
    evidenceRef: { type: 'experience' as const, id: `evidence-${index}` },
    ...(rationale ? { rationale } : {}),
  };
}

function payloadWithBytes(target: number) {
  const payload = {
    ...base,
    hitlContext: hitlWithBytes(limits.maxHitlBytes),
    approvedProfileEvidence: Array.from({ length: 13 }, (_, index) => approved(index, 'r'.repeat(2000))),
  };
  const excess = bytes(payload) - target;
  const last = payload.approvedProfileEvidence.at(-1)!;
  last.rationale = last.rationale!.slice(0, -excess);
  expect(bytes(payload)).toBe(target);
  return payload;
}

describe('RegenerateSchema input ceilings', () => {
  it('accepts the exact HITL entry, key, value, and byte limits', () => {
    const hitlContext = hitlWithBytes(limits.maxHitlBytes);
    const longestKey = 'k'.repeat(limits.maxHitlKeyCharacters);
    delete hitlContext.k0;
    hitlContext[longestKey] = 'x'.repeat(limits.maxHitlValueCharacters);
    const current = bytes(hitlContext);
    hitlContext.k1 = hitlContext.k1.slice(0, -(current - limits.maxHitlBytes));

    expect(Object.keys(hitlContext)).toHaveLength(limits.maxHitlEntries);
    expect(bytes(hitlContext)).toBe(limits.maxHitlBytes);
    expect(RegenerateSchema.safeParse({ ...base, hitlContext }).success).toBe(true);
  });

  it.each([
    ['entries', Object.fromEntries(Array.from({ length: limits.maxHitlEntries + 1 }, (_, index) => [`k${index}`, 'x']))],
    ['key', { ['k'.repeat(limits.maxHitlKeyCharacters + 1)]: 'x' }],
    ['value', { key: 'x'.repeat(limits.maxHitlValueCharacters + 1) }],
    ['serialized bytes', (() => { const value = hitlWithBytes(limits.maxHitlBytes); value.k0 += 'x'; return value; })()],
  ])('rejects HITL %s one over the limit', (_label, hitlContext) => {
    expect(RegenerateSchema.safeParse({ ...base, hitlContext }).success).toBe(false);
  });

  it('accepts approved evidence and application IDs at their count limits', () => {
    const result = RegenerateSchema.safeParse({
      ...base,
      approvedProfileEvidence: Array.from({ length: limits.maxApprovedItems }, (_, index) => approved(index)),
      applicationEvidenceContextIds: Array.from({ length: limits.maxApplicationIds }, (_, index) => `application-${index}`),
    });
    expect(result.success).toBe(true);
  });

  it('rejects approved evidence and application ID counts one over their limits', () => {
    expect(RegenerateSchema.safeParse({
      ...base,
      approvedProfileEvidence: Array.from({ length: limits.maxApprovedItems + 1 }, (_, index) => approved(index)),
    }).success).toBe(false);
    expect(RegenerateSchema.safeParse({
      ...base,
      applicationEvidenceContextIds: Array.from({ length: limits.maxApplicationIds + 1 }, (_, index) => `application-${index}`),
    }).success).toBe(false);
  });

  it('accepts identifiers at 128 characters and rejects 129', () => {
    const exact = 'i'.repeat(limits.maxIdentifierCharacters);
    expect(RegenerateSchema.safeParse({ ...base, analysisId: exact, profileId: exact }).success).toBe(true);
    expect(RegenerateSchema.safeParse({ ...base, analysisId: `${exact}i` }).success).toBe(false);
    expect(RegenerateSchema.safeParse({ ...base, applicationEvidenceContextIds: [`${exact}i`] }).success).toBe(false);
  });

  it('accepts total context at 65,536 bytes and rejects one byte more', () => {
    const payload = payloadWithBytes(limits.maxTotalBytes);
    expect(RegenerateSchema.safeParse(payload).success).toBe(true);
    payload.approvedProfileEvidence.at(-1)!.rationale! += 'x';
    expect(bytes(payload)).toBe(limits.maxTotalBytes + 1);
    expect(RegenerateSchema.safeParse(payload).success).toBe(false);
  });

  it('rejects duplicate semantic IDs and unknown fields at every level', () => {
    expect(RegenerateSchema.safeParse({
      ...base,
      approvedProfileEvidence: [approved(1), { ...approved(2), requirementId: 'requirement-1' }],
    }).success).toBe(false);
    expect(RegenerateSchema.safeParse({
      ...base,
      applicationEvidenceContextIds: ['same', 'same'],
    }).success).toBe(false);
    expect(RegenerateSchema.safeParse({ ...base, forged: true }).success).toBe(false);
    expect(RegenerateSchema.safeParse({
      ...base,
      approvedProfileEvidence: [{ ...approved(1), forged: true }],
    }).success).toBe(false);
    expect(RegenerateSchema.safeParse({
      ...base,
      approvedProfileEvidence: [{ ...approved(1), evidenceRef: { type: 'experience', id: 'one', forged: true } }],
    }).success).toBe(false);
  });
});
