// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CapabilityDecision } from '@/shared/entitlements/registry';
import { ImportReviewStep } from '../ImportReviewStep';
import type { ImportCandidate, ImportSession } from '../../api';

/**
 * The review screen's personal-details group.
 *
 * What is being protected: a phone shown as its two stored parts rather than one
 * international string, an identity value that is never swept into a bulk
 * confirmation, and a visible way to add a detail the CV did not contain without
 * starting onboarding again.
 */

afterEach(cleanup);

const confirmImport = vi.fn();
const addIdentityDetail = vi.fn();

vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    onboardingApi: {
      ...actual.onboardingApi,
      confirmImport: (...args: unknown[]) => confirmImport(...args),
      addIdentityDetail: (...args: unknown[]) => addIdentityDetail(...args),
    },
  };
});

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    id: 'c1',
    entityType: 'IDENTITY_UPDATE',
    reviewStatus: 'PROPOSED',
    conflictCode: null,
    structuredData: {},
    sourceExcerpt: 'From the CV',
    confidence: 0.9,
    bulkConfirmable: false,
    createdEntityId: null,
    ...overrides,
  };
}

function session(candidates: ImportCandidate[]): ImportSession {
  return {
    id: 's1',
    storedCvId: 'cv1',
    extractionId: 'e1',
    profileId: 'p1',
    status: 'REVIEWING',
    reconciliationStatus: 'not_requested',
    candidates,
    summary: [],
  };
}

function decision(): CapabilityDecision {
  return {
    capability: 'profile_evidence_storage',
    plan: 'FREE',
    mode: 'quota',
    allowed: true,
    limit: 25,
    used: 0,
    remaining: 25,
    period: 'lifetime',
    reason: 'quota_available',
  };
}

function renderReview(candidates: ImportCandidate[]) {
  return render(
    <ImportReviewStep
      stageIndex={5}
      totalStages={9}
      session={session(candidates)}
      evidenceCapacity={decision()}
      reconciliationOffered={false}
      onDone={vi.fn()}
      onBack={vi.fn()}
    />
  );
}

const PHONE = candidate({
  id: 'phone',
  structuredData: {
    field: 'phone',
    phoneDialCode: '+44',
    phoneNumber: '7737853800',
    phoneCountry: 'GB',
    rawValue: '+44 7737-853800',
  },
  sourceExcerpt: 'Phone: +44 7737-853800',
});

const LINKEDIN = candidate({
  id: 'linkedin',
  structuredData: { field: 'linkedin', linkedin: 'https://linkedin.com/in/amara-okafor' },
  sourceExcerpt: 'LinkedIn: https://linkedin.com/in/amara-okafor',
});

describe('personal and professional details group', () => {
  it('shows the dial code and the national number as separate parts', () => {
    renderReview([PHONE]);
    const group = screen.getByRole('region', { name: /personal and professional details/i });
    // The stored contract, read back to the user. The defect being guarded
    // against is the whole international string presented as the number.
    expect(within(group).getByText('+44 7737853800')).toBeTruthy();
    expect(within(group).getByText('Phone')).toBeTruthy();
  });

  it('gives each detail its own confirm and ignore', async () => {
    renderReview([PHONE, LINKEDIN]);
    const group = screen.getByRole('region', { name: /personal and professional details/i });
    expect(within(group).getAllByRole('button', { name: /^confirm$/i })).toHaveLength(2);
    expect(within(group).getAllByRole('button', { name: /^ignore$/i })).toHaveLength(2);

    await userEvent.click(within(group).getAllByRole('button', { name: /^confirm$/i })[1]);
    expect(confirmImport).toHaveBeenCalledWith(
      's1',
      expect.arrayContaining([expect.objectContaining({ candidateId: 'linkedin', action: 'confirm' })])
    );
  });

  it('keeps identity out of "add all safe items"', () => {
    const skill = candidate({
      id: 'skill',
      entityType: 'SKILL',
      structuredData: { name: 'Venepuncture' },
      bulkConfirmable: true,
    });
    renderReview([PHONE, LINKEDIN, skill]);
    // One skill is ready to add; the two identity details are not part of it.
    expect(screen.getByText(/1 detail ready to add/i)).toBeTruthy();
  });

  it('says plainly when an existing value would be replaced', () => {
    renderReview([
      candidate({
        id: 'conflict',
        reviewStatus: 'CONFLICT',
        conflictCode: 'IDENTITY_VALUE_DIFFERS',
        structuredData: { field: 'github', github: 'https://github.com/new-handle' },
      }),
    ]);
    expect(screen.getByText(/your profile already has a different value/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /use the cv value/i })).toBeTruthy();
  });

  it('asks for a dialling code rather than storing a half-read phone', async () => {
    renderReview([
      candidate({
        id: 'ambiguous',
        reviewStatus: 'CONFLICT',
        conflictCode: 'AMBIGUOUS_VALUE',
        structuredData: { field: 'phone', phoneNumber: '07737853800', rawValue: '07737 853800' },
      }),
    ]);
    const field = screen.getByLabelText(/country dialling code/i);
    await userEvent.type(field, '+44');
    await userEvent.click(screen.getByRole('button', { name: /use the cv value/i }));
    expect(confirmImport).toHaveBeenCalledWith(
      's1',
      expect.arrayContaining([
        expect.objectContaining({ edited: expect.objectContaining({ phoneDialCode: '+44' }) }),
      ])
    );
  });

  it('shows a professional summary as its own reviewable item', () => {
    renderReview([
      candidate({
        id: 'summary',
        entityType: 'PROFILE_SUMMARY_UPDATE',
        structuredData: { professionalSummary: 'Registered nurse with eight years of experience.' },
        sourceExcerpt: 'Registered nurse with eight years of experience.',
      }),
    ]);
    const group = screen.getByRole('region', { name: /personal and professional details/i });
    expect(within(group).getByText('Professional summary')).toBeTruthy();
    // Twice over: the value that would be saved, and the verbatim quote from the
    // CV underneath it. Both are deliberate — the user is confirming a change to
    // their own words and needs to see what the document actually said.
    expect(within(group).getAllByText(/registered nurse with eight years/i)).toHaveLength(2);
  });
});

describe('details the CV did not contain', () => {
  it('offers to add each missing detail without restarting onboarding', () => {
    renderReview([PHONE]);
    expect(screen.getByRole('button', { name: /add linkedin/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /add github/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /add website/i })).toBeTruthy();
    // Already detected, so not offered again.
    expect(screen.queryByRole('button', { name: /add phone/i })).toBeNull();
  });

  it('says when no professional summary was detected', () => {
    renderReview([PHONE]);
    expect(screen.getByText(/no professional summary detected/i)).toBeTruthy();
  });

  it('adds a typed detail as a proposal rather than saving it', async () => {
    addIdentityDetail.mockResolvedValue({ session: session([PHONE]), evidenceCapacity: decision() });
    renderReview([PHONE]);

    await userEvent.click(screen.getByRole('button', { name: /add linkedin/i }));
    await userEvent.type(screen.getByLabelText(/^linkedin$/i), 'linkedin.com/in/amara-okafor');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));

    expect(addIdentityDetail).toHaveBeenCalledWith('s1', 'linkedin', 'linkedin.com/in/amara-okafor');
    expect(await screen.findByText(/added below for you to confirm/i)).toBeTruthy();
  });
});
