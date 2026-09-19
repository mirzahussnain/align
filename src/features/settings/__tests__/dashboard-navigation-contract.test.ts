import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('settings dashboard navigation contract', () => {
  it('renders settings inside the shared persistent dashboard route shell', () => {
    const layout = source('src/app/(settings)/dashboard/settings/layout.tsx');

    expect(layout).toContain("@/features/dashboard/components/DashboardRouteShell");
    expect(layout).toContain('listProfiles(session.user.id)');
    expect(layout).toContain('getEntitlementSnapshot(session.user.id)');
    expect(layout).toContain('<DashboardRouteShell');
  });

  it('removes billing from the dashboard tab model and sidebar', () => {
    const sidebar = source('src/features/dashboard/components/Sidebar.tsx');
    const store = source('src/shared/stores/dashboard-store.ts');
    const shell = source('src/features/dashboard/components/DashboardShell.tsx');

    expect(sidebar).not.toContain('Plan & Billing');
    expect(sidebar).not.toContain('tab: "billing"');
    expect(store).not.toContain("| 'billing'");
    expect(shell).not.toContain("tab === 'billing'");
  });

  it('redirects the legacy billing tab and no longer loads billing for the dashboard page', () => {
    const page = source('src/app/(dashboard)/dashboard/page.tsx');

    expect(page).toContain("if (requestedTab === 'billing') redirect('/dashboard/settings/billing');");
    expect(page).not.toContain('resolveBillingAccess');
    expect(page).not.toContain('getStorageUsage');
  });

  it('uses the settings billing route for internal links and portal returns', () => {
    const files = [
      'src/shared/billing/portal.ts',
      'src/features/onboarding/components/OnboardingJourney.tsx',
      'src/features/onboarding/components/ImportCvFlow.tsx',
      'src/features/job-board/components/stepper/Step3AnalysisOrUpgrade.tsx',
      'src/app/(dashboard)/dashboard/billing/success/page.tsx',
      'src/app/(dashboard)/dashboard/billing/cancelled/page.tsx',
    ];

    for (const file of files) {
      const contents = source(file);
      expect(contents, file).not.toContain('/dashboard?tab=' + 'billing');
      expect(contents, file).toContain('/dashboard/settings/billing');
    }
  });
});
