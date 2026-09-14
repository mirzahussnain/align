// Registers @testing-library/jest-dom matchers (toBeInTheDocument, toHaveFocus,
// toHaveAccessibleName, …) on Vitest's expect. Importing the matcher module only
// calls expect.extend — it never touches `document`, so it is inert for the
// node-environment tests and only becomes useful in the jsdom component tests.
import '@testing-library/jest-dom/vitest';
