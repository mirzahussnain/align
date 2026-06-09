import { Briefcase, GraduationCap, ShieldCheck, Rocket } from 'lucide-react';

export const VISAS = [
  {
    title: 'Skilled Worker Visa',
    icon: Briefcase,
    color: 'text-accent-purple',
    bg: 'bg-accent-purple/10',
    border: 'border-accent-purple/20',
    overview: [
      'The primary route for overseas professionals to work in the UK.',
      'Requires sponsorship from a Home Office licensed employer.',
      'Leads directly to permanent settlement (ILR).'
    ],
    requirements: [
      'Confirmed job offer from a licensed sponsor',
      'Certificate of Sponsorship (CoS) reference number',
      'Meet the general salary threshold (£38,700/year) or the going rate for the role',
      'Discounts ("New Entrant") available for recent graduates (£30,960 minimum)',
      'Meet English language requirements (CEFR Level B1)'
    ],
    process: [
      '1. Secure a job offer from an eligible UK employer',
      '2. Employer assigns a Certificate of Sponsorship (CoS)',
      '3. Submit online visa application (within 3 months of start date)',
      '4. Prove identity (via UK Immigration: ID Check app or biometric appointment)',
      '5. Pay application fees and Immigration Health Surcharge (IHS)',
      '6. Wait for decision (typically 3 weeks outside UK, 8 weeks inside)'
    ],
    roadmap: [
      'Initial visa can be granted for up to 5 years',
      'Can be extended indefinitely as long as you meet requirements',
      'Eligible to apply for Indefinite Leave to Remain (ILR) after 5 continuous years',
      'Partners and children can apply as dependents'
    ]
  },
  {
    title: 'Graduate Route',
    icon: GraduationCap,
    color: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/20',
    overview: [
      'Unsponsored route for international students to work post-graduation.',
      'Highly flexible: work in almost any job, switch employers freely.',
      'Designed as a bridge to the Skilled Worker route.'
    ],
    requirements: [
      'Currently hold a valid UK Student visa or Tier 4 visa',
      'Successfully completed an eligible UK degree (Bachelors, Masters, or PhD)',
      'University must have notified the Home Office that you successfully completed the course',
      'Must apply from INSIDE the UK'
    ],
    process: [
      '1. Wait for university confirmation of course completion',
      '2. Submit application online before current Student visa expires',
      '3. Prove identity using the UK Immigration: ID Check app',
      '4. Pay the application fee (£822) and IHS (£1,035 per year)',
      '5. Wait for decision (typically within 8 weeks)'
    ],
    roadmap: [
      'Valid for 2 years (3 years for PhD graduates)',
      'Cannot be extended. You can only hold a Graduate visa once',
      'Time spent does NOT count towards the 5-year route to settlement (ILR)',
      'Time spent DOES count towards the 10-year long residence route',
      'Most candidates switch to the Skilled Worker visa before expiry'
    ]
  },
  {
    title: 'Global Talent Visa',
    icon: ShieldCheck,
    color: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/20',
    overview: [
      'Prestigious unsponsored route for top talent globally.',
      'No job offer required. You can work as an employee, director, or be self-employed.',
      'Offers a fast-track to UK settlement.'
    ],
    requirements: [
      'Be a leader (Exceptional Talent) or potential leader (Exceptional Promise)',
      'Fields: Academia/Research, Arts/Culture, or Digital Technology',
      'Must receive an endorsement from an approved endorsing body (e.g. Tech Nation)',
      'Alternatively, hold an eligible prestigious international award (e.g. Nobel Prize)'
    ],
    process: [
      '1. Stage 1: Apply for endorsement (unless holding an eligible award)',
      '2. Gather extensive evidence of impact, innovation, and leadership',
      '3. Wait for endorsement decision (can take 1-8 weeks)',
      '4. Stage 2: Apply for the visa itself (within 3 months of endorsement)',
      '5. Receive decision (typically 3 weeks outside UK, 8 weeks inside)'
    ],
    roadmap: [
      'Initial visa can be granted for 1 to 5 years (you choose the duration)',
      'Exceptional Talent: Eligible for Indefinite Leave to Remain (ILR) after 3 years',
      'Exceptional Promise: Eligible for Indefinite Leave to Remain (ILR) after 5 years',
      'Can be extended indefinitely',
      'Highly attractive to employers due to lack of sponsorship overhead'
    ]
  },
  {
    title: 'Innovator Founder Visa',
    icon: Rocket,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    overview: [
      'For entrepreneurs seeking to set up a business in the UK.',
      'Business idea must be innovative, viable, and scalable.',
      'Replaced the old Innovator and Start-up visa routes.'
    ],
    requirements: [
      'Business plan endorsed by an approved UK endorsing body',
      'No minimum investment funds required (unlike previous routes)',
      'Must demonstrate English language proficiency (CEFR Level B2)',
      'Must have sufficient personal savings to support yourself (£1,270)'
    ],
    process: [
      '1. Develop a highly innovative, viable, and scalable business plan',
      '2. Apply for and secure an endorsement from an approved body',
      '3. Submit online visa application within 3 months of endorsement',
      '4. Provide biometrics and identity verification',
      '5. Pay application fees (£1,191) and Immigration Health Surcharge'
    ],
    roadmap: [
      'Initial visa granted for exactly 3 years',
      'Can be extended indefinitely in 3-year increments',
      'Eligible for Indefinite Leave to Remain (ILR) after just 3 years',
      'Must show significant business achievements for settlement'
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
