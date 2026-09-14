import { TEMPLATE_IDS, type TemplateId } from '@/shared/constants/templates';
import { CV_TEMPLATE_CAPABILITIES } from '@/shared/constants/cv-template-capabilities';
import { planCvBuildSpec } from '@/shared/services/cv-build-spec';
import { prioritizeCvContent } from '@/shared/services/cv-content-priority';
import { structuredRewriteToRewrittenData } from '@/shared/services/cv-rewrite-structured';
import type { RewrittenCVData } from '@/shared/templates/types';
import type { OccupationId } from '@/shared/types/classification';
import type { ApprovedProfileEvidenceOverlay } from '@/shared/types/profile-reasoning';
import type {
  LedgerNativeRewriteInput,
  RewriteApplicationEvidence,
  RewriteRequirement,
  RewriteSourceRef,
  StructuredCvRewriteOutput,
} from '@/shared/types/cv-rewrite';
import { formatDateRangeStyled } from '@/shared/utils/date';
import type {
  GoldenCvFixture,
  GoldenDensity,
  GoldenEvidenceSource,
} from './types';

const SOURCE_REF: RewriteSourceRef = { source: 'source_cv', section: 'source_cv' };

interface Blueprint {
  id: string;
  fileOccupation: string;
  purpose: string;
  occupation: OccupationId;
  occupationLabel: string;
  targetRole: string;
  density: GoldenDensity;
  evidenceSources: GoldenEvidenceSource[];
  data: RewrittenCVData;
  requirements: RewriteRequirement[];
  approvedProfileEvidence?: ApprovedProfileEvidenceOverlay[];
  applicationEvidence?: RewriteApplicationEvidence[];
  refOverrides?: Record<string, RewriteSourceRef[]>;
  unsupportedRequirements?: string[];
  forbiddenClaims?: string[];
  absentLinks?: string[];
  importantClaims: string[];
  pageTendency: GoldenCvFixture['expected']['pageTendency'];
  knownVisualRisks: string[];
}

function baseData(overrides: Partial<RewrittenCVData>): RewrittenCVData {
  const defaults: RewrittenCVData = {
    fullName: 'Jordan Morgan',
    tagline: 'Evidence-led professional',
    contact: {
      email: 'jordan.morgan@example.test',
      phone: '+44 7700 900123',
      location: 'Leeds, UK',
      linkedin: 'linkedin.com/in/jordan-morgan',
    },
    professionalSummary: '',
    education: [],
    projects: [],
    experience: [],
    coreSkills: [],
    certifications: [],
  };
  return {
    ...defaults,
    ...overrides,
    contact: { ...defaults.contact, ...overrides.contact },
  };
}

function bullets(prefix: string, count: number): RewrittenCVData['experience'][number]['achievements'] {
  return Array.from({ length: count }, (_, index) => ({
    label: `${prefix} ${index + 1}`,
    body: `${prefix} evidence point ${index + 1} delivered with documented scope and outcome.`,
  }));
}

function requirement(
  id: string,
  text: string,
  status: RewriteRequirement['status'],
  category: RewriteRequirement['category'] = 'skill',
  approvedProfileEvidence: string[] = []
): RewriteRequirement {
  return {
    id,
    text,
    importance: 'mandatory',
    status,
    category,
    cvEvidence: status === 'met' || status === 'partial' ? [`Evidence for ${text}`] : [],
    approvedProfileEvidence,
  };
}

function sourceRefsFor(path: string, overrides: Record<string, RewriteSourceRef[]>): RewriteSourceRef[] {
  return overrides[path] ?? [SOURCE_REF];
}

/** Reusable Stage 3-compatible structured-output factory; no live provider is involved. */
export function makeStructuredGoldenOutput(
  data: RewrittenCVData,
  refOverrides: Record<string, RewriteSourceRef[]> = {},
  unsupportedRequirementsNotAdded: string[] = []
): StructuredCvRewriteOutput {
  return {
    identity: {
      name: data.fullName,
      professionalTitle: data.tagline,
      location: data.contact.location,
      contact: { ...data.contact },
      sourceRefs: sourceRefsFor('identity', refOverrides),
    },
    summary: data.professionalSummary
      ? { text: data.professionalSummary, sourceRefs: sourceRefsFor('summary', refOverrides) }
      : undefined,
    experience: data.experience.map((entry, entryIndex) => ({
      ...entry,
      achievements: entry.achievements.map((item, bulletIndex) => ({
        label: item.label,
        text: item.body,
        sourceRefs: sourceRefsFor(`experience.${entryIndex}.achievements.${bulletIndex}`, refOverrides),
      })),
      sourceRefs: sourceRefsFor(`experience.${entryIndex}`, refOverrides),
    })),
    projects: data.projects.map((entry, entryIndex) => ({
      ...entry,
      achievements: entry.achievements.map((item, bulletIndex) => ({
        label: item.label,
        text: item.body,
        sourceRefs: sourceRefsFor(`projects.${entryIndex}.achievements.${bulletIndex}`, refOverrides),
      })),
      sourceRefs: sourceRefsFor(`projects.${entryIndex}`, refOverrides),
    })),
    education: data.education.map((entry, index) => ({
      ...entry,
      sourceRefs: sourceRefsFor(`education.${index}`, refOverrides),
    })),
    skills: data.coreSkills.map((entry, index) => ({
      category: entry.category,
      text: entry.skills,
      sourceRefs: sourceRefsFor(`skills.${index}`, refOverrides),
    })),
    certifications: data.certifications.map((entry, index) => ({
      ...entry,
      sourceRefs: sourceRefsFor(`certifications.${index}`, refOverrides),
    })),
    generationNotes: { unsupportedRequirementsNotAdded },
  };
}

function rewriteInput(blueprint: Blueprint): LedgerNativeRewriteInput {
  return {
    cvText: JSON.stringify(blueprint.data),
    jobDescription: `Deterministic Stage 4 vacancy context for ${blueprint.targetRole}.`,
    rewriteContext: {
      requirements: blueprint.requirements,
      eligibilityConstraints: [],
      cvBuildSpec: {
        recommended_template: 'architect',
        template_rationale: 'Fixture-only advisory value.',
        section_order: [],
        lead_project: '',
        summary_angle: '',
        skills_to_surface: [],
        skills_to_deprioritise: [],
        bullets_to_rewrite: [],
        visa_note_required: false,
        cover_letter_angle: '',
      },
    },
    approvedProfileEvidence: blueprint.approvedProfileEvidence ?? [],
    applicationEvidence: blueprint.applicationEvidence ?? [],
    template: 'architect',
  };
}

const nurseApproval: ApprovedProfileEvidenceOverlay = {
  requirementId: 'req-nmc',
  evidenceRef: { type: 'professional_registration', id: 'registration-nmc-v1' },
  approvalId: 'approval-nmc-v1',
  requirementText: 'Current NMC registration',
  sourceProfileId: 'profile-nurse-v1',
  resolvedEvidenceText: 'NMC registration 12A3456E, renewal due 2027',
  evidenceLocation: 'Professional registration',
  userApproved: true,
  evidenceSnapshot: { name: 'NMC registration', number: '12A3456E', renewalYear: '2027' },
};

const softwareApproval: ApprovedProfileEvidenceOverlay = {
  requirementId: 'req-kafka',
  evidenceRef: { type: 'project', id: 'project-stream-v1' },
  approvalId: 'approval-stream-v1',
  requirementText: 'Kafka delivery experience',
  sourceProfileId: 'profile-software-v1',
  resolvedEvidenceText: 'Reduced event-processing latency by 38% using Kafka.',
  evidenceLocation: 'Streaming platform project',
  userApproved: true,
};

const applicationEvidence: RewriteApplicationEvidence = {
  id: 'application-context-v1',
  requirementId: 'req-service-transition',
  context: {
    label: 'Service transition exposure',
    text: 'Supported a supervised service-desk migration during a short placement.',
  },
};

const BLUEPRINTS: Blueprint[] = [
  {
    id: 'administration-sparse-source',
    fileOccupation: 'administration',
    purpose: 'Sparse administration CV with no summary, projects or credentials.',
    occupation: 'administrator',
    occupationLabel: 'Administration',
    targetRole: 'Office Administrator',
    density: 'sparse',
    evidenceSources: ['source-cv'],
    data: baseData({
      tagline: 'Office Administrator',
      experience: [{
        jobTitle: 'Administrative Assistant', company: 'North Office', location: 'Leeds', type: 'Part-time',
        startDate: '2022', endDate: '2024',
        achievements: [
          { label: 'Records', body: 'Maintained accurate filing and appointment records.' },
          { label: 'Coordination', body: 'Coordinated diaries for a five-person team.' },
        ],
      }],
      coreSkills: [{ category: 'Office support', skills: 'Diary coordination, Microsoft Excel' }],
    }),
    requirements: [requirement('req-admin', 'Diary coordination', 'met')],
    importantClaims: ['Maintained accurate filing and appointment records.'],
    pageTendency: 'one-page-likely',
    knownVisualRisks: ['Sparse sections may create excessive vertical bands.'],
  },
  {
    id: 'registered-nurse-normal-approved',
    fileOccupation: 'registered-nurse',
    purpose: 'Regulated healthcare evidence with an approved stable registration record.',
    occupation: 'registered_nurse',
    occupationLabel: 'Registered Nurse',
    targetRole: 'Registered Nurse',
    density: 'normal',
    evidenceSources: ['source-cv', 'approved-profile'],
    data: baseData({
      fullName: 'Priya Shah',
      tagline: 'Registered Nurse',
      professionalSummary: 'Registered nurse experienced in safe patient care, escalation and multidisciplinary handovers.',
      experience: [{
        jobTitle: 'Staff Nurse', company: 'Westshire NHS Trust', location: 'Leeds', type: 'Full-time',
        startDate: '2021-09', endDate: 'Present',
        achievements: [
          { label: 'Safety', body: 'Escalated deteriorating observations using the agreed clinical pathway.' },
          { label: 'Handover', body: 'Delivered accurate multidisciplinary handovers across day and night shifts.' },
        ],
      }],
      education: [{ degree: 'BSc Adult Nursing', university: 'Leeds Beckett University', startDate: '2018', endDate: '2021', grade: '2:1', description: 'Adult nursing.' }],
      coreSkills: [{ category: 'Clinical', skills: 'Patient observations, Care planning, Safeguarding' }],
      certifications: [
        { name: 'NMC registration 12A3456E', issuer: 'Nursing and Midwifery Council', year: 'Renewal 2027' },
        { name: 'Immediate Life Support', issuer: 'Resuscitation Council UK', year: '2025' },
      ],
    }),
    requirements: [requirement('req-nmc', 'Current NMC registration', 'met', 'credential', [nurseApproval.resolvedEvidenceText])],
    approvedProfileEvidence: [nurseApproval],
    refOverrides: {
      'certifications.0': [{ source: 'approved_profile', requirementId: 'req-nmc', evidenceRef: nurseApproval.evidenceRef }],
    },
    importantClaims: ['NMC registration 12A3456E', 'Escalated deteriorating observations'],
    forbiddenClaims: ['Independent prescriber', 'Registered manager'],
    pageTendency: 'one-to-two-pages',
    knownVisualRisks: ['Credential line wrapping and current-role date alignment.'],
  },
  {
    id: 'software-engineering-dense-mixed',
    fileOccupation: 'software-engineering',
    purpose: 'Dense technical CV with supported metrics, approved profile evidence and application-only context.',
    occupation: 'software_engineer',
    occupationLabel: 'Software Engineering',
    targetRole: 'Platform Engineer',
    density: 'dense',
    evidenceSources: ['source-cv', 'approved-profile', 'application-context'],
    data: baseData({
      fullName: 'Alex Chen',
      tagline: 'Platform Engineer',
      contact: { email: 'alex.chen@example.test', phone: '+44 7700 900456', location: 'Manchester, UK', github: 'github.com/alexchen', website: 'https://alexchen.dev' },
      professionalSummary: 'Platform engineer building reliable services, observable delivery pipelines and measurable operational improvements.',
      experience: [
        { jobTitle: 'Platform Engineer', company: 'Northstar Systems', location: 'Manchester', type: 'Full-time', startDate: '2022-04', endDate: 'Present', achievements: [
          { label: 'Latency', body: 'Reduced event-processing latency by 38% using Kafka.' },
          { label: 'Delivery', body: 'Cut deployment recovery time from 45 minutes to 12 minutes.' },
          ...bullets('Platform', 5),
        ] },
        { jobTitle: 'Software Engineer', company: 'Civic Cloud', location: 'Remote', type: 'Full-time', startDate: '2019-01', endDate: '2022-03', achievements: bullets('Service', 6) },
      ],
      projects: [
        { name: 'Streaming Reliability Lab', skills: 'Kafka, TypeScript, OpenTelemetry', startDate: '2023-02', endDate: '2024-11', achievements: [{ label: 'Evidence', body: 'Published reproducible load-test scenarios for three failure modes.' }, ...bullets('Project', 4)] },
        { name: 'Deployment Guard', skills: 'GitHub Actions, Docker', startDate: '2021', endDate: '2022', achievements: bullets('Guard', 4) },
      ],
      education: [{ degree: 'BSc Computer Science', university: 'University of Salford', startDate: '2015', endDate: '2018', grade: 'First', description: 'Distributed systems.' }],
      coreSkills: [
        { category: 'Languages', skills: 'TypeScript, Python, SQL, TypeScript' },
        { category: 'Platforms', skills: 'AWS, Kubernetes, Docker, Kafka, OpenTelemetry' },
        { category: 'Exposure', skills: 'Terraform (limited exposure), Rust (learning)' },
      ],
      certifications: [{ name: 'AWS Certified Developer', issuer: 'AWS', year: '2023' }],
    }),
    requirements: [
      requirement('req-kafka', 'Kafka delivery experience', 'met', 'tool', [softwareApproval.resolvedEvidenceText]),
      requirement('req-service-transition', 'Service transition experience', 'partial', 'experience'),
      requirement('req-go', 'Production Go expertise', 'not_met', 'tool'),
    ],
    approvedProfileEvidence: [softwareApproval],
    applicationEvidence: [applicationEvidence],
    refOverrides: {
      'experience.0.achievements.0': [{ source: 'approved_profile', requirementId: 'req-kafka', evidenceRef: softwareApproval.evidenceRef }],
      'projects.0.achievements.0': [{ source: 'application_context', requirementId: 'req-service-transition', contextId: applicationEvidence.id }],
    },
    unsupportedRequirements: ['req-go'],
    importantClaims: ['Reduced event-processing latency by 38%', 'Terraform (limited exposure)', 'Rust (learning)'],
    forbiddenClaims: ['Production Go expertise', 'Go expert', '99.999% availability'],
    pageTendency: 'multi-page-likely',
    knownVisualRisks: ['Dense skills, long project blocks and multi-page experience pagination.'],
  },
  {
    id: 'frontline-operations-multipage-application',
    fileOccupation: 'frontline-operations',
    purpose: 'Likely multi-page frontline operations CV with application-only evidence and repeated entry pressure.',
    occupation: 'warehouse_operative',
    occupationLabel: 'Frontline Operations',
    targetRole: 'Warehouse Operative',
    density: 'likely-multi-page',
    evidenceSources: ['source-cv', 'application-context'],
    data: baseData({
      fullName: 'Sam Taylor',
      tagline: 'Warehouse Operative',
      professionalSummary: 'Reliable warehouse operative with documented picking, dispatch and safety experience.',
      experience: Array.from({ length: 5 }, (_, index) => ({
        jobTitle: index === 0 ? 'Warehouse Operative' : 'Operations Assistant',
        company: `Distribution Site ${index + 1}`,
        location: 'Yorkshire',
        type: 'Full-time',
        startDate: `${2015 + index}`,
        endDate: index === 0 ? 'Present' : `${2016 + index}`,
        achievements: bullets(`Operations ${index + 1}`, 6),
      })),
      projects: [{ name: 'Stock Count Improvement', skills: 'Cycle counting, Excel', startDate: '2023', endDate: '2024', achievements: bullets('Stock', 5) }],
      education: [{ degree: 'Level 2 Warehousing', university: 'Regional Training Centre', startDate: '2014', endDate: '2015', grade: 'Pass', description: 'Warehouse operations.' }],
      coreSkills: [{ category: 'Operations', skills: 'Picking, Packing, Dispatch, Cycle counting, Manual handling, Health and safety' }],
      certifications: [{ name: 'Counterbalance forklift licence', issuer: 'RTITB provider', year: 'Expires 2027' }],
    }),
    requirements: [
      requirement('req-service-transition', 'Service transition experience', 'partial', 'experience'),
      requirement('req-reach', 'Reach truck licence', 'unclear', 'credential'),
    ],
    applicationEvidence: [applicationEvidence],
    unsupportedRequirements: ['req-reach'],
    importantClaims: ['Counterbalance forklift licence', 'Operations 1 evidence point 1'],
    forbiddenClaims: ['Reach truck licence', 'Zero workplace incidents'],
    pageTendency: 'multi-page-likely',
    knownVisualRisks: ['Orphaned entry headings, isolated bullets and nearly blank spill pages.'],
  },
  {
    id: 'healthcare-support-normal-source',
    fileOccupation: 'healthcare-support',
    purpose: 'Healthcare support CV with training, language and volunteering evidence represented without new section types.',
    occupation: 'healthcare_support',
    occupationLabel: 'Healthcare Support',
    targetRole: 'Healthcare Support Worker',
    density: 'normal',
    evidenceSources: ['source-cv'],
    data: baseData({
      fullName: 'Maya Okafor',
      tagline: 'Healthcare Support Worker',
      professionalSummary: 'Healthcare support worker experienced in personal care, observations and accurate escalation.',
      experience: [
        { jobTitle: 'Healthcare Assistant', company: 'Riverside Care', location: 'Leeds', type: 'Full-time', startDate: '2023-01', endDate: 'Present', achievements: [
          { label: 'Care', body: 'Supported personal care for up to eight residents per shift.' },
          { label: 'Escalation', body: 'Recorded observations and escalated changes to the registered nurse.' },
        ] },
        { jobTitle: 'Volunteer Befriender', company: 'Community Wellbeing Group', location: 'Leeds', type: 'Voluntary', startDate: '2021', endDate: '2022', achievements: [{ label: 'Support', body: 'Provided weekly social support under coordinator supervision.' }] },
      ],
      education: [{ degree: 'Care Certificate', university: 'Riverside Care', startDate: '', endDate: '2023', grade: 'Completed', description: 'Standards 1-15.' }],
      coreSkills: [{ category: 'Care', skills: 'Personal care, Observations, Safeguarding, Yoruba (native), English (fluent)' }],
      certifications: [{ name: 'Safeguarding Adults Level 2 training', issuer: 'Riverside Care', year: '2025' }],
    }),
    requirements: [requirement('req-care', 'Personal care experience', 'met', 'experience')],
    importantClaims: ['up to eight residents per shift', 'Yoruba (native)', 'Volunteer Befriender'],
    forbiddenClaims: ['Administered medication independently', 'NMC registration 99Z9999E'],
    pageTendency: 'one-to-two-pages',
    knownVisualRisks: ['Long skill line and second experience entry pagination.'],
  },
  {
    id: 'it-support-dense-general',
    fileOccupation: 'it-support-general',
    purpose: 'IT support/service-management scenario routed through General because no calibrated IT profile exists.',
    occupation: 'generic',
    occupationLabel: 'IT Support / Service Management (General profile)',
    targetRole: 'IT Support Analyst',
    density: 'dense',
    evidenceSources: ['source-cv'],
    data: baseData({
      fullName: 'Theo Evans',
      tagline: 'IT Support Analyst',
      professionalSummary: 'IT support analyst handling incidents, user communication and documented service restoration.',
      experience: [
        { jobTitle: 'IT Support Analyst', company: 'Civic Services', location: 'Sheffield', type: 'Full-time', startDate: '2020-06', endDate: 'Present', achievements: [
          { label: 'Resolution', body: 'Resolved 82% of assigned incidents within the agreed service target.' },
          ...bullets('Support', 7),
        ] },
        { jobTitle: 'Service Desk Assistant', company: 'College IT', location: 'Sheffield', type: 'Part-time', startDate: '2018', endDate: '2020', achievements: bullets('Desk', 5) },
      ],
      projects: [{ name: 'Knowledge Base Refresh', skills: 'ServiceNow, technical writing', startDate: '2022-03', endDate: '2022-10', achievements: bullets('Knowledge', 4) }],
      education: [{ degree: 'BSc Information Systems', university: 'Sheffield Hallam University', startDate: '2015', endDate: '2018', grade: '2:1', description: 'Information systems.' }],
      coreSkills: [{ category: 'Support', skills: 'Incident management, ServiceNow, Microsoft 365, Active Directory, Troubleshooting, User communication' }],
      certifications: [{ name: 'ITIL 4 Foundation', issuer: 'PeopleCert', year: '2022' }],
    }),
    requirements: [
      requirement('req-servicenow', 'ServiceNow', 'met', 'tool'),
      requirement('req-azure', 'Azure administration', 'contradicted', 'tool'),
    ],
    unsupportedRequirements: ['req-azure'],
    importantClaims: ['Resolved 82% of assigned incidents', 'ITIL 4 Foundation'],
    forbiddenClaims: ['Azure administrator', 'Microsoft Certified'],
    pageTendency: 'multi-page-likely',
    knownVisualRisks: ['Dense support bullets and long service-management skill line.'],
  },
  {
    id: 'general-normal-edge-cases',
    fileOccupation: 'general',
    purpose: 'General fixture for duplicates, malformed links, unsupported claims, no projects and long summary handling.',
    occupation: 'generic',
    occupationLabel: 'General / Other',
    targetRole: 'Programme Coordinator',
    density: 'normal',
    evidenceSources: ['source-cv'],
    data: baseData({
      fullName: 'Robin Patel',
      tagline: 'Programme Coordinator',
      contact: { email: 'robin.patel@example.test', phone: '+44 7700 900789', location: 'Bristol, UK', website: 'not a valid url', linkedin: 'https://linkedin.com/in/robin-patel' },
      professionalSummary: 'Programme coordinator supporting schedules, stakeholder updates and accurate reporting. Programme coordinator supporting schedules, stakeholder updates and accurate reporting. This deliberately long evidence-led summary tests deterministic duplicate-sentence compaction without adding facts or allowing layout code to rewrite content.',
      experience: [{
        jobTitle: 'Programme Coordinator', company: 'Community Network', location: 'Bristol', type: 'Full-time', startDate: '2020', endDate: '2024-12', achievements: [
          { label: 'Reporting', body: 'Prepared monthly status reports for six workstreams.' },
          { label: 'Reporting', body: 'Prepared monthly status reports for six workstreams.' },
          { label: 'Planning', body: 'Maintained delivery schedules and action logs.' },
        ],
      }],
      education: [{ degree: 'BA Business Management', university: 'UWE Bristol', startDate: '2016', endDate: '2019', grade: '2:1', description: 'Business management.' }],
      coreSkills: [
        { category: 'Coordination', skills: 'Scheduling, Reporting, Excel, Scheduling' },
        { category: 'Additional', skills: 'Stakeholder updates, Excel' },
      ],
      certifications: [{ name: 'PRINCE2 Foundation', issuer: 'PeopleCert', year: '2021' }],
      projects: [],
    }),
    requirements: [
      requirement('req-salesforce', 'Salesforce administration', 'not_met', 'tool'),
      requirement('req-budget', 'Managed £2m budgets', 'unclear', 'experience'),
    ],
    unsupportedRequirements: ['req-salesforce', 'req-budget'],
    importantClaims: ['monthly status reports for six workstreams', 'PRINCE2 Foundation'],
    forbiddenClaims: ['Salesforce administration', 'Managed £2m budgets', 'unapproved registration ABC999'],
    absentLinks: ['https://not a valid url'],
    pageTendency: 'one-to-two-pages',
    knownVisualRisks: ['Long summary, duplicate-content pressure and malformed contact link.'],
  },
];

function filenameFor(blueprint: Blueprint, template: TemplateId): string {
  return `${blueprint.fileOccupation}_${blueprint.density}_${template}_v1.docx`;
}

export function goldenOutputFilename(fixture: GoldenCvFixture): string {
  const blueprint = BLUEPRINTS.find((candidate) => fixture.fixtureId.startsWith(candidate.id));
  if (!blueprint) throw new Error(`Unknown golden fixture ${fixture.fixtureId}`);
  return filenameFor(blueprint, fixture.template);
}

function fixtureFor(blueprint: Blueprint, template: TemplateId): GoldenCvFixture {
  const generationInput = { ...rewriteInput(blueprint), template };
  const structuredRewrite = makeStructuredGoldenOutput(
    blueprint.data,
    blueprint.refOverrides,
    blueprint.unsupportedRequirements ?? []
  );
  const adapted = structuredRewriteToRewrittenData(
    structuredRewrite,
    CV_TEMPLATE_CAPABILITIES[template].summaryMaxChars
  );
  const contentPlan = prioritizeCvContent({
    data: adapted.data,
    claimSourceRefs: adapted.claimSourceRefs,
    requirements: blueprint.requirements,
    pageLengthExpectation: CV_TEMPLATE_CAPABILITIES[template].pageLengthExpectation,
  });
  const spec = planCvBuildSpec({
    data: contentPlan.data,
    templateId: template,
    occupationId: blueprint.occupation,
    role: blueprint.targetRole,
    targetSource: 'stage4_fixture',
    contentPlan,
  });
  const firstExperience = contentPlan.data.experience[0];
  const dateStrings = firstExperience
    ? [formatDateRangeStyled(firstExperience.startDate, firstExperience.endDate, spec.presentation.dateStyle)]
    : [];
  const links = [
    `mailto:${adapted.data.contact.email}`,
    adapted.data.contact.linkedin?.startsWith('http')
      ? adapted.data.contact.linkedin
      : adapted.data.contact.linkedin
        ? `https://${adapted.data.contact.linkedin}`
        : '',
    adapted.data.contact.github?.startsWith('http')
      ? adapted.data.contact.github
      : adapted.data.contact.github
        ? `https://${adapted.data.contact.github}`
        : '',
    adapted.data.contact.website?.startsWith('http') ? adapted.data.contact.website : '',
  ].filter(Boolean);
  const provenanceSources = [...new Set(
    Object.values(adapted.claimSourceRefs).flat().map((ref) => ref.source)
  )];

  return {
    fixtureId: `${blueprint.id}-${template}`,
    fixtureVersion: 'v1',
    purpose: blueprint.purpose,
    occupation: blueprint.occupation,
    occupationLabel: blueprint.occupationLabel,
    targetRole: blueprint.targetRole,
    density: blueprint.density,
    template,
    evidenceSources: blueprint.evidenceSources,
    generationInput,
    structuredRewrite,
    expected: {
      sectionOrder: spec.provenance.sectionOrder,
      headings: spec.sections.map((section) => section.heading),
      contactFields: [adapted.data.contact.email, adapted.data.contact.location],
      claims: blueprint.importantClaims,
      forbiddenClaims: [
        ...(blueprint.forbiddenClaims ?? []),
        'req-', 'profile-', 'approval-', 'application-context-v1',
      ],
      links,
      absentLinks: blueprint.absentLinks ?? [],
      dateStrings,
      densityMode: spec.presentation.densityMode,
      pageTendency: blueprint.pageTendency,
      provenanceSources,
      unsupportedRequirements: blueprint.unsupportedRequirements ?? [],
      omissions: spec.provenance.omittedEmptySections,
      knownVisualRisks: blueprint.knownVisualRisks,
    },
  };
}

/** 7 scenarios × 4 templates: compact coverage without a wasteful Cartesian matrix. */
export const GOLDEN_CV_FIXTURES: GoldenCvFixture[] = BLUEPRINTS.flatMap((blueprint) =>
  TEMPLATE_IDS.map((template) => fixtureFor(blueprint, template))
);

export const GOLDEN_COVERAGE_RATIONALE =
  'Seven evidence scenarios are rendered in all four templates (28 documents). This proves every template against sparse, normal, dense, likely-multi-page, technical, regulated-healthcare, administration/operations, approved-profile, application-context and unsupported-evidence behaviour without multiplying equivalent edge cases.';

export const GOLDEN_CONTRACT_LIMITATIONS = [
  'No calibrated IT Support / Service Management occupation profile exists; that scenario uses the General profile.',
  'The canonical CvBuildSpec currently exposes summary, skills, experience, projects, education and certifications. Licences, registrations, training, languages and volunteering are validated as evidence-backed content within those existing sections; Stage 4 does not introduce new section types.',
  'Page counts and subjective quality cannot be proven from DOCX XML and remain visual-review concerns.',
];
