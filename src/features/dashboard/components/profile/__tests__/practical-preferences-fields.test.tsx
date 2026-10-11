// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PracticalPreferencesFields from '../PracticalPreferencesFields';
import { EMPTY_PRACTICAL_PREFERENCES, type PracticalPreferencesInput } from '@/shared/schemas/practical-preferences';

function Harness({ initial = EMPTY_PRACTICAL_PREFERENCES }: { initial?: PracticalPreferencesInput }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PracticalPreferencesFields value={value} onChange={setValue} idPrefix="test" />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

afterEach(cleanup);

describe('PracticalPreferencesFields', () => {
  it('edits and clears relocation willingness', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    expect(screen.getByTestId('value')).toHaveTextContent('"relocationPreference":"CONSIDER"');
    fireEvent.click(screen.getByRole('button', { name: 'Maybe' }));
    expect(screen.getByTestId('value')).toHaveTextContent('"relocationPreference":null');
  });

  it('selects a supported maximum one-way commute and clears it', () => {
    render(<Harness />);
    expect(screen.getByText(/one-way journey/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/maximum acceptable one-way commute/i), { target: { value: '45' } });
    expect(screen.getByTestId('value')).toHaveTextContent('"maxCommuteMinutes":45');
    fireEvent.change(screen.getByLabelText(/maximum acceptable one-way commute/i), { target: { value: '' } });
    expect(screen.getByTestId('value')).toHaveTextContent('"maxCommuteMinutes":null');
  });

  it('allows multiple independent work arrangements and an empty selection', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remote' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hybrid' }));
    expect(screen.getByTestId('value')).toHaveTextContent('"preferredWorkStyles":["REMOTE","HYBRID"]');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remote' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hybrid' }));
    expect(screen.getByTestId('value')).toHaveTextContent('"preferredWorkStyles":[]');
  });
});
