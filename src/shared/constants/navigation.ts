// Navigation configuration

export const NAV_LINKS = [
  {
    label: 'AI Analysis',
    href: '/analyze',
    icon: 'FileSearch',
    description: 'Upload and analyze your CV',
  },
  {
    label: 'Job Board',
    href: '/jobs',
    icon: 'Briefcase',
    description: 'Search UK tech jobs',
  },
  {
    label: 'Immigration Hub',
    href: '/immigration',
    icon: 'Shield',
    description: 'Visa sponsors & immigration rules',
  },
  {
    label: 'Tech Trends',
    href: '/trends',
    icon: 'TrendingUp',
    description: 'UK tech market intelligence',
  },
] as const;

export const EXTERNAL_LINKS = {
  linkedin: 'https://www.linkedin.com/jobs/search/?keywords=',
  indeed: 'https://uk.indeed.com/jobs?q=',
  govFindJob: 'https://findajob.dwp.gov.uk/search?cat=&loc=&q=',
  ktpJobs: 'https://iuk-ktp.org.uk/jobs/',
  jobsAcUk: 'https://www.jobs.ac.uk/search/?keywords=',
  govSponsorList: 'https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers',
} as const;
