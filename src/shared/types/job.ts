// Job listing types

export interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  url: string;
  postedDate: string;
  source: 'adzuna' | 'reed' | 'jooble';
  contractType: string | null;
  isRemote: boolean;
  hasSponsorship: boolean;
}

export type SponsorStatus =
  | 'confirmed-sponsor'
  | 'likely-sponsor'
  | 'sponsorship-unknown'
  | 'no-sponsorship';

export interface JobSearchParams {
  query: string;
  company?: string;
  location: string;
  page: number;
  perPage: number;
  salaryMin?: number;
  salaryMax?: number;
  contractType?: 'permanent' | 'contract' | 'temporary' | 'all';
  remote?: boolean;
  sortBy?: 'relevance' | 'date' | 'salary';
  sponsorship?: 'all' | 'yes' | 'no';
  experience?: 'all' | 'junior' | 'mid' | 'senior';
}

export interface JobSearchResult {
  jobs: Job[];
  total: number;
  page: number;
  perPage: number;
  source: string;
}

export interface Sponsor {
  organisationName: string;
  townCity: string;
  county: string;
  rating: string;
  route: string;
  industry?: string;
}
