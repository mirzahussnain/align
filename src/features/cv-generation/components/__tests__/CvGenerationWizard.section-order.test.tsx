// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvGenerationWizard from '../CvGenerationWizard';
import { emptyCandidateEvidence } from '@/shared/cv-generation/merge-evidence';
import type { ProposedCvPlan } from '@/shared/cv-generation/types';

const plan: ProposedCvPlan = {
  schemaVersion: 1, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', targetStrategy: 'JUNIOR_PROJECT_HEAVY',
  sectionOrder: ['PROFILE', 'SKILLS', 'PROJECTS'], density: 'BALANCED', targetLength: 'ONE_PAGE',
  includedEvidenceIds: [], optionalEvidenceIds: [], omittedEvidence: [], professionalLinkIds: [], projectLinkIds: [],
  coveredRequirementIds: [], unresolvedRequirementIds: [],
};

const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
}));

function labels() {
  return within(screen.getByRole('list', { name: 'CV section order' })).getAllByRole('listitem').map((item) => item.textContent);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Review CV Plan section ordering', () => {
  it('supports move controls, drag/drop, reset, and submits only the final local order', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith('/api/cv-generations')) return json({ generationId: 'g1', gaps: [], evidence: emptyCandidateEvidence(), remaining: 0 }, 201);
      if (url.endsWith('/plan')) return json({ plan });
      if (url.endsWith('/approve')) return json({ plan: { ...plan, approvedAt: new Date(0).toISOString() } });
      if (url.endsWith('/generate')) return Promise.resolve(new Response(new Blob(['docx'])));
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CvGenerationWizard isOpen onClose={vi.fn()} profileComplete activeProfileId="profile-1" />);

    await user.click(screen.getByRole('button', { name: /start reconciliation/i }));
    await user.click(await screen.findByRole('button', { name: 'Review CV plan' }));
    await screen.findByRole('heading', { name: 'Review the CV plan' });

    expect(labels()).toEqual(['Professional Summary', 'Technical Skills', 'Selected Projects']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Move Professional Summary down' }));
    expect(labels()[0]).toContain('Technical Skills');
    await user.click(screen.getByRole('button', { name: 'Move Professional Summary up' }));
    expect(labels()[0]).toContain('Professional Summary');

    const project = screen.getByRole('listitem', { name: /Selected Projects/ });
    const profile = screen.getByRole('listitem', { name: /Professional Summary/ });
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => 'PROJECTS'), effectAllowed: 'move', dropEffect: 'move' };
    fireEvent.dragStart(project, { dataTransfer });
    fireEvent.dragOver(profile, { dataTransfer });
    fireEvent.drop(profile, { dataTransfer });
    expect(labels()[0]).toContain('Selected Projects');

    await user.click(screen.getByRole('button', { name: 'Reset to recommended order' }));
    expect(labels()[0]).toContain('Professional Summary');
    expect(labels()[2]).toContain('Selected Projects');
    await user.click(screen.getByRole('button', { name: 'Move Selected Projects up' }));
    expect(labels()[1]).toContain('Selected Projects');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Choose template' }));
    await user.click(screen.getByRole('button', { name: 'Approve plan and generate' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/approve'))).toBe(true));
    const approval = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/approve'));
    expect(JSON.parse(String((approval?.[1] as RequestInit).body))).toEqual({
      template: 'architect', excludedOptionalEvidenceIds: [], sectionOrder: ['PROFILE', 'PROJECTS', 'SKILLS'],
    });
    expect(plan.sectionOrder).toEqual(['PROFILE', 'SKILLS', 'PROJECTS']);
  });
});
