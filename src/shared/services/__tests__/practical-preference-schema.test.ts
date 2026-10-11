import { describe, expect, it } from 'vitest';

import * as prismaClient from '@/generated/prisma/client';

describe('generated practical preference schema', () => {
  it('exposes canonical relocation and multi-select work-style fields', () => {
    const runtime = prismaClient as unknown as Record<string, unknown>;
    expect(runtime.RelocationPreference).toEqual({
      YES: 'YES',
      NO: 'NO',
      CONSIDER: 'CONSIDER',
    });
    expect(runtime.WorkStylePreference).toEqual({
      REMOTE: 'REMOTE',
      HYBRID: 'HYBRID',
      ONSITE: 'ONSITE',
    });
  });
});
