import { describe, expect, it } from 'vitest';
import { jobMatchSourceLinkage } from '../source-job-match';
import { profileToCandidateEvidence } from '../source-profile';
import { extractionToCandidateEvidence } from '../source-cv';
import { emptyExtractionPayload } from '@/shared/services/cv-extraction/types';
import type { ProfileData } from '@/features/dashboard/data/load-profile';

const profile: ProfileData = {
  profileId: 'profile-1', label: 'Software', targetIndustry: 'technology',
  personal: {
    label: 'Software', fullName: 'Amina Shah', tagline: 'Software Engineer', professionalSummary: 'Builds dependable products.',
    targetOccupation: 'software-engineer', targetRoleTitle: 'Backend Engineer', targetSeniority: 'mid', targetIndustry: 'technology',
    email: 'amina@example.com', phoneDialCode: '+44', phoneNumber: '7700900111', phoneCountry: 'GB', city: 'London', state: '', country: 'UK',
    website: 'https://amina.dev', linkedin: 'https://linkedin.com/in/amina', github: 'https://github.com/amina', visaStatus: '', visaExpiry: '',
  },
  experience: [{ id: 'exp-1', jobTitle: 'Engineer', company: 'Northstar', location: 'London', type: 'FULL_TIME', startDate: '2022-01', endDate: '', current: true, achievements: ['Reduced API latency by 40%.'], evidenceMetadata: [{ evidenceId: 'hitl-1', generationId: 'generation-1', fieldKind: 'ACHIEVEMENT', text: 'Mentored six engineers.', requirementIds: ['req-leadership'], provenance: 'HITL' }] }],
  projects: [{ id: 'project-1', name: 'CareTrack', liveUrl: 'https://caretrack.dev', repositoryUrl: 'https://github.com/amina/caretrack', startDate: '2023-01', endDate: '', achievements: ['Built REST APIs in .NET.'], skills: [{ id: 'skill-1', name: 'C#', level: 'professional', category: 'Languages' }] }],
  education: [], skills: [{ id: 'group-1', category: 'Languages', skills: ['C#'], skillItems: [{ id: 'skill-1', name: 'C#' }] }],
  certifications: [], trainings: [], licences: [], professionalRegistrations: [], languages: [], volunteering: [], openSource: [], otherEvidence: [],
};

describe('profileToCandidateEvidence', () => {
  it('preserves contact, professional links, project links, metrics, and canonical entity ids', () => {
    const result = profileToCandidateEvidence(profile, { snapshotId: 'snapshot-1' });
    expect(result.contact.email).toBe('amina@example.com');
    expect(result.professionalLinks.map((link) => link.type)).toEqual(expect.arrayContaining(['LINKEDIN', 'GITHUB', 'PORTFOLIO', 'PROJECT_LIVE', 'PROJECT_REPOSITORY']));
    expect(result.projects[0]).toMatchObject({ sourceEntityId: 'project-1', label: 'CareTrack' });
    expect(Object.values(result.evidenceById).some((item) => item.canonicalText.includes('40%') && item.preservationTier === 0)).toBe(true);
    expect(result.evidenceById['hitl-1']).toMatchObject({ provenance: 'HITL', requirementIds: ['req-leadership'], canonicalText: 'Mentored six engineers.' });
    expect(result.employment[0].evidenceIds).toContain('hitl-1');
  });
});

describe('jobMatchSourceLinkage', () => {
  it('uses the exact immutable source ids stored on the match', () => {
    expect(jobMatchSourceLinkage({
      id: 'match-1', requirementLedgerVersion: 3, analysisVersion: 'job-match@7', jobRevisionId: 'job-rev-1', profileSnapshotId: 'profile-snapshot-1',
      cvRevision: { id: 'cv-rev-1', storedCvId: 'stored-1', extractionId: 'extract-1' },
    })).toEqual({
      jobMatchId: 'match-1', storedCvId: 'stored-1', cvExtractionId: 'extract-1', cvRevisionId: 'cv-rev-1',
      matchProfileSnapshotId: 'profile-snapshot-1', jobRevisionId: 'job-rev-1', requirementLedgerVersion: 3, analysisVersion: 'job-match@7',
    });
  });

  it('rejects a match whose exact stored CV or extraction linkage is missing', () => {
    expect(() => jobMatchSourceLinkage({
      id: 'match-1', requirementLedgerVersion: 3, analysisVersion: 'job-match@7', jobRevisionId: 'job-rev-1', profileSnapshotId: 'profile-snapshot-1',
      cvRevision: { id: 'cv-rev-1', storedCvId: null, extractionId: null },
    })).toThrow('exact stored CV and extraction');
  });
});

describe('extractionToCandidateEvidence', () => {
  it('keeps source-CV-only roles, project bullets, and project links', () => {
    const payload = emptyExtractionPayload();
    payload.experience.push({
      jobTitle: 'Consultant', company: 'Legacy Co', location: 'Remote', startDate: '2020-01', endDate: '2021-12', current: false,
      achievements: ['Delivered 12 client migrations.'], excerpt: 'Consultant, Legacy Co', sourceLocation: { line: 10, section: 'Experience' },
    });
    payload.projects.push({
      name: 'Archive', startDate: null, endDate: null, achievements: ['Recovered historical records.'], repositoryUrl: 'https://github.com/amina/archive',
      excerpt: 'Archive', sourceLocation: { line: 30, section: 'Projects' },
    });
    const result = extractionToCandidateEvidence(payload, { cvRevisionId: 'cv-1', extractionId: 'extract-1' });
    expect(result.employment[0].label).toContain('Legacy Co');
    expect(Object.values(result.evidenceById).some((item) => item.canonicalText.includes('12 client migrations'))).toBe(true);
    expect(result.professionalLinks).toEqual([expect.objectContaining({ type: 'PROJECT_REPOSITORY', projectId: expect.any(String) })]);
  });
});
