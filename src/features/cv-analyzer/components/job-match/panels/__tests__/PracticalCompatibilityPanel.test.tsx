// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PracticalCompatibilityPanel from '../PracticalCompatibilityPanel';

afterEach(cleanup);

describe('PracticalCompatibilityPanel', () => {
  it('presents practical fit separately from CV scoring and labels preference conflicts safely', () => {
    render(
      <PracticalCompatibilityPanel
        compatibility={{
          items: [
            {
              category: 'REMOTE_ONSITE',
              state: 'CONFLICT',
              source: 'BOTH',
              vacancyRequirement: 'Onsite work style',
              confirmedProfileFact: 'Preferred work styles: remote',
              explanation: 'Preference mismatch: the vacancy is onsite.',
            },
            {
              category: 'COMMUTE',
              state: 'UNKNOWN',
              source: 'PROFILE',
              confirmedProfileFact: 'Maximum commute recorded as 45 minutes',
              explanation: 'No journey-time information is available.',
            },
          ],
          summary: { confirmed: 0, conflicts: 1, unknown: 1, notApplicable: 0 },
          updatableCategories: ['COMMUTE'],
          disclaimer: 'This comparison is not legal or immigration advice.',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: /practical compatibility/i })).toBeInTheDocument();
    expect(screen.getByText(/separately from your cv match score/i)).toBeInTheDocument();
    expect(screen.getByText('Preference mismatch')).toBeInTheDocument();
    expect(screen.getByText('Not verified')).toBeInTheDocument();
    expect(screen.queryByText(/mandatory ineligibility/i)).not.toBeInTheDocument();
  });
});
