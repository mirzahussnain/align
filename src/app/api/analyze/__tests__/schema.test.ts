import { describe, it, expect } from 'vitest';
import { AnalyzeRequestSchema, DetectRequestSchema } from '../schema';

function pdf(name = 'cv.pdf'): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'application/pdf' });
}

/** The minimal valid ATS request; each test overrides one field. */
function base(overrides: Record<string, unknown> = {}) {
  return { file: pdf(), mode: 'ats', ...overrides };
}

describe('AnalyzeRequestSchema — target selection', () => {
  it('defaults evidenceSource to cv_only when absent', () => {
    const parsed = AnalyzeRequestSchema.safeParse(base());
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.evidenceSource).toBe('cv_only');
  });

  it('accepts every known evidence source at the type boundary (route feature-gates)', () => {
    for (const evidenceSource of ['cv_only', 'active_profile', 'saved_profile', 'cv_and_profile']) {
      expect(AnalyzeRequestSchema.safeParse(base({ evidenceSource })).success).toBe(true);
    }
  });

  it('rejects an unknown evidence source value', () => {
    expect(AnalyzeRequestSchema.safeParse(base({ evidenceSource: 'linkedin' })).success).toBe(false);
  });

  it('rejects an unknown target selection value', () => {
    expect(AnalyzeRequestSchema.safeParse(base({ targetSelection: 'psychic' })).success).toBe(false);
  });

  it('requires savedProfileId when selecting a saved-profile target', () => {
    const missing = AnalyzeRequestSchema.safeParse(base({ targetSelection: 'saved_profile' }));
    expect(missing.success).toBe(false);
    const present = AnalyzeRequestSchema.safeParse(
      base({ targetSelection: 'saved_profile', savedProfileId: 'p2' })
    );
    expect(present.success).toBe(true);
  });

  it('requires a target role when selecting a custom role', () => {
    const missing = AnalyzeRequestSchema.safeParse(base({ targetSelection: 'custom_role' }));
    expect(missing.success).toBe(false);
    const present = AnalyzeRequestSchema.safeParse(
      base({ targetSelection: 'custom_role', targetRole: 'Warehouse Team Leader' })
    );
    expect(present.success).toBe(true);
  });
});

describe('AnalyzeRequestSchema — CV source', () => {
  it('accepts a stored CV in place of an upload', () => {
    const parsed = AnalyzeRequestSchema.safeParse({ mode: 'job_match', storedCvId: 'cv-1' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.file).toBeUndefined();
  });

  it('rejects a request with no CV at all', () => {
    expect(AnalyzeRequestSchema.safeParse({ mode: 'ats' }).success).toBe(false);
  });

  it('rejects both sources together rather than silently picking one', () => {
    // Which CV was analysed would be invisible in the stored result, so the
    // ambiguity is refused instead of resolved by precedence.
    expect(
      AnalyzeRequestSchema.safeParse(base({ storedCvId: 'cv-1' })).success
    ).toBe(false);
  });
});

describe('AnalyzeRequestSchema — target role format', () => {
  const bad = [
    ['too short', 'A'],
    ['digits/punctuation only', '12345'],
    ['contains a newline', 'Warehouse\nOperative'],
    ['too long', 'x'.repeat(101)],
  ] as const;

  it.each(bad)('rejects a %s target role', (_label, targetRole) => {
    expect(AnalyzeRequestSchema.safeParse(base({ targetRole })).success).toBe(false);
  });

  it('accepts a normal role and trims it', () => {
    const parsed = AnalyzeRequestSchema.safeParse(base({ targetRole: '  Senior Nurse  ' }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.targetRole).toBe('Senior Nurse');
  });

  it('accepts the legacy confirmProfileTarget string form', () => {
    const parsed = AnalyzeRequestSchema.safeParse(base({ confirmProfileTarget: 'true' }));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confirmProfileTarget).toBe(true);
  });
});

describe('Direct multipart CV size', () => {
  it('accepts 4 MiB and rejects one byte more for analyze and detect', () => {
    const exact = new File([new Uint8Array(4 * 1024 * 1024)], 'cv.pdf', { type: 'application/pdf' });
    const over = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'cv.pdf', { type: 'application/pdf' });
    expect(AnalyzeRequestSchema.safeParse({ file: exact, mode: 'ats' }).success).toBe(true);
    expect(AnalyzeRequestSchema.safeParse({ file: over, mode: 'ats' }).success).toBe(false);
    expect(DetectRequestSchema.safeParse({ file: exact }).success).toBe(true);
    expect(DetectRequestSchema.safeParse({ file: over }).success).toBe(false);
  });
});
describe('DetectRequestSchema', () => {
  it('accepts a PDF with an optional profileId', () => {
    expect(DetectRequestSchema.safeParse({ file: pdf(), profileId: 'p1' }).success).toBe(true);
    expect(DetectRequestSchema.safeParse({ file: pdf() }).success).toBe(true);
  });

  it('rejects a non-PDF file', () => {
    const notPdf = new File([new Uint8Array([1])], 'cv.txt', { type: 'text/plain' });
    expect(DetectRequestSchema.safeParse({ file: notPdf }).success).toBe(false);
  });
});
