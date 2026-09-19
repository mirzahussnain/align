// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveFocus,
// toHaveAccessibleName, …) on Vitest's expect. Importing the matcher module only
// calls expect.extend — it never touches `document`, so it is inert for the
// node-environment tests and only becomes useful in the jsdom component tests.
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Next.js resolves this marker to an empty module in server bundles. Vitest
// runs modules directly in Node, so mirror that condition for server imports.
vi.mock('server-only', () => ({}));
