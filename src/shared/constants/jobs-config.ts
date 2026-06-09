import { Globe, Building2, CheckCircle, HelpCircle, XCircle } from 'lucide-react';
import type { SponsorStatus } from '@/shared/types/job';

export const SOURCES = [
  { id: 'all', label: 'All Sources', icon: Globe },
  { id: 'adzuna', label: 'Adzuna', icon: Building2 },
  { id: 'reed', label: 'Reed', icon: Building2 },
  { id: 'jooble', label: 'Jooble', icon: Building2 },
] as const;

export const SPONSOR_CONFIG: Record<SponsorStatus, { icon: any; label: string; className: string }> = {
  'confirmed-sponsor': { 
    icon: CheckCircle, 
    label: 'Visa Sponsorship', 
    className: 'text-success bg-success/10 border-success/20' 
  },
  'likely-sponsor': { 
    icon: CheckCircle, 
    label: 'Likely Sponsor', 
    className: 'text-info bg-info/10 border-info/20' 
  },
  'sponsorship-unknown': { 
    icon: HelpCircle, 
    label: 'Sponsorship Unknown', 
    className: 'text-warning bg-warning/8 border-warning/15' 
  },
  'no-sponsorship': { 
    icon: XCircle, 
    label: 'No Sponsorship', 
    className: 'text-error bg-error/10 border-error/20' 
  },
};

export const SALARY_OPTIONS = [
  { label: 'Any Salary', value: '' },
  { label: '£30,000+', value: '30000' },
  { label: '£45,000+', value: '45000' },
  { label: '£60,000+', value: '60000' },
  { label: '£80,000+', value: '80000' },
  { label: '£100,000+', value: '100000' },
];

export const TECH_FILTER_OPTIONS = [
  { label: 'All Stacks', value: 'all' },
  { label: 'React', value: 'React' },
  { label: 'Next.js', value: 'Next.js' },
  { label: 'Node.js', value: 'Node.js' },
  { label: 'Python', value: 'Python' },
  { label: 'Java', value: 'Java' },
  { label: 'TypeScript', value: 'TypeScript' },
  { label: 'DevOps / AWS', value: 'DevOps' },
];
