// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CvGenerationWizard from '../CvGenerationWizard';
import { emptyCandidateEvidence } from '@/shared/cv-generation/merge-evidence';
import type { SemanticGapGroup, UnifiedCandidateEvidence } from '@/shared/cv-generation/types';

const gaps: SemanticGapGroup[] = [
  { id: 'g-dotnet', label: 'C# / .NET experience', requirementIds: ['r-dotnet'], importance: 'MANDATORY', category: 'SKILL', presentationGroup: 'CORE_EVIDENCE' },
  { id: 'g-api', label: 'API development & integration', requirementIds: ['r-api-1', 'r-api-2'], importance: 'MANDATORY', category: 'DUTY', presentationGroup: 'SUPPORTING_EVIDENCE' },
  { id: 'g-location', label: 'Work in person in Haverfordwest', requirementIds: ['r-location'], importance: 'MANDATORY', category: 'AVAILABILITY', presentationGroup: 'CONFIRMATION' },
  { id: 'g-umbraco', label: 'Umbraco CMS', requirementIds: ['r-umbraco'], importance: 'DESIRABLE', category: 'TOOL', presentationGroup: 'DESIRABLE_EXTRAS' },
];

function candidateEvidence(): UnifiedCandidateEvidence {
  const value = emptyCandidateEvidence();
  value.projects.push({
    id: 'profile-project', sourceEntityId: 'project-1', label: 'CareTrack',
    details: { name: 'CareTrack', description: 'Patient coordination platform' }, evidenceIds: ['project-record'],
  });
  value.evidenceById['project-record'] = {
    id: 'project-record', kind: 'PROJECT', field: 'project', canonicalText: 'CareTrack', provenance: 'CAREER_PROFILE', preservationTier: 1, requirementIds: [],
    sourceRefs: [{ sourceType: 'CAREER_PROFILE', entityType: 'ProjectEntry', entityId: 'project-1', fieldPath: 'record' }],
  };
  return value;
}

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
}));

describe('progressive evidence reconciliation', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/cv-generations')) return response({ generationId: 'generation-1', gaps, evidence: candidateEvidence(), remaining: 5 }, 201);
      if (url.endsWith('/evidence')) return response({ generationId: 'generation-1', gaps: gaps.slice(2), evidence: candidateEvidence(), remaining: 2, resolvedRequirementIds: ['r-dotnet', 'r-api-1', 'r-api-2'] });
      if (url.endsWith('/confirmations')) return response({ gaps: gaps.filter((gap) => gap.id !== 'g-location'), remaining: 4 });
      throw new Error(`Unhandled request: ${url}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function openReconciliation() {
    const user = userEvent.setup();
    render(<CvGenerationWizard isOpen onClose={vi.fn()} profileComplete activeProfileId="profile-1" />);
    await user.click(screen.getByRole('button', { name: /start reconciliation/i }));
    await screen.findByRole('heading', { name: 'Evidence reconciliation' });
    return user;
  }

  async function reachEvidenceStage(user: ReturnType<typeof userEvent.setup>) {
    const card = screen.getByTestId('gap-g-dotnet');
    await user.click(within(card).getByRole('button', { name: /C# \/ \.NET experience/i }));
    await user.click(within(card).getByRole('radio', { name: 'Add evidence' }));
    await user.click(within(card).getByRole('button', { name: 'Project' }));
    await user.click(within(card).getByRole('button', { name: 'Next' }));
    await user.click(within(card).getByRole('radio', { name: /CareTrack/ }));
    await user.click(within(card).getByRole('button', { name: 'Next' }));
    return card;
  }

  it('uses the card header as the single accessible accordion trigger', async () => {
    const user = await openReconciliation();
    const dotnet = screen.getByTestId('gap-g-dotnet');
    const api = screen.getByTestId('gap-g-api');
    const dotnetTrigger = within(dotnet).getByRole('button', { name: /C# \/ \.NET experience/i });

    expect(screen.queryByRole('button', { name: /Add evidence for/i })).not.toBeInTheDocument();
    await user.click(dotnetTrigger);
    expect(dotnetTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(dotnet).getByRole('radio', { name: "I don't have this evidence" })).toBeVisible();
    expect(within(dotnet).getByRole('radio', { name: 'Add evidence' })).toBeVisible();
    expect(within(dotnet).queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(dotnetTrigger).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(api).getByRole('button', { name: /API development & integration/i }));
    expect(within(api).getByRole('region', { name: /Evidence decision for API development/i })).toBeVisible();
  });

  it('reveals one valid stage at a time with dynamic Back and Next controls', async () => {
    const user = await openReconciliation();
    const card = screen.getByTestId('gap-g-dotnet');
    await user.click(within(card).getByRole('button', { name: /C# \/ \.NET experience/i }));
    await user.click(within(card).getByRole('radio', { name: 'Add evidence' }));

    expect(within(card).getByRole('heading', { name: 'Choose an evidence source' })).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(within(card).queryByText(/CareTrack/)).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Project' }));
    await user.click(within(card).getByRole('button', { name: 'Next' }));
    expect(within(card).getByRole('heading', { name: 'Choose a project record' })).toBeVisible();
    expect(within(card).queryByRole('button', { name: 'Project' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Back' })).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('surfaces remaining related gaps and maps selected gaps to the same entity', async () => {
    const user = await openReconciliation();
    const card = await reachEvidenceStage(user);
    await user.type(within(card).getByLabelText(/How did you use C#/i), 'Built backend services with C# and .NET.');
    await user.click(within(card).getByRole('button', { name: 'Next' }));

    expect(within(card).getByRole('heading', { name: 'Related gaps' })).toBeVisible();
    expect(within(card).queryByText('API development & integration')).not.toBeInTheDocument();
    await user.click(within(card).getByRole('checkbox', { name: /This evidence also supports other requirements/i }));
    expect(within(card).getByRole('checkbox', { name: /API development & integration/i })).toBeVisible();
    expect(within(card).getByRole('checkbox', { name: /Umbraco CMS/i })).toBeVisible();
    expect(within(card).queryByRole('checkbox', { name: /C# \/ \.NET experience/i })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('checkbox', { name: /API development & integration/i }));
    await user.type(within(card).getByLabelText(/How did the same record support API development/i), 'Implemented typed REST endpoints.');
    await user.click(within(card).getByRole('button', { name: 'Next' }));
    expect(within(card).getByRole('heading', { name: 'Review and save' })).toBeVisible();
    expect(within(card).getByText('CareTrack — Patient coordination platform')).toBeVisible();

    await user.click(within(card).getByRole('button', { name: 'Save & reconcile' }));
    await waitFor(() => expect(screen.queryByTestId('gap-g-dotnet')).not.toBeInTheDocument());
    const evidenceCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/evidence'));
    const payload = JSON.parse(String((evidenceCall?.[1] as RequestInit).body));
    expect(payload.entity).toMatchObject({ mode: 'EXISTING', entityId: 'project-1' });
    expect(payload.evidenceItems).toEqual([
      expect.objectContaining({ text: 'Built backend services with C# and .NET.', requirementIds: ['r-dotnet'] }),
      expect.objectContaining({ text: 'Implemented typed REST endpoints.', requirementIds: ['r-api-1', 'r-api-2'] }),
    ]);
  });

  it('shows loading only on the evidence action that was submitted', async () => {
    const user = await openReconciliation();
    const card = await reachEvidenceStage(user);
    await user.type(within(card).getByLabelText(/How did you use C#/i), 'Built backend services with C# and .NET.');
    await user.click(within(card).getByRole('button', { name: 'Next' }));
    await user.click(within(card).getByRole('button', { name: 'Next' }));

    let resolveSave!: (value: Response) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/evidence')) return new Promise<Response>((resolve) => { resolveSave = resolve; });
      throw new Error(`Unexpected request: ${url}`);
    });
    const save = within(card).getByRole('button', { name: 'Save & reconcile' });
    await user.click(save);

    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review CV plan' })).not.toBeDisabled();
    resolveSave(await response({ generationId: 'generation-1', gaps: gaps.slice(2), evidence: candidateEvidence(), remaining: 2, resolvedRequirementIds: ['r-dotnet'] }));
    await waitFor(() => expect(screen.queryByTestId('gap-g-dotnet')).not.toBeInTheDocument());
  });

  it('keeps the unavailable decision reversible and visually subdued until confirmed', async () => {
    const user = await openReconciliation();
    const card = screen.getByTestId('gap-g-dotnet');
    const trigger = within(card).getByRole('button', { name: /C# \/ \.NET experience/i });
    await user.click(trigger);
    await user.click(within(card).getByRole('radio', { name: "I don't have this evidence" }));

    expect(card).toHaveClass('bg-bg-tertiary');
    expect(within(card).getByText('Marked as unavailable')).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(within(card).getByRole('radio', { name: 'Add evidence' }));
    expect(card).not.toHaveClass('bg-bg-tertiary');
    expect(within(card).getByRole('heading', { name: 'Choose an evidence source' })).toBeVisible();
  });

  it('keeps eligibility items on a simple confirmation path', async () => {
    const user = await openReconciliation();
    const card = screen.getByTestId('gap-g-location');
    await user.click(within(card).getByRole('button', { name: /Work in person in Haverfordwest/i }));

    expect(within(card).getByRole('button', { name: 'Yes' })).toBeVisible();
    expect(within(card).getByRole('button', { name: 'No' })).toBeVisible();
    expect(within(card).getByRole('button', { name: 'Not sure' })).toBeVisible();
    expect(within(card).queryByRole('radio', { name: 'Add evidence' })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(screen.queryByTestId('gap-g-location')).not.toBeInTheDocument());
  });
  it('renders completed top-level steps as checks without repeating numbers in labels', async () => {
    await openReconciliation();
    const progress = screen.getByRole('list', { name: 'CV generation progress' });

    expect(within(progress).getByLabelText('Source / Target complete')).toBeVisible();
    expect(within(progress).getByText('Evidence reconciliation')).toBeVisible();
    expect(progress).not.toHaveTextContent('1. Source / Target');
    expect(progress).not.toHaveTextContent('2. Evidence reconciliation');
  });
});
