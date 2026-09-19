'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EntitlementSnapshot } from '@/shared/entitlements/server';
import {
  ENTITLEMENT_REQUIRED_EVENT,
  ENTITLEMENTS_REFRESH_EVENT,
  isProductCapability,
  type CapabilityDecision,
  type ProductCapability,
} from '@/shared/entitlements/registry';
import {
  PricingDetailsDialog,
  type PricingDetailsContext,
} from '@/shared/components/billing/PricingDetailsDialog';

export interface UpgradeModalContext {
  capability: ProductCapability;
  decision: CapabilityDecision;
  source: 'analysis' | 'report' | 'generation' | 'evidence' | 'profile' | 'advanced_tool' | 'other';
}

interface EntitlementContextValue {
  snapshot: EntitlementSnapshot;
  decisionFor(capability: ProductCapability): CapabilityDecision;
  /** Open the shared pricing details surface with the capability that prompted it. */
  openUpgrade(context: UpgradeModalContext): void;
  /** Use for "See what Pro includes" links that are not tied to a blocked action. */
  openPricingDetails(context?: PricingDetailsContext): void;
  refresh(): Promise<void>;
}

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ initialSnapshot, children }: { initialSnapshot: EntitlementSnapshot; children: React.ReactNode }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pricingDetails, setPricingDetails] = useState<PricingDetailsContext | null>(null);
  const refresh = useCallback(async () => {
    const response = await fetch('/api/entitlements', { cache: 'no-store' });
    if (response.ok) setSnapshot((await response.json()) as EntitlementSnapshot);
  }, []);

  useEffect(() => {
    const required = (event: Event) => {
      const detail = (event as CustomEvent<{ capability?: unknown; source?: UpgradeModalContext['source'] }>).detail;
      if (!isProductCapability(detail?.capability)) return;
      setPricingDetails({
        capability: detail.capability,
        decision: snapshot.capabilities[detail.capability],
      });
    };
    const refreshRequested = () => void refresh();
    window.addEventListener(ENTITLEMENT_REQUIRED_EVENT, required);
    window.addEventListener(ENTITLEMENTS_REFRESH_EVENT, refreshRequested);
    return () => {
      window.removeEventListener(ENTITLEMENT_REQUIRED_EVENT, required);
      window.removeEventListener(ENTITLEMENTS_REFRESH_EVENT, refreshRequested);
    };
  }, [snapshot, refresh]);

  const value = useMemo<EntitlementContextValue>(() => ({
    snapshot,
    decisionFor: (capability) => snapshot.capabilities[capability],
    openUpgrade: (context) => setPricingDetails({ capability: context.capability, decision: context.decision }),
    openPricingDetails: (context = {}) => setPricingDetails(context),
    refresh,
  }), [snapshot, refresh]);

  return (
    <EntitlementContext.Provider value={value}>
      {children}
      <PricingDetailsDialog
        open={pricingDetails !== null}
        context={pricingDetails ?? undefined}
        onClose={() => setPricingDetails(null)}
        onViewPlans={() => router.push('/dashboard/settings/billing')}
      />
    </EntitlementContext.Provider>
  );
}

const DEFAULT_FALLBACK_CONTEXT: EntitlementContextValue = {
  snapshot: {
    plan: 'FREE',
    capabilities: {} as EntitlementSnapshot['capabilities'],
  },
  decisionFor: (capability) => ({
    capability,
    allowed: true,
    plan: 'FREE',
    mode: 'enabled',
    reason: 'allowed',
  }),
  openUpgrade: () => {},
  openPricingDetails: () => {},
  refresh: async () => {},
};

export function useEntitlements(): EntitlementContextValue {
  const value = useContext(EntitlementContext);
  return value ?? DEFAULT_FALLBACK_CONTEXT;
}

export function useOptionalEntitlements(): EntitlementContextValue | null {
  return useContext(EntitlementContext);
}
