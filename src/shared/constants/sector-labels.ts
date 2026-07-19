import type { Sector } from './sector-keywords';

/** Single source of truth for user-facing sector names. */
export const SECTOR_LABELS: Record<Sector, string> = {
  tech: 'Technology',
  healthcare_nhs: 'Healthcare / NHS',
  warehouse_logistics: 'Warehouse & Logistics',
  retail: 'Retail',
  admin_office: 'Admin & Office',
  law: 'Law',
  engineering: 'Engineering',
  general: 'General',
};
