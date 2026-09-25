import type { JobProvider, JobRemoteType, ProviderSearchStatus } from './job';

export type MarketMixItem = { label: string; count: number; share: number };

export interface CareerMarketMetrics {
  sampledVacancyCount: number;
  salary: {
    disclosedCount: number;
    eligibleAnnualCount: number;
    disclosureRate: number;
    annualGbp?: { minimum: number; median: number; maximum: number };
  };
  contractTypeMix: MarketMixItem[];
  workStyleMix: Array<MarketMixItem & { label: JobRemoteType | 'NOT_STATED' }>;
  regions: MarketMixItem[];
  topEmployers: MarketMixItem[];
  sponsorshipEmployerContext: MarketMixItem[];
  currentVacancies: Array<{
    id: string;
    title: string;
    employer: string;
    location: string;
    provider: JobProvider;
    url: string;
    salaryText?: string;
  }>;
}

export interface CareerMarketSnapshotView {
  id: string;
  marketKey: string;
  roleQuery: string;
  locationQuery: string;
  normalizedRole: string;
  normalizedLocation: string;
  providerCoverage: Array<{
    provider: JobProvider;
    status: ProviderSearchStatus;
    sampled: number;
  }>;
  sampleSize: number;
  samplingStartedAt: string;
  samplingCompletedAt: string;
  generatedAt: string;
  expiresAt: string;
  calculationVersion: string;
  dataQuality: {
    salaryMissing: number;
    contractTypeMissing: number;
    workStyleUnknown: number;
    locationMissing: number;
    note: string;
  };
  metrics: CareerMarketMetrics;
}
