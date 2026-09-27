import { Briefcase, GraduationCap, ShieldCheck, Rocket } from 'lucide-react';

export const VISAS = [
  {
    title: 'Skilled Worker Visa',
    icon: Briefcase,
    color: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/20',
    officialUrl: 'https://www.gov.uk/skilled-worker-visa',
    overview: [
      'A sponsored work route for eligible jobs with an approved UK employer.',
      'A sponsor licence entry is employer-level evidence; it does not confirm that a particular vacancy will be sponsored.',
      'The route may lead to settlement if the applicant continues to meet the rules in force.'
    ],
    requirements: [
      'An eligible job offer from a Home Office approved employer',
      'A valid Certificate of Sponsorship reference assigned for the role',
      'The applicable salary threshold and occupation going rate; exceptions and transitional rules can differ',
      'The English-language and other eligibility requirements that apply at the date of application'
    ],
    process: [
      '1. Check the job, occupation code, salary and employer against current GOV.UK rules',
      '2. Receive a Certificate of Sponsorship from the employer',
      '3. Submit the correct online application within the stated CoS window',
      '4. Prove identity and provide the documents requested for your circumstances',
      '5. Pay the current fees and healthcare surcharge where applicable'
    ],
    roadmap: [
      'Permission may be granted for the sponsored employment period, within route limits',
      'Extensions or changes of employment require a further eligible application',
      'You may be eligible to apply for ILR after 5 continuous years, subject to the residence, sponsor, salary, English-language and other settlement rules',
      'Eligible partners and children may be able to apply as dependants'
    ]
  },
  {
    title: 'Graduate Route',
    icon: GraduationCap,
    color: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/20',
    officialUrl: 'https://www.gov.uk/graduate-visa',
    overview: [
      'An unsponsored post-study route for people who completed an eligible UK course.',
      'It allows work in most jobs and does not require a job offer.',
      'It cannot be extended, though an eligible holder may be able to switch to another route.'
    ],
    requirements: [
      'Be in the UK with valid Student or eligible Tier 4 permission when applying',
      'Have successfully completed an eligible course in the UK for the required study period',
      'The education provider must have notified the Home Office of successful completion',
      'Apply before the current Student permission expires'
    ],
    process: [
      '1. Confirm that the education provider has reported course completion',
      '2. Check the course, study-period and current-permission requirements',
      '3. Apply online from inside the UK before Student permission expires',
      '4. Prove identity and provide any documents requested',
      '5. Pay the current application fee and healthcare surcharge'
    ],
    roadmap: [
      'For non-doctoral graduates, permission is 2 years for applications made by 31 December 2026 and 18 months for applications from 1 January 2027',
      'Doctoral graduates receive 3 years under the current published rules',
      'The Graduate route is not itself a direct route to settlement',
      'Time may count toward long-residence eligibility, subject to the rules and the applicant’s circumstances'
    ]
  },
  {
    title: 'Global Talent Visa',
    icon: ShieldCheck,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/20',
    officialUrl: 'https://www.gov.uk/global-talent',
    overview: [
      'An unsponsored route for eligible leaders or potential leaders in specified fields.',
      'A job offer is not normally required, and permitted work can include employment or self-employment.',
      'Settlement timing depends on the endorsement or qualifying award and all other rules.'
    ],
    requirements: [
      'Qualify in academia or research, arts and culture, or digital technology under the published criteria',
      'Usually obtain endorsement from the relevant approved body',
      'Some holders of listed prestigious prizes can apply without endorsement',
      'Meet the suitability and permission requirements for the route'
    ],
    process: [
      '1. Identify the relevant field, endorsing body and eligibility criteria',
      '2. Apply for endorsement unless an eligible listed prize applies',
      '3. Prepare evidence in the format required by that endorsing body',
      '4. Apply for immigration permission within the permitted endorsement window',
      '5. Prove identity and provide the documents requested'
    ],
    roadmap: [
      'Permission can be requested for a period within the route’s published limits',
      'Further permission may be available if the route requirements remain satisfied',
      'Depending on the qualifying endorsement or award, you may be eligible for ILR after 3 or 5 years, subject to all settlement rules',
      'Absence, earnings and continuing-field requirements can affect settlement eligibility'
    ]
  },
  {
    title: 'Innovator Founder Visa',
    icon: Rocket,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    officialUrl: 'https://www.gov.uk/innovator-founder-visa',
    overview: [
      'A route for an eligible founder establishing and running an innovative business in the UK.',
      'The business idea must be assessed as new, innovative, viable and scalable.',
      'An approved endorsing body must support the application.'
    ],
    requirements: [
      'An endorsement letter for the applicant and business idea',
      'Evidence that the business meets the published innovation, viability and scalability criteria',
      'The applicable English-language requirement',
      'The maintenance-funds and other eligibility requirements that apply to the applicant'
    ],
    process: [
      '1. Develop the business proposal and check it against current endorsement criteria',
      '2. Obtain an endorsement from an approved body',
      '3. Apply online within the endorsement letter’s validity window',
      '4. Prove identity and provide the required documents',
      '5. Maintain the required contact with the endorsing body during the permission period'
    ],
    roadmap: [
      'Initial permission is granted for up to 3 years under the current rules',
      'A further 3-year application may be available with a new endorsement',
      'You may be eligible for ILR after 3 years, subject to a new endorsement, continuous residence and the business-growth criteria',
      'Settlement is not automatic and requires a separate application meeting the rules in force'
    ]
  }
];

export const INDUSTRY_SECTORS = [
  { label: 'All Industries', value: 'all' },
  { label: 'Technology & Software', value: 'Technology & Software' },
  { label: 'Healthcare & Life Sciences', value: 'Healthcare & Life Sciences' },
  { label: 'Education & Research', value: 'Education & Research' },
  { label: 'Finance & Consulting', value: 'Finance & Consulting' },
  { label: 'Engineering & Manufacturing', value: 'Engineering & Manufacturing' },
  { label: 'Retail & Hospitality', value: 'Retail & Hospitality' },
  { label: 'Public Sector & Non-Profit', value: 'Public Sector & Non-Profit' },
  { label: 'General Business Services', value: 'General Business Services' },
];
