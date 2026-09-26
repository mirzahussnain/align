// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ResourcePageBackdrop from '../ResourcePageBackdrop';

afterEach(cleanup);

describe('ResourcePageBackdrop', () => {
  it.each(['jobs', 'visas', 'market'] as const)(
    'covers the %s resource page with reusable reduced-motion-safe motifs',
    (variant) => {
      render(<ResourcePageBackdrop variant={variant} />);

      const backdrop = screen.getByTestId('resource-page-backdrop');
      const motifs = screen.getAllByTestId('resource-backdrop-motif');

      expect(backdrop).toHaveAttribute('data-variant', variant);
      expect(backdrop).toHaveClass('absolute', 'inset-0', 'h-full');
      expect(motifs.length).toBeGreaterThanOrEqual(3);
      motifs.forEach((motif) => {
        expect(motif.getAttribute('class')).toContain(
          'motion-reduce:animate-none',
        );
      });
    },
  );
});
