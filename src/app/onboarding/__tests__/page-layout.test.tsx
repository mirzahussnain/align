// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'user-1', name: 'Ada', email: 'ada@example.com' } })),
  shouldOnboard: vi.fn(async () => true),
  getOnboardingState: vi.fn(async () => ({
    selectedProfileId: null,
    importSessionId: null,
    extractionId: null,
  })),
  listProfiles: vi.fn(async () => []),
  loadProfileData: vi.fn(async () => ({
    personal: {
      fullName: '',
      targetRoleTitle: '',
      label: 'Default',
      targetOccupation: '',
      targetSeniority: '',
      tagline: '',
      country: '',
      city: '',
      visaStatus: '',
      visaExpiry: '',
    },
    practicalPreferences: {
      relocationPreference: null,
      maxCommuteMinutes: null,
      preferredWorkStyles: [],
    },
  })),
  checkCapability: vi.fn(async () => ({ allowed: true })),
  getUserPlan: vi.fn(async () => 'FREE'),
  listStoredCvs: vi.fn(async () => []),
}));

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/shared/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/shared/lib/prisma', () => ({ prisma: { experience: { count: vi.fn() } } }));
vi.mock('@/features/dashboard/data/load-profile', () => ({
  loadProfileData: mocks.loadProfileData,
  listProfiles: mocks.listProfiles,
}));
vi.mock('@/features/onboarding/components/OnboardingJourney', () => ({
  OnboardingJourney: () => <div>Onboarding journey</div>,
}));
vi.mock('@/shared/services/onboarding', () => ({
  getOnboardingState: mocks.getOnboardingState,
  shouldOnboard: mocks.shouldOnboard,
}));
vi.mock('@/shared/services/cv-import', () => ({ loadImportSession: vi.fn() }));
vi.mock('@/shared/services/stored-cv', () => ({
  loadOwnedExtraction: vi.fn(),
  listStoredCvs: mocks.listStoredCvs,
}));
vi.mock('@/shared/entitlements/server', () => ({
  checkCapability: mocks.checkCapability,
  getUserPlan: mocks.getUserPlan,
}));
vi.mock('@/shared/lib/entitlements', () => ({
  entitlementsFor: vi.fn(() => ({ sourceRetentionDays: 180 })),
}));

import OnboardingPage from '../page';

describe('onboarding route layout', () => {
  it('bounds the document to the dynamic viewport so only the task pane scrolls', async () => {
    const { container } = render(await OnboardingPage());
    const main = container.querySelector('main');
    const classes = main?.className.split(/\s+/) ?? [];

    expect(classes).toContain('h-[100dvh]');
    expect(classes).toContain('overflow-hidden');
    expect(classes).not.toContain('min-h-screen');
  });
});
