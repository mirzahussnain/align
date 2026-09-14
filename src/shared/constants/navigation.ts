// Navigation configuration

/**
 * Top bar for the public site. The actual tools now live behind auth in the
 * dashboard, so this nav describes and sells the product — it deliberately does
 * not link straight into functionality the visitor can't use yet. Hash targets
 * are absolute (`/#…`) so they still resolve from a non-home page.
 */
export const MARKETING_NAV_LINKS = [
  {
    label: 'How it Works',
    href: '/#how-it-works',
    description: 'From upload to a UK-ready CV in three steps',
  },
  {
    label: 'Features',
    href: '/#features',
    description: 'ATS scoring, job matching, and sponsor intelligence',
  },
  {
    label: 'Pricing',
    href: '/#pricing',
    description: 'Plans for every stage of the search',
  },
  {
    label: 'Analyze',
    href: '/analyze',
    description: 'Get clear, practical feedback on your CV',
  },
] as const;

export const MARKETING_NAV_RESOURCES = [
  {
    label: 'Immigration',
    href: '/immigration',
    description: 'Visa sponsors and immigration guidance',
  },
  {
    label: 'Insights',
    href: '/trends',
    description: 'UK tech market salary and demand data',
  },
] as const;

/** Destination links for the footer — the real product surfaces. */
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
