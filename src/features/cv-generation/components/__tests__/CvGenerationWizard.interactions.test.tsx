// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvGenerationWizard from '../CvGenerationWizard';
import { emptyCandidateEvidence } from '@/shared/cv-generation/merge-evidence';
import type { SemanticGapGroup } from '@/shared/cv-generation/types';

const gaps: SemanticGapGroup[] = [
  { id: 'g-dotnet', label: 'C# / .NET experience', requirementIds: ['r-dotnet'], importance: 'MANDATORY', category: 'SKILL', presentationGroup: 'CORE_EVIDENCE' },
  { id: 'g-api', label: 'API development & integration', requirementIds: ['r-api-1', 'r-api-2'], importance: 'MANDATORY', category: 'DUTY', presentationGroup: 'SUPPORTING_EVIDENCE' },
  { id: 'g-location', label: 'Work in person in Haverfordwest', requirementIds: ['r-location'], importance: 'MANDATORY', category: 'AVAILABILITY', presentationGroup: 'CONFIRMATION' },
  { id: 'g-umbraco', label: 'Umbraco CMS', requirementIds: ['r-umbraco'], importance: 'DESIRABLE', category: 'TOOL', presentationGroup: 'DESIRABLE_EXTRAS' },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CV generation evidence reconciliation grouping', () => {
  it('keeps every canonical requirement id in its presentation section', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      generationId: 'generation-1', gaps, evidence: emptyCandidateEvidence(), remaining: 5,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } })));
    const user = userEvent.setup();
    render(<CvGenerationWizard isOpen onClose={vi.fn()} profileComplete activeProfileId="profile-1" />);
    await user.click(screen.getByRole('button', { name: /start reconciliation/i }));

    expect(await screen.findByRole('heading', { name: 'Core technical and experience evidence' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Supporting capability evidence' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Confirmation and eligibility' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Desirable extras' })).toBeVisible();
    expect(screen.getByTestId('gap-g-api')).toHaveTextContent('Covers 2 linked requirements');
    expect(screen.getByTestId('gap-g-api')).toHaveAttribute('data-requirement-ids', 'r-api-1,r-api-2');
    expect(screen.getByText('5 material gaps')).toBeVisible();
  });
});
