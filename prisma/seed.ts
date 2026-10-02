import { createHash } from 'node:crypto';
import { prisma } from '../src/shared/lib/prisma.ts';

const userId = 'dev-v2-user';
const profileId = 'dev-v2-profile';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = new Date();

await prisma.user.deleteMany({ where: { id: userId } });
await prisma.user.create({ data: { id: userId, name: 'Amina Shah', email: 'amina.v2@example.test', emailVerified: true, onboardedAt: now } });
await prisma.profileIdentity.create({ data: {
  id: 'dev-v2-identity', userId, fullName: 'Amina Shah', email: 'amina.v2@example.test',
  phoneDialCode: '+44', phoneNumber: '7700900111', phoneCountry: 'GB', city: 'Leeds', country: 'UK',
  linkedin: 'https://linkedin.com/in/amina-v2', github: 'https://github.com/amina-v2', website: 'https://amina-v2.example.test',
} });
await prisma.profile.create({ data: {
  id: profileId, userId, label: 'Software Engineering', isDefault: true, targetOccupation: 'software-engineer',
  targetRoleTitle: 'Senior Backend Engineer', targetSeniority: 'senior', targetIndustry: 'technology',
  tagline: 'Backend engineer building dependable public services',
  professionalSummary: 'Backend engineer with experience delivering measurable platform improvements and accessible services.',
} });

await prisma.experience.createMany({ data: [
  {
    id: 'dev-v2-exp-current', profileId, company: 'Northstar Systems', jobTitle: 'Senior Software Engineer', location: 'Leeds', type: 'FULL_TIME', startDate: '2023-01', current: true,
    achievements: ['Reduced API latency by 40% across 18 services.', 'Mentored six engineers and introduced fortnightly delivery reviews.'],
    evidenceMetadata: [{ evidenceId: 'hitl-seed-mentoring', generationId: 'dev-v2-generation-job', fieldKind: 'ACHIEVEMENT', text: 'Mentored six engineers and introduced fortnightly delivery reviews.', requirementIds: ['requirement-leadership'], provenance: 'HITL' }], sortOrder: 0,
  },
  {
    id: 'dev-v2-exp-previous', profileId, company: 'Harbour Labs', jobTitle: 'Software Engineer', location: 'Manchester', type: 'FULL_TIME', startDate: '2020-02', endDate: '2022-12', current: false,
    achievements: ['Delivered 12 customer migrations with no critical rollback.', 'Improved deployment frequency from monthly to weekly.'], evidenceMetadata: [], sortOrder: 1,
  },
] });
await prisma.projectEntry.createMany({ data: [
  { id: 'dev-v2-project-caretrack', profileId, name: 'CareTrack', liveUrl: 'https://caretrack.example.test', repositoryUrl: 'https://github.com/amina-v2/caretrack', startDate: '2024-01', endDate: '2024-10', achievements: ['Built REST APIs in C# and .NET.', 'Added 36 automated integration tests.'], evidenceMetadata: [], sortOrder: 0 },
  { id: 'dev-v2-project-evidence', profileId, name: 'Evidence Hub', liveUrl: 'https://evidence-hub.example.test', repositoryUrl: 'https://github.com/amina-v2/evidence-hub', startDate: '2025-01', achievements: ['Deployed PostgreSQL-backed services to Azure for 250 users.'], evidenceMetadata: [], sortOrder: 1 },
] });
await prisma.education.create({ data: { id: 'dev-v2-education', profileId, university: 'University of Leeds', degree: 'BSc Computer Science', startDate: '2016-09', endDate: '2019-06', current: false, grade: 'First class', description: 'Distributed systems and accessible software design.', evidenceMetadata: [], sortOrder: 0 } });
const skillGroup = await prisma.skillGroup.create({ data: { id: 'dev-v2-skill-group', profileId, category: 'Backend and transferable skills', sortOrder: 0 } });
await prisma.skill.createMany({ data: [
  { id: 'dev-v2-skill-dotnet', profileId, skillGroupId: skillGroup.id, name: 'C# / .NET', normalizedName: 'c# .net', level: 'advanced', sortOrder: 0 },
  { id: 'dev-v2-skill-postgres', profileId, skillGroupId: skillGroup.id, name: 'PostgreSQL', normalizedName: 'postgresql', level: 'advanced', sortOrder: 1 },
  { id: 'dev-v2-skill-leadership', profileId, skillGroupId: skillGroup.id, name: 'Technical leadership', normalizedName: 'technical leadership', level: 'professional', sortOrder: 2 },
] });
await prisma.projectSkill.createMany({ data: [
  { projectId: 'dev-v2-project-caretrack', skillId: 'dev-v2-skill-dotnet', sortOrder: 0 },
  { projectId: 'dev-v2-project-evidence', skillId: 'dev-v2-skill-postgres', sortOrder: 0 },
] });
await prisma.certification.create({ data: { id: 'dev-v2-certification', profileId, name: 'Azure Developer Associate', issuer: 'Microsoft', issueDate: '2024-03', credentialNumber: 'AZ-204-DEMO', verificationUrl: 'https://example.test/credentials/az-204', evidenceMetadata: [] } });
await prisma.training.create({ data: { id: 'dev-v2-training', profileId, course: 'Inclusive Service Design', provider: 'Open Learning', field: 'Accessibility', status: 'Completed', startDate: '2024-05', endDate: '2024-06', result: 'Distinction', evidenceMetadata: [] } });
await prisma.volunteering.create({ data: { id: 'dev-v2-volunteering', profileId, organisation: 'Code Leeds', role: 'Volunteer mentor', startDate: '2022-01', contribution: 'Mentored early-career developers.', skillsTools: ['C#', 'Git'], outcome: 'Supported 14 learners.', evidenceMetadata: [] } });
await prisma.openSourceContribution.create({ data: { id: 'dev-v2-open-source', profileId, projectName: 'OpenAPI Linter', role: 'Maintainer', repositoryUrl: 'https://github.com/amina-v2/openapi-linter', startDate: '2023-06', description: 'Validation tooling for public API specifications.', contributions: ['Reviewed 28 pull requests.'], technologies: ['TypeScript', 'OpenAPI'], evidenceMetadata: [], sortOrder: 0 } });

const profileSnapshotData = {
  profile: {
    profileId, label: 'Software Engineering', targetIndustry: 'technology',
    personal: { label: 'Software Engineering', fullName: 'Amina Shah', tagline: 'Backend engineer building dependable public services', professionalSummary: 'Backend engineer with experience delivering measurable platform improvements and accessible services.', targetOccupation: 'software-engineer', targetRoleTitle: 'Senior Backend Engineer', targetSeniority: 'senior', targetIndustry: 'technology', email: 'amina.v2@example.test', phoneDialCode: '+44', phoneNumber: '7700900111', phoneCountry: 'GB', city: 'Leeds', state: '', country: 'UK', website: 'https://amina-v2.example.test', linkedin: 'https://linkedin.com/in/amina-v2', github: 'https://github.com/amina-v2', visaStatus: '', visaExpiry: '' },
    experience: [
      { id: 'dev-v2-exp-current', jobTitle: 'Senior Software Engineer', company: 'Northstar Systems', location: 'Leeds', type: 'FULL_TIME', startDate: '2023-01', endDate: '', current: true, achievements: ['Reduced API latency by 40% across 18 services.', 'Mentored six engineers and introduced fortnightly delivery reviews.'], evidenceMetadata: [{ evidenceId: 'hitl-seed-mentoring', generationId: 'dev-v2-generation-job', fieldKind: 'ACHIEVEMENT', text: 'Mentored six engineers and introduced fortnightly delivery reviews.', requirementIds: ['requirement-leadership'], provenance: 'HITL' }] },
      { id: 'dev-v2-exp-previous', jobTitle: 'Software Engineer', company: 'Harbour Labs', location: 'Manchester', type: 'FULL_TIME', startDate: '2020-02', endDate: '2022-12', current: false, achievements: ['Delivered 12 customer migrations with no critical rollback.', 'Improved deployment frequency from monthly to weekly.'], evidenceMetadata: [] },
    ],
    projects: [{ id: 'dev-v2-project-caretrack', name: 'CareTrack', liveUrl: 'https://caretrack.example.test', repositoryUrl: 'https://github.com/amina-v2/caretrack', startDate: '2024-01', endDate: '2024-10', achievements: ['Built REST APIs in C# and .NET.', 'Added 36 automated integration tests.'], skills: [{ id: 'dev-v2-skill-dotnet', name: 'C# / .NET', level: 'advanced', category: 'Backend and transferable skills' }], evidenceMetadata: [] }],
    education: [{ id: 'dev-v2-education', degree: 'BSc Computer Science', university: 'University of Leeds', startDate: '2016-09', endDate: '2019-06', current: false, grade: 'First class', description: 'Distributed systems and accessible software design.', evidenceMetadata: [] }],
    skills: [{ id: 'dev-v2-skill-group', category: 'Backend and transferable skills', skills: ['C# / .NET', 'PostgreSQL', 'Technical leadership'], skillItems: [{ id: 'dev-v2-skill-dotnet', name: 'C# / .NET' }, { id: 'dev-v2-skill-postgres', name: 'PostgreSQL' }, { id: 'dev-v2-skill-leadership', name: 'Technical leadership' }] }],
    certifications: [{ id: 'dev-v2-certification', name: 'Azure Developer Associate', issuer: 'Microsoft', year: '', issueDate: '2024-03', credentialNumber: 'AZ-204-DEMO', verificationUrl: 'https://example.test/credentials/az-204', evidenceMetadata: [] }],
    trainings: [], licences: [], professionalRegistrations: [], languages: [], volunteering: [], openSource: [], otherEvidence: [],
  },
  practicalFacts: {},
};

const extractionPayload = {
  schemaVersion: 2,
  identity: { fullName: 'Amina Shah', email: 'amina.v2@example.test', phone: '+44 7700 900111', phoneDialCode: '+44', phoneNumber: '7700900111', phoneCountry: 'GB', linkedin: 'https://linkedin.com/in/amina-v2', github: 'https://github.com/amina-v2', website: 'https://amina-v2.example.test', location: 'Leeds, UK' },
  headline: 'Senior Backend Engineer', summary: 'Backend engineer delivering dependable services.', detectedSections: ['Summary', 'Experience', 'Projects', 'Skills', 'Education'],
  experience: [{ jobTitle: 'Senior Software Engineer', company: 'Northstar Systems', location: 'Leeds', startDate: '2023-01', endDate: null, current: true, achievements: ['Reduced API latency by 40% across 18 services.'], excerpt: 'Senior Software Engineer, Northstar Systems', sourceLocation: { line: 8, section: 'Experience' } }],
  education: [{ degree: 'BSc Computer Science', university: 'University of Leeds', startDate: '2016-09', endDate: '2019-06', current: false, grade: 'First class', excerpt: 'BSc Computer Science', sourceLocation: { line: 26, section: 'Education' } }],
  projects: [{ name: 'CareTrack', startDate: '2024-01', endDate: '2024-10', achievements: ['Built REST APIs in C# and .NET.'], technologies: ['C#', '.NET'], repositoryUrl: 'https://github.com/amina-v2/caretrack', liveUrl: 'https://caretrack.example.test', excerpt: 'CareTrack', sourceLocation: { line: 20, section: 'Projects' } }],
  skills: [{ name: 'C# / .NET', category: 'Backend', excerpt: 'C# / .NET', sourceLocation: { line: 24, section: 'Skills' } }],
  certifications: [{ officialName: 'Azure Developer Associate', issuingBody: 'Microsoft', issueDate: '2024-03', expiryDate: null, excerpt: 'Azure Developer Associate', sourceLocation: { line: 30, section: 'Certifications' } }],
  training: [], licences: [], professionalRegistrations: [], languages: [], volunteering: [], otherEvidence: [],
};
const cvText = 'Amina Shah\nSenior Backend Engineer\nNorthstar Systems\nReduced API latency by 40% across 18 services.\nCareTrack\nBuilt REST APIs in C# and .NET.\nAzure Developer Associate';
const storedCv = await prisma.storedCv.create({ data: { id: 'dev-v2-stored-cv', userId, storageProvider: 'minio', storageKey: 'seed/dev-v2/source-cv.pdf', originalFilename: 'amina-shah-cv.pdf', mimeType: 'application/pdf', sizeBytes: 48_000, checksum: hash('dev-v2-source-cv'), sourceFormat: 'pdf', status: 'READY' } });
const extraction = await prisma.cvExtraction.create({ data: { id: 'dev-v2-extraction', storedCvId: storedCv.id, parserVersion: 'cv-extract@2', attempt: 1, sourceFormat: 'pdf', status: 'READY', extractedText: cvText, structuredData: extractionPayload, pageCount: 2 } });
const revision = await prisma.cvRevision.create({ data: { id: 'dev-v2-cv-revision', userId, storedCvId: storedCv.id, extractionId: extraction.id, filename: 'amina-shah-cv.pdf', mimeType: 'application/pdf', byteSize: 48_000, checksum: hash('dev-v2-source-cv'), extractedText: cvText, pageCount: 2, parserVersion: 'cv-extract@2' } });
const jobRevision = await prisma.jobRevision.create({ data: { id: 'dev-v2-job-revision', userId, title: 'Senior Backend Engineer', company: 'Civic Platform Ltd', location: 'Leeds / Hybrid', description: 'Build C#/.NET services, PostgreSQL APIs, mentor engineers, and operate Kubernetes workloads. Azure experience is desirable. Candidates must have the right to work in the UK.', descriptionSource: 'USER_PASTED', descriptionHash: hash('dev-v2-job-description') } });
const profileSnapshot = await prisma.careerProfileSnapshot.create({ data: { id: 'dev-v2-profile-snapshot', userId, sourceProfileId: profileId, profileLabel: 'Software Engineering', targetRole: 'Senior Backend Engineer', targetOccupation: 'software-engineer', targetSeniority: 'senior', targetIndustry: 'technology', snapshotJson: profileSnapshotData, schemaVersion: 1, contentHash: hash(JSON.stringify(profileSnapshotData)) } });

const requirementLedger = {
  schemaVersion: 1, analysisVersion: 'job-match@3', requirements: [
    { id: 'requirement-dotnet', text: 'Commercial C# and .NET experience', importance: 'MANDATORY', category: 'SKILL', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION', analysis: { status: 'MET', evidence: [{ source: 'CV', sourceRef: 'dev-v2-exp-current', text: 'Built REST APIs in C# and .NET.' }], confidence: 0.98, deduction: { points: 0, reason: 'Directly evidenced.', rubric: 'MET' } } },
    { id: 'requirement-leadership', text: 'Mentor software engineers', importance: 'MANDATORY', category: 'DUTY', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION', analysis: { status: 'PARTIAL', evidence: [{ source: 'PROFILE', sourceRef: 'hitl-seed-mentoring', text: 'Mentored six engineers.' }], confidence: 0.82, deduction: { points: 5, reason: 'Mentoring is evidenced; formal line management is unclear.', rubric: 'PARTIAL_MATCH' } } },
    { id: 'requirement-kubernetes', text: 'Operate Kubernetes workloads', importance: 'MANDATORY', category: 'TOOL', evidenceRequired: true, sourceSection: 'JOB_DESCRIPTION', analysis: { status: 'NOT_MET', evidence: [], confidence: 0.94, deduction: { points: 10, reason: 'No Kubernetes evidence was found.', rubric: 'MANDATORY_SUPPORTING_MISSING' } } },
    { id: 'requirement-azure', text: 'Azure platform experience', importance: 'DESIRABLE', category: 'TOOL', evidenceRequired: true, sourceSection: 'PERSON_SPECIFICATION', analysis: { status: 'MET', evidence: [{ source: 'PROFILE', sourceRef: 'dev-v2-certification', text: 'Azure Developer Associate.' }], confidence: 0.9, deduction: { points: 0, reason: 'Credential and project evidence are present.', rubric: 'MET' } } },
    { id: 'requirement-eligibility', text: 'Right to work in the UK', importance: 'MANDATORY', category: 'ELIGIBILITY', evidenceRequired: true, sourceSection: 'PERSON_SPECIFICATION', analysis: { status: 'UNCLEAR', evidence: [], confidence: 0.5, deduction: { points: 0, reason: 'The CV does not state immigration status.', rubric: 'ELIGIBILITY' } } },
  ],
};
const advisory = { schemaVersion: 1, jobTitle: 'Senior Backend Engineer', jobCompany: 'Civic Platform Ltd', domainFit: { roleDomain: 'backend platform engineering', candidateDomain: 'backend software engineering', status: 'aligned', overlapAreas: ['C#/.NET', 'APIs', 'PostgreSQL', 'Azure'], detail: 'Strong backend overlap with one material tooling gap.', confidence: 0.9, deduction: { points: 7, reason: 'Kubernetes operation is not evidenced.' } }, matchScore: 78, matchFeedback: 'Strong backend alignment with a Kubernetes evidence gap.', experienceGap: 'Kubernetes production operations are not evidenced.', tailoredRewrites: [{ original: 'Built REST APIs in C# and .NET.', suggested: 'Built C#/.NET REST APIs supporting dependable service delivery.', rationale: 'Surfaces the directly evidenced mandatory stack.' }] };
const jobMatch = await prisma.jobMatch.create({ data: { id: 'dev-v2-job-match', userId, cvRevisionId: revision.id, jobRevisionId: jobRevision.id, profileSnapshotId: profileSnapshot.id, matchScore: 78, requirementLedgerJson: requirementLedger, requirementLedgerVersion: 1, advisoryJson: advisory, advisoryVersion: 1, analysisVersion: 'job-match@3', promptVersion: 'job-match@3-profile-evidence', aiProvider: 'seed', aiModel: 'deterministic-fixture' } });

const profileEvidence = { schemaVersion: 1, identity: { fullName: 'Amina Shah', headline: 'Backend engineer building dependable public services', evidenceIds: [] }, contact: { email: 'amina.v2@example.test', phone: '+44 7700900111', location: 'Leeds, UK', evidenceIds: [] }, professionalLinks: [], employment: [], projects: [], education: [], certifications: [], training: [], volunteerExperience: [], openSource: [], skills: [], achievements: [], otherEvidence: [], evidenceById: {}, sourceRefs: [], conflicts: [] };
await prisma.cvGeneration.create({ data: { id: 'dev-v2-generation-profile', userId, operationId: 'dev-v2-profile-only', sourceMode: 'CAREER_PROFILE', status: 'DRAFT', atsStrategy: 'STANDARD', profileId, generationProfileSnapshotId: profileSnapshot.id, targetContextJson: { title: 'Senior Backend Engineer' }, currentSnapshotVersion: 1, evidenceSnapshots: { create: { version: 1, reason: 'INITIAL', snapshotJson: profileEvidence, schemaVersion: 1, contentHash: hash(JSON.stringify(profileEvidence)) } } } });
const jobEvidence = { ...profileEvidence, evidenceById: { 'application-only-kubernetes': { id: 'application-only-kubernetes', kind: 'ACHIEVEMENT', field: 'experience.achievement', canonicalText: 'Supported a Kubernetes migration for nine internal services.', sourceEntityId: 'dev-v2-exp-current', provenance: 'APPLICATION_EVIDENCE', preservationTier: 1, requirementIds: ['requirement-kubernetes'], sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'Experience', entityId: 'dev-v2-exp-current', fieldPath: 'achievement' }] } }, sourceRefs: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'Experience', entityId: 'dev-v2-exp-current', fieldPath: 'achievement' }] };
await prisma.cvGeneration.create({ data: { id: 'dev-v2-generation-job', userId, operationId: 'dev-v2-job-application', sourceMode: 'JOB_MATCH', status: 'EVIDENCE_REVIEW', atsStrategy: 'STANDARD', profileId, jobMatchId: jobMatch.id, storedCvId: storedCv.id, sourceExtractionId: extraction.id, sourceCvRevisionId: revision.id, matchProfileSnapshotId: profileSnapshot.id, generationProfileSnapshotId: profileSnapshot.id, jobRevisionId: jobRevision.id, requirementLedgerVersion: 1, analysisVersion: 'job-match@3', targetContextJson: { title: 'Senior Backend Engineer', company: 'Civic Platform Ltd' }, currentSnapshotVersion: 1, currentReconciliationVersion: 1, evidenceSnapshots: { create: { version: 1, reason: 'HITL_APPLICATION_ONLY', snapshotJson: jobEvidence, schemaVersion: 1, contentHash: hash(JSON.stringify(jobEvidence)) } }, reconciliations: { create: { version: 1, snapshotVersion: 1, reconciliationJson: { schemaVersion: 1, items: requirementLedger.requirements.map((item) => ({ requirementId: item.id, status: item.id === 'requirement-kubernetes' ? 'SUPPORTED' : item.analysis.status === 'MET' ? 'SUPPORTED' : item.analysis.status === 'PARTIAL' ? 'PARTIAL' : 'MISSING', evidenceIds: item.id === 'requirement-kubernetes' ? ['application-only-kubernetes'] : [], confidence: item.analysis.confidence, reason: item.analysis.deduction.reason })) }, schemaVersion: 1, contentHash: hash('dev-v2-reconciliation') } }, applicationEvidence: { create: { evidenceId: 'application-only-kubernetes', entityKind: 'EXPERIENCE', entityId: 'dev-v2-exp-current', persistenceScope: 'APPLICATION_ONLY', evidenceJson: { fieldKind: 'ACHIEVEMENT', text: 'Supported a Kubernetes migration for nine internal services.' }, requirementIds: ['requirement-kubernetes'], sourceRefsJson: [{ sourceType: 'APPLICATION_EVIDENCE', entityType: 'Experience', entityId: 'dev-v2-exp-current', fieldPath: 'achievement' }], schemaVersion: 1 } } } });

console.log('V2 development seed complete: rich Career Profile, immutable CV/job/profile sources, normalized Job Match ledger/advisory, profile-only generation, reusable HITL evidence, and application-only evidence.');
await prisma.$disconnect();
