import type { TemplateId } from '@/shared/constants/templates';
import type { ApprovedCvPlan, CvPlanSection, ProfessionalLinkType } from './types';

export const CV_BUILD_SPEC_V2_VERSION = 4 as const;

export interface CvPresentationIdentity {
  fullName: string;
  headline?: string;
  email?: string;
  phone?: string;
  location?: string;
}

export interface CvPresentationLine {
  id: string;
  text: string;
}

export interface CvPresentationLink {
  id: string;
  label: string;
  url: string;
  type: ProfessionalLinkType;
}

interface CvPresentationEntityBase {
  id: string;
  lines: CvPresentationLine[];
  links: CvPresentationLink[];
}

export interface CvPresentationExperience extends CvPresentationEntityBase {
  title: string;
  employer: string;
  location?: string;
  employmentType?: string;
  startDate?: string;
  endDate?: string;
}

export interface CvPresentationProject extends CvPresentationEntityBase {
  name: string;
  subtitle?: string;
  startDate?: string;
  endDate?: string;
  technologies: string[];
}

export interface CvPresentationEducation extends CvPresentationEntityBase {
  degree: string;
  institution: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  grade?: string;
}

export interface CvPresentationSkillGroup {
  id: string;
  category: string;
  skills: Array<{ id: string; name: string }>;
}

export interface CvPresentationCertification extends CvPresentationEntityBase {
  name: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  credentialId?: string;
  credentialUrl?: string;
}

export interface CvPresentationTraining extends CvPresentationEntityBase {
  course: string;
  provider?: string;
  field?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  result?: string;
}

export interface CvPresentationVolunteerExperience extends CvPresentationEntityBase {
  role: string;
  organisation: string;
  startDate?: string;
  endDate?: string;
}

export interface CvPresentationOpenSource extends CvPresentationEntityBase {
  projectName: string;
  role?: string;
  repositoryUrl?: string;
  projectUrl?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  technologies: string[];
}

export interface CvPresentationOtherEvidence extends CvPresentationEntityBase {
  title: string;
  context?: string;
  period?: string;
}

export interface CvEvidenceBinding {
  nodeId: string;
  evidenceIds: string[];
  representativeEvidenceId?: string;
}

type EntitySection<TType extends CvPlanSection, TItem> = { type: TType; heading: string; items: TItem[] };
type LineSection<TType extends CvPlanSection> = { type: TType; heading: string; lines: CvPresentationLine[] };

export type CvBuildSectionV2 =
  | LineSection<'PROFILE' | 'EXECUTIVE_SUMMARY' | 'SELECTED_IMPACT'>
  | EntitySection<'CORE_EXPERTISE' | 'SKILLS', CvPresentationSkillGroup>
  | EntitySection<'EXPERIENCE', CvPresentationExperience>
  | EntitySection<'PROJECTS', CvPresentationProject>
  | EntitySection<'EDUCATION', CvPresentationEducation>
  | EntitySection<'CERTIFICATIONS', CvPresentationCertification>
  | EntitySection<'TRAINING', CvPresentationTraining>
  | EntitySection<'VOLUNTEERING', CvPresentationVolunteerExperience>
  | EntitySection<'OPEN_SOURCE', CvPresentationOpenSource>
  | EntitySection<'OTHER', CvPresentationOtherEvidence>;

export interface CvBuildSpecV2 {
  version: typeof CV_BUILD_SPEC_V2_VERSION;
  generationId: string;
  identity: CvPresentationIdentity;
  links: CvPresentationLink[];
  sections: CvBuildSectionV2[];
  evidenceBindings: CvEvidenceBinding[];
  presentation: { templateId: TemplateId; density: ApprovedCvPlan['density']; targetLength: ApprovedCvPlan['targetLength'] };
  provenance: { approvedEvidenceIds: string[]; omittedEvidenceIds: string[]; sourceMode: ApprovedCvPlan['sourceMode']; atsStrategy: ApprovedCvPlan['atsStrategy'] };
}
