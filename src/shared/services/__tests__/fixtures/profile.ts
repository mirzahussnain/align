import type { ProfileData } from '@/features/dashboard/data/load-profile';

const PERSONAL: ProfileData['personal'] = {
  label: 'Default', fullName: 'A Candidate', tagline: '', professionalSummary: '',
  targetOccupation: '', targetRoleTitle: '', targetSeniority: '', targetIndustry: '',
  email: '', phoneDialCode: '', phoneNumber: '', phoneCountry: '', city: '', state: '',
  country: '', website: '', linkedin: '', github: '', visaStatus: '', visaExpiry: '',
};

/** A minimal but complete ProfileData for service tests. */
export function makeProfile(overrides: Partial<ProfileData> = {}): ProfileData {
  return {
    profileId: 'profile-a',
    label: 'Default',
    targetIndustry: '',
    personal: PERSONAL,
    experience: [],
    projects: [],
    education: [],
    skills: [],
    certifications: [],
    trainings: [],
    licences: [],
    professionalRegistrations: [],
    languages: [],
    volunteering: [],
    otherEvidence: [],
    ...overrides,
  };
}
