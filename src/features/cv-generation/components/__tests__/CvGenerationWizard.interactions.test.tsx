// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CvGenerationWizard from '../CvGenerationWizard';
import { emptyCandidateEvidence } from '@/shared/cv-generation/merge-evidence';
import type { ProposedCvPlan, SemanticGapGroup } from '@/shared/cv-generation/types';

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

  it('preserves template, exclusions, and section order across Review navigation and approval', async () => {
    const plan: ProposedCvPlan = {
      schemaVersion: 1, sourceMode: 'CAREER_PROFILE', atsStrategy: 'STANDARD', targetStrategy: 'PROFILE_ONLY',
      sectionOrder: ['PROFILE', 'SKILLS', 'PROJECTS'], density: 'BALANCED', targetLength: 'ONE_TO_TWO_PAGES',
      includedEvidenceIds: [], optionalEvidenceIds: ['optional-1'], omittedEvidence: [],
      professionalLinkIds: [], projectLinkIds: [], coveredRequirementIds: [], unresolvedRequirementIds: [],
    };
    const evidence = emptyCandidateEvidence();
    evidence.evidenceById['optional-1'] = {
      id: 'optional-1', kind: 'OTHER', field: 'detail', canonicalText: 'Optional conference talk',
      provenance: 'CAREER_PROFILE', preservationTier: 3, requirementIds: [], sourceRefs: [],
    };
    const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    }));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith('/api/cv-generations')) return response({ generationId: 'generation-2', gaps: [], evidence, remaining: 0 }, 201);
      if (url.endsWith('/plan')) return response({ plan });
      if (url.endsWith('/approve')) return response({ plan });
      if (url.endsWith('/generate')) return Promise.resolve(new Response(new Blob(['docx'])));
      throw new Error(`Unhandled request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<CvGenerationWizard isOpen onClose={vi.fn()} profileComplete activeProfileId="profile-1" />);

    await user.click(screen.getByRole('button', { name: /start reconciliation/i }));
    await user.click(await screen.findByRole('button', { name: 'Review CV plan' }));
    await user.click(screen.getByRole('checkbox', { name: /Optional conference talk/i }));
    await user.click(screen.getByRole('button', { name: 'Move Selected Projects up' }));
    await user.click(screen.getByRole('button', { name: 'Choose template' }));
    await user.click(screen.getByRole('button', { name: /Select Project-Focused template/i }));
    expect(screen.getByRole('button', { name: /Select Project-Focused template/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('checkbox', { name: /Optional conference talk/i })).not.toBeChecked();
    expect(within(screen.getByRole('list', { name: 'CV section order' })).getAllByRole('listitem')[1]).toHaveTextContent('Selected Projects');
    await user.click(screen.getByRole('button', { name: 'Choose template' }));
    expect(screen.getByRole('button', { name: /Select Project-Focused template/i })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Approve plan and generate' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/approve'))).toBe(true));
    const approval = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/approve'));
    expect(JSON.parse(String((approval?.[1] as RequestInit).body))).toEqual({
      template: 'technical_precision', excludedOptionalEvidenceIds: ['optional-1'],
      sectionOrder: ['PROFILE', 'PROJECTS', 'SKILLS'],
    });
  });
});
