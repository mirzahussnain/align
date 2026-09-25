import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { VISAS } from '../immigration-config';

describe('public sponsorship and visa copy', () => {
  it('does not invent a signed-out visitor profile or recommend KTP by default', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/(public)/immigration/page.tsx'), 'utf8');
    expect(page).not.toMatch(/MSc graduate|strong technical skills|goldmine|>Recommended</i);
    expect(page).not.toMatch(/Cost Calculator|Estimated Total/i);
    expect(page).toMatch(/one career route/i);
  });

  it('keeps sponsorship and settlement outcomes conditional', () => {
    const copy = JSON.stringify(VISAS);
    expect(copy).not.toMatch(/leads directly|guaranteed|guarantee|can sponsor your/i);
    expect(copy).toMatch(/may be eligible|subject to/i);
  });

  it('links every route to current official guidance', () => {
    for (const visa of VISAS) expect(visa.officialUrl).toMatch(/^https:\/\/www\.gov\.uk\//);
  });
});
