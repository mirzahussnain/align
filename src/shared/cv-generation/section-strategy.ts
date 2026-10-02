import type { CvPlanSection, CvTargetStrategy, UnifiedCandidateEvidence } from './types';

export interface SectionStrategyTarget {
  seniority?: string;
  careerChanger?: boolean;
  regulated?: boolean;
  academic?: boolean;
}

const present = (evidence: UnifiedCandidateEvidence, section: CvPlanSection) => {
  if (section === 'PROFILE' || section === 'EXECUTIVE_SUMMARY') return true;
  if (section === 'CORE_EXPERTISE' || section === 'SKILLS') return evidence.skills.length > 0;
  if (section === 'EXPERIENCE') return evidence.employment.length > 0;
  if (section === 'SELECTED_IMPACT') return evidence.achievements.length > 0;
  if (section === 'PROJECTS') return evidence.projects.length > 0;
  if (section === 'EDUCATION') return evidence.education.length > 0;
  if (section === 'CERTIFICATIONS') return evidence.certifications.length > 0;
  if (section === 'TRAINING') return evidence.training.length > 0;
  if (section === 'VOLUNTEERING') return evidence.volunteerExperience.length > 0;
  if (section === 'OPEN_SOURCE') return evidence.openSource.length > 0;
  return evidence.otherEvidence.length > 0;
};

export function chooseSectionStrategy(evidence: UnifiedCandidateEvidence, target: SectionStrategyTarget, profileOnly: boolean): { strategy: CvTargetStrategy; order: CvPlanSection[] } {
  let strategy: CvTargetStrategy;
  let order: CvPlanSection[];
  if (target.academic) {
    strategy = 'ACADEMIC_RESEARCH';
    order = ['PROFILE', 'EDUCATION', 'EXPERIENCE', 'PROJECTS', 'SKILLS', 'CERTIFICATIONS', 'TRAINING', 'OTHER'];
  } else if (target.regulated && evidence.certifications.length + evidence.education.length >= evidence.employment.length) {
    strategy = 'CREDENTIAL_HEAVY';
    order = ['PROFILE', 'EDUCATION', 'CERTIFICATIONS', 'EXPERIENCE', 'SKILLS', 'TRAINING', 'PROJECTS', 'VOLUNTEERING'];
  } else if (target.careerChanger) {
    strategy = 'CAREER_CHANGER';
    order = ['PROFILE', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE'];
  } else if ((target.seniority === 'senior' || target.seniority === 'lead') && evidence.employment.length >= 2) {
    strategy = 'SENIOR_LEAD';
    order = ['EXECUTIVE_SUMMARY', 'CORE_EXPERTISE', 'EXPERIENCE', 'SELECTED_IMPACT', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'OPEN_SOURCE'];
  } else if (target.seniority === 'entry' || evidence.projects.length > evidence.employment.length) {
    strategy = 'JUNIOR_PROJECT_HEAVY';
    order = ['PROFILE', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE'];
  } else {
    strategy = profileOnly ? 'PROFILE_ONLY' : 'EXPERIENCE_FORWARD';
    order = ['PROFILE', 'EXPERIENCE', 'SKILLS', 'PROJECTS', 'EDUCATION', 'CERTIFICATIONS', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER'];
  }
  return { strategy, order: order.filter((section) => present(evidence, section)) };
}
