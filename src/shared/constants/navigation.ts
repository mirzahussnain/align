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
    description: 'From Career Profile to evidence-backed application',
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
    label: 'Jobs',
    href: '/jobs',
    description: 'Search current UK vacancies',
  },
  {
    label: 'UK Career Market',
    href: '/trends',
    description: 'Sampled vacancy and salary insights',
  },
  {
    label: 'Sponsorship & Visas',
    href: '/immigration',
    description: 'Qualified sponsorship and visa resources',
  },
] as const;

/** Destination links for the footer — the real product surfaces. */
export const NAV_LINKS = [
  {
    label: 'ATS Analysis',
    href: '/analyze',
    icon: 'FileSearch',
    description: 'Upload and analyze your CV',
  },
  {
    label: 'Jobs',
    href: '/jobs',
    icon: 'Briefcase',
    description: 'Search vacancies across UK role families',
  },
  {
    label: 'Sponsorship & Visas',
    href: '/immigration',
    icon: 'Shield',
    description: 'Visa sponsors & immigration rules',
  },
  {
    label: 'UK Career Market',
    href: '/trends',
    icon: 'TrendingUp',
    description: 'Sampled vacancy and salary insights',
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
