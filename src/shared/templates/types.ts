export interface RewrittenCVData {
  fullName: string;
  tagline: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    website?: string;
    linkedin?: string;
    github?: string;
    visaStatus?: string;
  };
  professionalSummary: string;
  education: {
    degree: string;
    university: string;
    startDate: string;
    endDate: string;
    grade: string;
    description: string;
  }[];
  projects: {
    name: string;
    skills: string;
    startDate: string;
    endDate: string;
    achievements: {
      label: string;
      body: string;
    }[];
  }[];
  experience: {
    jobTitle: string;
    company: string;
    location: string;
    type: string; // e.g. Full-time, Contract
    startDate: string;
    endDate: string;
    achievements: {
      label: string;
      body: string;
    }[];
  }[];
  coreSkills: {
    category: string;
    skills: string;
  }[];
  certifications: {
    name: string;
    issuer: string;
    year: string;
  }[];
}
