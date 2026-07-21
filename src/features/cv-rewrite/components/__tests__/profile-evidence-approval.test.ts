import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wizard = readFileSync(
  join(process.cwd(), 'src/features/cv-rewrite/components/GenerateCvWizardModal.tsx'),
  'utf8'
);
const step = readFileSync(
  join(process.cwd(), 'src/features/cv-rewrite/components/steps/ProfileBridgeStep.tsx'),
  'utf8'
);

describe('profile evidence approval UI', () => {
  it('starts every comparison with no approved evidence regardless of confidence', () => {
    expect(wizard).toContain('setApprovedProfileEvidence([])');
    expect(wizard).not.toMatch(/confidence\s*===\s*['"]high['"][\s\S]*approved/i);
  });

  it('shows explicit use and do-not-use controls and sends requirement/evidence pairs', () => {
    expect(step).toContain('Use this evidence');
    expect(step).toContain('Do not use');
    expect(wizard).toContain('approvedProfileEvidence: approvedProfileEvidence.map');
    expect(wizard).not.toContain('approvedProfileItemIds');
  });
});
